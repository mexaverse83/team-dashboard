import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { mexicoCityToday } from '@/lib/dates'
import { OPENING_COST_REQUIRED, replayHolding } from '@/lib/crypto-ledger'

const getSupabase = () => getAdminClient()

const QTY_EPSILON = 1e-9

async function loadHoldingTxs(sb: ReturnType<typeof getSupabase>, holdingId: string) {
  return sb
    .from('crypto_transactions')
    .select('*')
    .eq('holding_id', holdingId)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true })
}

type OpeningResult = { error: string; status: number; quantity?: number } | null

/**
 * Holdings entered as a plain balance (or edited by hand) hold more coins than
 * their transactions explain. Recalculating from transactions alone would wipe
 * that balance, so record the difference as an opening-balance buy first, at
 * the holding's own average cost.
 *
 * A holding with no cost basis is different: its opening coins cost an unknown
 * amount. Recording them at 0 and then blending in a priced buy would invent a
 * gain (1,000 KAS at 0 + 500 at 2 MXN → avg 0.67, +200% at 2 MXN). So a buy
 * on such a holding needs `openingCostPerCoin` (MXN): it prices the untracked
 * balance and any opening lot already recorded at 0. Sells and deletes don't
 * create a basis, so they go ahead and the coin stays "no cost basis".
 */
async function ensureOpeningBalance(
  holdingId: string,
  { forBuy = false, openingCostPerCoin = null }: { forBuy?: boolean; openingCostPerCoin?: number | null } = {},
): Promise<OpeningResult> {
  const sb = getSupabase()
  const [{ data: holding, error: hErr }, { data: txs, error: tErr }] = await Promise.all([
    sb.from('finance_crypto_holdings').select('quantity, avg_cost_basis_usd, created_at, symbol').eq('id', holdingId).maybeSingle(),
    loadHoldingTxs(sb, holdingId),
  ])
  if (hErr || tErr) return { error: (hErr || tErr)!.message, status: 500 }
  if (!holding) return { error: 'Holding not found', status: 404 }

  const held = Number(holding.quantity) || 0
  const replay = replayHolding(txs || [])
  const gap = held - replay.qty
  const avg = Number(holding.avg_cost_basis_usd) || 0 // stores MXN despite column name
  const unbased = !(avg > 0) && (gap > QTY_EPSILON || (replay.qty > QTY_EPSILON && replay.totalCost <= 0))

  if (unbased && forBuy) {
    if (!(openingCostPerCoin && openingCostPerCoin > 0)) {
      return {
        error: `Enter what the ${formatQty(Math.max(held, replay.qty))} ${holding.symbol || 'coins'} already held cost per coin before logging a buy, or P/L would count them as free.`,
        status: 409,
        quantity: Math.max(held, replay.qty),
      }
    }
    // Price opening lots recorded earlier at 0 (by a sell or delete).
    for (const tx of txs || []) {
      if (tx.type !== 'buy') continue
      const q = Number(tx.quantity) || 0
      const cost = Number(tx.total_mxn ?? q * Number(tx.price_per_coin_mxn))
      if (q > 0 && !(cost > 0)) {
        const { error } = await sb.from('crypto_transactions')
          .update({ price_per_coin_mxn: openingCostPerCoin, total_mxn: q * openingCostPerCoin })
          .eq('id', tx.id)
        if (error) return { error: error.message, status: 500 }
      }
    }
  }
  if (gap <= QTY_EPSILON) return null

  const openingCost = avg > 0
    ? Math.max(0, held * avg - replay.totalCost)
    : unbased && forBuy && openingCostPerCoin ? gap * openingCostPerCoin : 0
  const created = mexicoCityToday(holding.created_at ? new Date(holding.created_at) : undefined)
  const firstTx = txs?.[0]?.transaction_date as string | undefined
  const { error } = await sb.from('crypto_transactions').insert({
    holding_id: holdingId,
    type: 'buy',
    quantity: gap,
    price_per_coin_mxn: openingCost / gap,
    total_mxn: openingCost,
    exchange: null,
    notes: 'Opening balance (held before transactions were logged)',
    transaction_date: firstTx && firstTx < created ? firstTx : created,
  })
  return error ? { error: error.message, status: 500 } : null
}

