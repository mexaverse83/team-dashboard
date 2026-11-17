import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { isValidDateKey, mexicoCityToday } from '@/lib/dates'
import { fetchUsdMxn } from '@/lib/stock-prices'
import { isPrivateEquity } from '@/lib/stock-portfolio'
import {
  MIGRATION_PENDING, OPENING_COST_REQUIRED, PENDING_STOCK_MIGRATION_MESSAGE, SHARE_EPSILON,
  isMissingStockTxTable, replayStockLedger, roundShares, txTotal, type PriceCurrency, type StockTx,
} from '@/lib/stock-ledger'

// Buys and sells of public stocks. Each write replays the holding's ledger
// into its shares and average cost (src/lib/stock-ledger.ts). Private equity
// rows are never touched here. Before supabase-2026-11-stock-transactions.sql
// is applied the table doesn't exist: writes answer 409 "database update
// pending" and GET says so with `migration_pending`.

const TX_TABLE = 'finance_stock_transactions'
const HOLDINGS = 'finance_stock_holdings'
const NO_STORE = { 'Cache-Control': 'no-store' }

type Db = SupabaseClient
type DbError = { code?: string; message: string } | null
interface Holding { id: string; ticker: string; shares: number | string; avg_cost_basis: number | string | null; currency: string | null; asset_type: string | null; created_at?: string | null }
type TxRow = StockTx & { id: string; transaction_date: string; created_at?: string }

function pendingResponse() {
  return NextResponse.json({ error: PENDING_STOCK_MIGRATION_MESSAGE, code: MIGRATION_PENDING }, { status: 409, headers: NO_STORE })
}

function dbFailure(error: NonNullable<DbError>) {
  if (isMissingStockTxTable(error)) return pendingResponse()
  console.error('Stock transactions error:', error)
  return NextResponse.json({ error: error.message || 'Database error' }, { status: 500, headers: NO_STORE })
}

const holdingCurrency = (h: Holding): PriceCurrency => (h.currency === 'MXN' ? 'MXN' : 'USD')

async function loadTxs(sb: Db, holdingId: string) {
  return sb.from(TX_TABLE).select('*').eq('holding_id', holdingId)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true }) as unknown as Promise<{ data: TxRow[] | null; error: DbError }>
}

async function loadHolding(sb: Db, id: string) {
  return sb.from(HOLDINGS).select('*').eq('id', id).maybeSingle() as unknown as Promise<{ data: Holding | null; error: DbError }>
}

const fmtShares = (n: number) => String(Number(n.toPrecision(12)))

type Problem = { response: Response }

/**
 * Same safeguard as crypto: a holding entered as a plain balance (or edited by
 * hand) holds more shares than its transactions explain. Recalculating from
 * the transactions alone would wipe that balance, so the difference is
 * recorded first as an opening-balance buy at the holding's own average cost.
 *
 * A balance with no cost is different: those shares cost an unknown amount,
 * and blending a priced buy with them at 0 would invent a gain. A buy then
 * needs `openingCostPerShare` (in the holding's currency), which also prices
 * any opening lot recorded earlier at 0. Sells and deletes go ahead.
 */
