import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// GET: list snapshots; if called by Vercel cron OR with ?write=1, also writes today's snapshot first.
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response

  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const wantsWrite = req.nextUrl.searchParams.get('write') === '1'
  if (isVercelCron || wantsWrite) {
    // Write today's snapshot — idempotent via upsert on snapshot_date
    return POST(req)
  }

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '90'), 7), 1825)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const { data, error } = await supabase
    .from('finance_net_worth_snapshots')
    .select('*')
    .gte('snapshot_date', since.toISOString().slice(0, 10))
    .order('snapshot_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const snapshots = data || []
  const latest = snapshots[snapshots.length - 1]
  const earliest = snapshots[0]
  const delta = latest && earliest ? latest.net_worth - earliest.net_worth : 0
  const deltaPct = earliest && earliest.net_worth !== 0 ? Math.round((delta / Math.abs(earliest.net_worth)) * 1000) / 10 : 0

  return NextResponse.json({
    snapshots,
    summary: {
      count: snapshots.length,
      latest: latest ? { date: latest.snapshot_date, net_worth: latest.net_worth, total_assets: latest.total_assets, total_liabilities: latest.total_liabilities } : null,
      delta,
      delta_pct: deltaPct,
    },
  })
}

// POST: write a snapshot for today (idempotent — replaces today's row)
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response

  const today = new Date().toISOString().slice(0, 10)

  const [
    { data: cryptoHoldings },
    { data: stocks },
    { data: fixedIncome },
    { data: realEstate },
    { data: retirement },
    { data: ef },
    { data: debts },
    { data: installments },
  ] = await Promise.all([
    supabase.from('finance_crypto_holdings').select('*'),
    supabase.from('finance_stock_holdings').select('*'),
    supabase.from('finance_fixed_income').select('*'),
    supabase.from('finance_real_estate').select('*'),
    supabase.from('finance_retirement').select('*'),
    supabase.from('finance_emergency_fund').select('*').order('created_at', { ascending: false }).limit(1),
    supabase.from('finance_debts').select('*').eq('is_active', true),
    supabase.from('finance_installments').select('*').eq('is_active', true),
  ])

  // Live crypto prices (best-effort; fall back to cost basis if unavailable)
  let cryptoTotalMXN = 0
  try {
    const holdings = (cryptoHoldings || []).filter((h: { quantity?: number }) => (h.quantity ?? 0) > 0)
    if (holdings.length > 0) {
      const geckoIds: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' }
      const ids = [...new Set(holdings.map((h: { symbol: string }) => geckoIds[h.symbol]).filter(Boolean))].join(',')
      let prices: Record<string, number> = {}
      try {
        const pRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=mxn`, { next: { revalidate: 300 } })
        if (pRes.ok) {
          const pData = await pRes.json()
          for (const [sym, gId] of Object.entries(geckoIds)) {
            const coin = pData[gId]
            if (coin) prices[sym] = coin.mxn ?? 0
          }
        }
      } catch { /* ignore — fall back below */ }
      for (const h of holdings) {
        const priceMXN = prices[h.symbol] ?? 0
        if (priceMXN > 0) {
          cryptoTotalMXN += h.quantity * priceMXN
        } else if (h.avg_cost_basis_usd) {
          // Fallback to USD cost basis * 17 MXN/USD
          cryptoTotalMXN += h.quantity * h.avg_cost_basis_usd * 17
        }
      }
    }
  } catch (e) {
    console.error('Crypto valuation failed:', e)
  }

  // Stocks: use current_price * shares if available, else cost basis
  const stocksTotal = (stocks || []).reduce((s: number, x: { shares?: number; current_price_mxn?: number; current_price?: number; avg_cost_basis?: number; currency?: string }) => {
    const shares = x.shares || 0
    const fxRate = (x.currency === 'USD') ? 17 : 1
    const price = x.current_price_mxn ?? (x.current_price ? x.current_price * fxRate : 0)
    const value = price > 0 ? shares * price : (x.avg_cost_basis ? shares * x.avg_cost_basis * fxRate : 0)
    return s + value
  }, 0)

  // Fixed income: principal + accrued (simple — just principal)
  const fixedIncomeTotal = (fixedIncome || []).reduce((s: number, x: { principal?: number }) => s + (x.principal || 0), 0)

  // Real estate: equity = current_value - mortgage_balance
  const realEstateTotal = (realEstate || []).reduce((s: number, x: { current_value?: number; mortgage_balance?: number }) => {
    return s + Math.max(0, (x.current_value || 0) - (x.mortgage_balance || 0))
  }, 0)

  // Retirement
  const retirementTotal = (retirement || []).reduce((s: number, x: { current_balance?: number }) => s + (x.current_balance || 0), 0)

  // Cash proxy: emergency fund balance (we don't track bank balances directly)
  const cashTotal = ef && ef[0] ? (ef[0].current_amount || 0) : 0

  const totalAssets = cryptoTotalMXN + stocksTotal + fixedIncomeTotal + realEstateTotal + retirementTotal + cashTotal

  // Liabilities
  const debtsTotal = (debts || []).reduce((s: number, d: { balance?: number }) => s + (d.balance || 0), 0)
  const msiRemaining = (installments || []).reduce((s: number, i: { installment_amount?: number; installment_count?: number; payments_made?: number }) => {
    const remaining = (i.installment_count || 0) - (i.payments_made || 0)
    return s + Math.max(0, remaining * (i.installment_amount || 0))
  }, 0)
  const totalLiabilities = debtsTotal + msiRemaining

  // Upsert today's snapshot (replace if already exists)
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    snapshot_date: today,
    total_assets: Math.round(totalAssets),
    total_liabilities: Math.round(totalLiabilities),
    net_worth: Math.round(totalAssets - totalLiabilities),
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
  })
}