function formatQty(n: number): string {
  return String(Number(n.toPrecision(12)))
}

function openingErrorResponse(r: NonNullable<OpeningResult>) {
  return NextResponse.json(
    r.status === 409 ? { error: r.error, code: OPENING_COST_REQUIRED, quantity: r.quantity } : { error: r.error },
    { status: r.status },
  )
}

async function recalcHolding(holdingId: string) {
  const sb = getSupabase()
  const { data: txs, error } = await loadHoldingTxs(sb, holdingId)
  if (error || !txs) return

  const { qty, totalCost } = replayHolding(txs)
  const avgCost = qty > 0 ? totalCost / qty : 0

  await sb
    .from('finance_crypto_holdings')
    .update({
      quantity: qty,
      avg_cost_basis_usd: avgCost, // stores MXN despite column name
      cost_currency: 'MXN',
    })
    .eq('id', holdingId)
}

// GET: list transactions, optionally filtered by holding_id
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const holdingId = req.nextUrl.searchParams.get('holding_id')
  let sb
  try { sb = getSupabase() } catch (e) { return configErrorResponse(e) }

  let query = sb
    .from('crypto_transactions')
    .select('*, finance_crypto_holdings!inner(symbol, owner)')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (holdingId) {
    query = query.eq('holding_id', holdingId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the joined data
  const txs = (data || []).map((tx: Record<string, unknown>) => {
    const holding = tx.finance_crypto_holdings as Record<string, unknown> | null
    return {
      ...tx,
      symbol: holding?.symbol ?? '',
      owner: holding?.owner ?? '',
      finance_crypto_holdings: undefined,
    }
  })

  return NextResponse.json({ transactions: txs }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST: log a new transaction and recalculate holding
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { holding_id, type, quantity, price_per_coin_mxn, exchange, notes, transaction_date, opening_cost_per_coin_mxn } = body

  if (!holding_id || !type || !quantity || !price_per_coin_mxn) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!['buy', 'sell'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const total_mxn = quantity * price_per_coin_mxn
  let sb
  try { sb = getSupabase() } catch (e) { return configErrorResponse(e) }

  if (opening_cost_per_coin_mxn !== undefined && opening_cost_per_coin_mxn !== null
    && !(typeof opening_cost_per_coin_mxn === 'number' && Number.isFinite(opening_cost_per_coin_mxn) && opening_cost_per_coin_mxn > 0)) {
    return NextResponse.json({ error: 'opening_cost_per_coin_mxn must be a positive number' }, { status: 400 })
  }

  const opening = await ensureOpeningBalance(holding_id, { forBuy: type === 'buy', openingCostPerCoin: opening_cost_per_coin_mxn ?? null })
  if (opening) return openingErrorResponse(opening)

  const { data, error } = await sb
    .from('crypto_transactions')
    .insert({
      holding_id,
      type,
      quantity,
      price_per_coin_mxn,
      total_mxn,
      exchange: exchange || null,
      notes: notes || null,
      transaction_date: transaction_date || mexicoCityToday(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Recalculate the holding
  await recalcHolding(holding_id)

  return NextResponse.json(data, { status: 201 })
}

// DELETE: remove a transaction and recalculate
export async function DELETE(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const { id, holding_id } = await req.json()
  if (!id || !holding_id) return NextResponse.json({ error: 'Missing id/holding_id' }, { status: 400 })

  let sb
  try { sb = getSupabase() } catch (e) { return configErrorResponse(e) }
  const opening = await ensureOpeningBalance(holding_id)
  if (opening) return openingErrorResponse(opening)
  const { error } = await sb.from('crypto_transactions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcHolding(holding_id)
  return NextResponse.json({ ok: true })
}
