import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest, type AuthOk } from '@/lib/finance-api-auth'
import { accruedValue } from '@/lib/fixed-income'
import { fetchCryptoPrices, impliedUsdMxn, type CryptoPrices } from '@/lib/crypto-prices'
import { addDaysKey, mexicoCityToday } from '@/lib/dates'
import { configErrorResponse, getAdminClient, withDegradedHeader } from '@/lib/supabase-admin'
import { getWestProjection } from '@/lib/server/west'
import { isWestProperty, propertyEquity, type PropertyLike, type WestPaidToDate } from '@/lib/property-equity'
import { stockValueMXN } from '@/components/finance/investments/portfolio'
import type { StockHolding } from '@/components/finance/investments/types'
import { recordRun, triggerFromAuth } from '@/lib/automation/runs'

// Used only when no live rate is available (no priced coin today).
const USD_MXN_FALLBACK = Number(process.env.USD_MXN_FALLBACK) || 18.5


function client(): SupabaseClient | Response {
  try {
    return getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
}

// GET: list snapshots. Only a Vercel cron (Bearer CRON_SECRET) writes today's
// snapshot first; users and scripts POST (a GET link must never write).
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response

  if (auth.method === 'cron') {
    return writeSnapshot(req, auth)
  }

  const supabase = client()
  if (supabase instanceof Response) return supabase

  // Home only needs the newest row (perf-13).
  if (req.nextUrl.searchParams.get('latest') === '1') {
    const { data, error } = await supabase
      .from('finance_net_worth_snapshots')
      .select('*')
      .order('snapshot_date', { ascending: false })
      .limit(1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const latest = data?.[0]
    return withDegradedHeader(NextResponse.json({
      snapshot: latest ?? null,
      summary: { latest: latest ? { date: latest.snapshot_date, net_worth: latest.net_worth, total_assets: latest.total_assets, total_liabilities: latest.total_liabilities, stocks_amount: latest.stocks_amount } : null },
    }, { headers: { 'Cache-Control': 'private, no-store' } }))
  }

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '90') || 90, 7), 1825)
  const since = addDaysKey(mexicoCityToday(), -days)

  const { data, error } = await supabase
    .from('finance_net_worth_snapshots')
    .select('*')
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const snapshots = data || []
  const latest = snapshots[snapshots.length - 1]
  const earliest = snapshots[0]
  const delta = latest && earliest ? latest.net_worth - earliest.net_worth : 0
  const deltaPct = earliest && earliest.net_worth !== 0 ? Math.round((delta / Math.abs(earliest.net_worth)) * 1000) / 10 : 0

  return withDegradedHeader(NextResponse.json({
    snapshots,
    summary: {
      count: snapshots.length,
      latest: latest ? { date: latest.snapshot_date, net_worth: latest.net_worth, total_assets: latest.total_assets, total_liabilities: latest.total_liabilities, stocks_amount: latest.stocks_amount } : null,
      delta,
      delta_pct: deltaPct,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } }))
}

// POST: write today's snapshot (idempotent — replaces today's row)
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response
  return writeSnapshot(req, auth)
}