async function ensureOpeningBalance(
  sb: Db, holding: Holding, txs: TxRow[],
  { forBuy = false, openingCostPerShare = null }: { forBuy?: boolean; openingCostPerShare?: number | null } = {},
): Promise<Problem | null> {
  const currency = holdingCurrency(holding)
  const held = Number(holding.shares) || 0
  const replay = replayStockLedger(txs, { currency })
  const gap = roundShares(held - replay.shares)
  const avg = Number(holding.avg_cost_basis) || 0
  const unbased = !(avg > 0) && (gap > SHARE_EPSILON || (replay.shares > SHARE_EPSILON && replay.cost <= 0))

  if (unbased && forBuy) {
    if (!(openingCostPerShare && openingCostPerShare > 0)) {
      const shares = Math.max(held, replay.shares)
      return {
        response: NextResponse.json({
          error: `Enter what the ${fmtShares(shares)} ${holding.ticker} shares already held cost per share before logging a buy, or P/L would count them as free.`,
          code: OPENING_COST_REQUIRED,
          shares,
        }, { status: 409 }),
      }
    }
    for (const tx of txs) {
      if (tx.type !== 'buy') continue
      const q = Number(tx.shares) || 0
      if (q > 0 && !(txTotal(tx) > 0)) {
        const { error } = await sb.from(TX_TABLE)
          .update({ price: openingCostPerShare, price_currency: currency, commission: 0, total: q * openingCostPerShare })
          .eq('id', tx.id)
        if (error) return { response: dbFailure(error) }
      }
    }
  }
  if (gap <= SHARE_EPSILON) return null

  const openingCost = avg > 0
    ? Math.max(0, held * avg - replay.cost)
    : unbased && forBuy && openingCostPerShare ? gap * openingCostPerShare : 0
  const created = mexicoCityToday(holding.created_at ? new Date(holding.created_at) : undefined)
  const firstTx = txs[0]?.transaction_date
  const { error } = await sb.from(TX_TABLE).insert({
    holding_id: holding.id,
    type: 'buy',
    shares: gap,
    price: openingCost / gap,
    price_currency: currency,
    fx_usd_mxn: null,
    commission: 0,
    total: openingCost,
    broker: null,
    notes: 'Opening balance (held before transactions were logged)',
    transaction_date: firstTx && firstTx < created ? firstTx : created,
  })
  return error ? { response: dbFailure(error) } : null
}

async function recalcHolding(sb: Db, holding: Holding): Promise<DbError> {
  const { data: txs, error } = await loadTxs(sb, holding.id)
  if (error || !txs) return error
  const { shares, avgCost } = replayStockLedger(txs, { currency: holdingCurrency(holding) })
  const { error: updateError } = await sb.from(HOLDINGS)
    .update({ shares, avg_cost_basis: shares > 0 ? avgCost : null, updated_at: new Date().toISOString() })
    .eq('id', holding.id)
  return updateError
}

/** The holding for a write, refusing private equity. */
async function writableHolding(sb: Db, holdingId: unknown): Promise<Holding | Problem> {
  if (typeof holdingId !== 'string' || !holdingId) return { response: NextResponse.json({ error: 'Missing holding_id' }, { status: 400 }) }
  const { data, error } = await loadHolding(sb, holdingId)
  if (error) return { response: dbFailure(error) }
  if (!data) return { response: NextResponse.json({ error: 'Holding not found' }, { status: 404 }) }
  if (isPrivateEquity(data)) return { response: NextResponse.json({ error: 'Private equity has no transaction ledger' }, { status: 409 }) }
  return data
}

const isProblem = (x: unknown): x is Problem => !!x && typeof x === 'object' && 'response' in x

// GET: the latest transactions (all holdings, or ?holding_id=).
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  let sb: Db
  try { sb = getAdminClient() } catch (e) { return configErrorResponse(e) }

  let query = sb.from(TX_TABLE)
    .select('*, finance_stock_holdings!inner(ticker, owner, currency, asset_type)')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  const holdingId = req.nextUrl.searchParams.get('holding_id')
  if (holdingId) query = query.eq('holding_id', holdingId)

  const { data, error } = await query
  if (error) {
    // Not an error: the ledger simply doesn't exist yet. Say so explicitly.
    if (isMissingStockTxTable(error)) return NextResponse.json({ transactions: [], migration_pending: true, message: PENDING_STOCK_MIGRATION_MESSAGE }, { headers: NO_STORE })
    console.error('Stock transactions GET error:', error)
    return NextResponse.json({ error: 'Failed to load stock transactions' }, { status: 500, headers: NO_STORE })
  }
  const transactions = (data || []).map((tx: Record<string, unknown>) => {
    const h = tx.finance_stock_holdings as Record<string, unknown> | null
    const { finance_stock_holdings: _joined, ...rest } = tx
    void _joined
    return { ...rest, ticker: h?.ticker ?? '', owner: h?.owner ?? '', holding_currency: h?.currency ?? 'USD' }
  })
  return NextResponse.json({ transactions, migration_pending: false }, { headers: NO_STORE })
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
const nonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