async function writeSnapshot(req: NextRequest, auth: AuthOk) {
  const supabase = client()
  if (supabase instanceof Response) return supabase
  const startedAt = new Date()
  // The household's calendar day: a run after 18:00 CDMX is still "today" there.
  const today = mexicoCityToday(startedAt)
  const trigger = triggerFromAuth(auth.method, req)
  const fail = async (message: string) => {
    await recordRun(supabase, { job: 'net-worth', trigger, started_at: startedAt, status: 'error', error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const reads = await Promise.all([
    supabase.from('finance_crypto_holdings').select('*'),
    supabase.from('finance_stock_holdings').select('*'),
    supabase.from('finance_fixed_income').select('*'),
    supabase.from('finance_real_estate').select('*'),
    supabase.from('finance_retirement').select('*'),
    supabase.from('finance_emergency_fund').select('*').order('created_at', { ascending: false }).limit(1),
    supabase.from('finance_debts').select('*').eq('is_active', true),
    supabase.from('finance_installments').select('*').eq('is_active', true),
  ])
  // A failed read would silently write a too-low net worth; refuse instead.
  const readError = reads.find(r => r.error)?.error
  if (readError) return fail(`snapshot read failed: ${readError.message}`)
  const [cryptoHoldings, stocks, fixedIncome, realEstate, retirement, ef, debts, installments] = reads.map(r => r.data || [])

  // Fallbacks taken while valuing: the run is recorded as 'warning' (not 'ok')
  // so a snapshot built from stale inputs shows up in the automation panel.
  const warnings: string[] = []

  // Live crypto prices (best-effort; fall back to cost basis if unavailable)
  let cryptoTotalMXN = 0
  let prices: CryptoPrices | null = null
  try {
    const holdings = cryptoHoldings.filter((h: { quantity?: number }) => (h.quantity ?? 0) > 0)
    if (holdings.length > 0) {
      prices = await fetchCryptoPrices(holdings.map((h: { symbol: string }) => h.symbol)) ?? {}
      for (const h of holdings) {
        const priceMXN = prices[h.symbol]?.mxn ?? 0
        if (priceMXN > 0) {
          cryptoTotalMXN += h.quantity * priceMXN
        } else if (h.avg_cost_basis_usd) {
          // No live price: fall back to cost basis (avg_cost_basis_usd stores MXN despite its name)
          cryptoTotalMXN += h.quantity * h.avg_cost_basis_usd
          warnings.push(`no live price for ${h.symbol} — valued at cost basis`)
        }
      }
    }
  } catch (e) {
    console.error('Crypto valuation failed:', e)
    warnings.push('crypto prices unavailable — valued at cost basis')
  }

  const liveRate = impliedUsdMxn(prices)
  const usdMxn = liveRate ?? USD_MXN_FALLBACK
  const needsUsd = stocks.some((x: { currency?: string; asset_type?: string }) => x.currency === 'USD' || x.asset_type === 'private_equity')
  if (!liveRate && needsUsd) warnings.push(`no live USD/MXN rate — used fallback ${USD_MXN_FALLBACK}`)

  // Private equity is an estimate at current_price_usd × the live USD/MXN rate —
  // the same stockValueMXN the Investments page uses. Other holdings: a stored
  // price if the row has one, else cost basis.
  const stocksTotal = stocks.reduce((s: number, x: { asset_type?: string; shares?: number; current_price_usd?: number; current_price_mxn?: number; current_price?: number; avg_cost_basis?: number; currency?: string }) => {
    if (x.asset_type === 'private_equity') return s + stockValueMXN(x as StockHolding, usdMxn)
    const shares = x.shares || 0
    const fxRate = x.currency === 'USD' ? usdMxn : 1
    const price = x.current_price_mxn ?? (x.current_price ? x.current_price * fxRate : 0)
    const value = price > 0 ? shares * price : (x.avg_cost_basis ? shares * x.avg_cost_basis * fxRate : 0)
    return s + value
  }, 0)

  // Fixed income: principal accrued at the net rate since last confirmed.
  const fixedIncomeTotal = fixedIncome.reduce((s: number, x) => s + accruedValue(x), 0)

  // Real estate: equity = value − still owed. For the pre-sale WEST unit the
  // amount owed comes from the WEST tracker's paid-to-date (posted payments
  // roll in monthly), not the static mortgage_balance from February (F13).
  let west: WestPaidToDate | null = null
  try {
    const projection = await getWestProjection(supabase, { now: startedAt })
    west = { target: projection.target, paid: projection.current_status.amount_paid }
  } catch (e) {
    west = null
    if (realEstate.some((x: PropertyLike) => isWestProperty(x))) {
      warnings.push(`WEST projection unavailable — used mortgage_balance (${e instanceof Error ? e.message : String(e)})`)
    }
  }
  const realEstateBasis: string[] = []
  const realEstateTotal = realEstate.reduce((s: number, x: PropertyLike) => {
    const isWest = !!west && isWestProperty(x)
    realEstateBasis.push(`${x.name || 'property'}:${isWest ? 'west-paid-to-date' : 'mortgage_balance'}`)
    return s + Math.max(0, propertyEquity(x, west))
  }, 0)

  const retirementTotal = retirement.reduce((s: number, x: { current_balance?: number }) => s + (x.current_balance || 0), 0)

  // Cash proxy: emergency fund balance (we don't track bank balances directly)
  const cashTotal = ef[0] ? (ef[0].current_amount || 0) : 0

  const totalAssets = cryptoTotalMXN + stocksTotal + fixedIncomeTotal + realEstateTotal + retirementTotal + cashTotal

  const debtsTotal = debts.reduce((s: number, d: { balance?: number }) => s + (d.balance || 0), 0)
  const msiRemaining = installments.reduce((s: number, i: { installment_amount?: number; installment_count?: number; payments_made?: number }) => {
    const remaining = (i.installment_count || 0) - (i.payments_made || 0)
    return s + Math.max(0, remaining * (i.installment_amount || 0))
  }, 0)
  const totalLiabilities = debtsTotal + msiRemaining

  const { error } = await supabase
    .from('finance_net_worth_snapshots')
    .upsert({
      snapshot_date: today,
      total_assets: Math.round(totalAssets),
      total_liabilities: Math.round(totalLiabilities),
      cash_amount: Math.round(cashTotal),
      crypto_amount: Math.round(cryptoTotalMXN),
      stocks_amount: Math.round(stocksTotal),
      fixed_income_amount: Math.round(fixedIncomeTotal),
      real_estate_amount: Math.round(realEstateTotal),
      retirement_amount: Math.round(retirementTotal),
    }, { onConflict: 'snapshot_date' })

  if (error) return fail(error.message)

  const netWorth = Math.round(totalAssets - totalLiabilities)
  await recordRun(supabase, {
    job: 'net-worth',
    trigger,
    started_at: startedAt,
    status: warnings.length === 0 ? 'ok' : 'warning',
    created_count: 1,
    details: { snapshot_date: today, net_worth: netWorth, usd_mxn: usdMxn, usd_mxn_source: liveRate ? 'live' : 'fallback', real_estate_basis: realEstateBasis, ...(warnings.length ? { warnings } : {}) },
  })

  return withDegradedHeader(NextResponse.json({
    success: true,
    snapshot_date: today,
    total_assets: Math.round(totalAssets),
    total_liabilities: Math.round(totalLiabilities),
    net_worth: netWorth,
    usd_mxn: Math.round(usdMxn * 10000) / 10000,
    usd_mxn_source: liveRate ? 'live' : 'fallback',
    breakdown: {
      cash: Math.round(cashTotal),
      crypto: Math.round(cryptoTotalMXN),
      stocks: Math.round(stocksTotal),
      fixed_income: Math.round(fixedIncomeTotal),
      real_estate: Math.round(realEstateTotal),
      retirement: Math.round(retirementTotal),
      debts: Math.round(debtsTotal),
      msi_remaining: Math.round(msiRemaining),
    },
  }, { headers: { 'Cache-Control': 'no-store' } }))
}