// POST: log a buy or sell, then recalculate the holding.
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { holding_id, type, shares, price, commission = 0, fx_usd_mxn, broker, notes, transaction_date, opening_cost_per_share } = body
  const priceCurrency = body.price_currency ?? 'USD'
  if (type !== 'buy' && type !== 'sell') return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  if (!positive(shares)) return NextResponse.json({ error: 'Shares must be a positive number' }, { status: 400 })
  if (!nonNegative(price) || (type === 'buy' && !(price > 0))) return NextResponse.json({ error: 'Invalid price' }, { status: 400 })
  if (priceCurrency !== 'USD' && priceCurrency !== 'MXN') return NextResponse.json({ error: 'Invalid price currency' }, { status: 400 })
  if (!nonNegative(commission)) return NextResponse.json({ error: 'Invalid commission' }, { status: 400 })
  if (fx_usd_mxn !== undefined && fx_usd_mxn !== null && !(positive(fx_usd_mxn) && fx_usd_mxn > 5 && fx_usd_mxn < 50)) {
    return NextResponse.json({ error: 'Invalid USD/MXN rate' }, { status: 400 })
  }
  if (opening_cost_per_share !== undefined && opening_cost_per_share !== null && !positive(opening_cost_per_share)) {
    return NextResponse.json({ error: 'opening_cost_per_share must be a positive number' }, { status: 400 })
  }
  if (transaction_date !== undefined && transaction_date !== null && transaction_date !== '' && !isValidDateKey(String(transaction_date))) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
  }

  let sb: Db
  try { sb = getAdminClient() } catch (e) { return configErrorResponse(e) }

  const holding = await writableHolding(sb, holding_id)
  if (isProblem(holding)) return holding.response
  const currency = holdingCurrency(holding)

  const { data: txs, error: txError } = await loadTxs(sb, holding.id)
  if (txError) return dbFailure(txError)

  // The rate on the day: needed to convert between the price and the holding's
  // currency, and kept on every USD row for MXN reporting.
  let fx = positive(fx_usd_mxn) ? fx_usd_mxn : null
  if (!fx && (priceCurrency === 'USD' || priceCurrency !== currency)) fx = (await fetchUsdMxn())?.rate ?? null
  if (!fx && priceCurrency !== currency) {
    return NextResponse.json({ error: 'No USD/MXN rate available right now: enter the rate of the day to log a price in another currency.' }, { status: 409 })
  }

  if (type === 'sell') {
    const held = Math.max(Number(holding.shares) || 0, replayStockLedger(txs || [], { currency }).shares)
    if (shares > held + SHARE_EPSILON) {
      return NextResponse.json({ error: `You hold only ${fmtShares(held)} ${holding.ticker} shares.` }, { status: 400 })
    }
  }

  const opening = await ensureOpeningBalance(sb, holding, txs || [], { forBuy: type === 'buy', openingCostPerShare: (opening_cost_per_share as number | null | undefined) ?? null })
  if (opening) return opening.response

  const row = {
    holding_id: holding.id,
    type,
    shares: roundShares(shares),
    price,
    price_currency: priceCurrency,
    fx_usd_mxn: fx,
    commission,
    total: txTotal({ type, shares, price, commission }),
    broker: typeof broker === 'string' && broker.trim() ? broker.trim().slice(0, 40) : null,
    notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 500) : null,
    transaction_date: transaction_date ? String(transaction_date) : mexicoCityToday(),
  }
  const { data, error } = await sb.from(TX_TABLE).insert(row).select().single()
  if (error) return dbFailure(error)

  const recalcError = await recalcHolding(sb, holding)
  if (recalcError) return dbFailure(recalcError)
  return NextResponse.json(data, { status: 201 })
}

// DELETE: remove one transaction ({ id, holding_id }) and recalculate.
export async function DELETE(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body?.id || !body?.holding_id) return NextResponse.json({ error: 'Missing id/holding_id' }, { status: 400 })

  let sb: Db
  try { sb = getAdminClient() } catch (e) { return configErrorResponse(e) }

  const holding = await writableHolding(sb, body.holding_id)
  if (isProblem(holding)) return holding.response
  const { data: txs, error: txError } = await loadTxs(sb, holding.id)
  if (txError) return dbFailure(txError)
  if (!(txs || []).some(t => t.id === body.id)) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  const opening = await ensureOpeningBalance(sb, holding, txs || [])
  if (opening) return opening.response
  const { error } = await sb.from(TX_TABLE).delete().eq('id', body.id).eq('holding_id', holding.id)
  if (error) return dbFailure(error)

  const recalcError = await recalcHolding(sb, holding)
  if (recalcError) return dbFailure(recalcError)
  return NextResponse.json({ ok: true })
}
