import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { canonicalOwner, OWNERS, ownersEqual } from '@/lib/owners'
import { fetchCryptoPrices } from '@/lib/crypto-prices'
import {
  BUILTIN_SYMBOLS, PENDING_MIGRATION_MESSAGE, builtinCoin, holdingCoinId, isPendingCoinMigrationError,
  normalizeCoingeckoId, normalizeSymbol,
} from '@/lib/crypto-coins'
import { ConfigError, configErrorResponse, getAdminClient, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'

const getSupabase = () => getAdminClient()

type HoldingRow = { id: string; symbol: string; name?: string | null; owner?: string | null; coingecko_id?: string | null }

// GET: return holdings + live prices
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const bust = req.nextUrl.searchParams.has('t')
  let holdings: Record<string, unknown>[] = []
  let dbError: string | null = null
  let degraded = false

  try {
    const info = getAdminClientInfo()
    degraded = info.degraded
    // '*' (not a column list) so the read works before and after the any-coin migration.
    const { data, error } = await info.client
      .from('finance_crypto_holdings')
      .select('*')
      .order('symbol')

    if (error) {
      console.error('Crypto holdings fetch error:', error)
      dbError = error.message
    } else {
      holdings = data || []
    }
  } catch (e) {
    if (e instanceof ConfigError) return configErrorResponse(e)
    console.error('Crypto DB error:', e)
    dbError = e instanceof Error ? e.message : 'Database unavailable'
  }

  // Built-in coins (for the log form's "now" price) plus every held coin by its own id.
  const prices = await fetchCryptoPrices([...BUILTIN_SYMBOLS, ...(holdings as HoldingRow[])], { bust })

  // A failed holdings read is an error, not an empty portfolio (F18): the
  // client shows "couldn't load" instead of $0. Prices still ride along.
  if (dbError) {
    return NextResponse.json({ error: 'Failed to load crypto holdings', holdings: [], prices }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
  return withDegradedHeader(NextResponse.json({ holdings, prices }), degraded)
}

const validQuantity = (q: unknown) => typeof q === 'number' && Number.isFinite(q) && q >= 0

// POST: add a holding (any coin) or update one
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const { id, quantity, avg_cost_basis_usd, cost_currency, wallet_address, notes, owner } = body as Record<string, unknown>

  if (avg_cost_basis_usd !== undefined && avg_cost_basis_usd !== null && !(typeof avg_cost_basis_usd === 'number' && Number.isFinite(avg_cost_basis_usd) && avg_cost_basis_usd >= 0)) {
    return NextResponse.json({ error: 'Invalid cost basis' }, { status: 400 })
  }
  if (cost_currency !== undefined && cost_currency !== null && cost_currency !== 'MXN' && cost_currency !== 'USD') {
    return NextResponse.json({ error: 'Invalid cost currency' }, { status: 400 })
  }

  let sb
  try { sb = getSupabase() } catch (e) { return configErrorResponse(e) }

  if (id) {
    // Partial update: only fields present in the body, so editing notes never
    // wipes cost basis. The coin itself (symbol, coingecko_id) is fixed once added.
    if (quantity !== undefined && !validQuantity(quantity)) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }
    const patch: Record<string, unknown> = {}
    if (quantity !== undefined) patch.quantity = quantity
    if (avg_cost_basis_usd !== undefined) patch.avg_cost_basis_usd = avg_cost_basis_usd ?? null
    if (cost_currency !== undefined) patch.cost_currency = cost_currency || 'MXN'
    if (wallet_address !== undefined) patch.wallet_address = wallet_address || null
    if (notes !== undefined) patch.notes = notes || null
    if (owner !== undefined) patch.owner = canonicalOwner(owner as string) || OWNERS[0]
    const { data, error } = await sb
      .from('finance_crypto_holdings')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // Insert: which coin is it?
  const symbol = normalizeSymbol(body.symbol)
  if (!symbol) return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  const builtin = builtinCoin(symbol)
  const askedId = body.coingecko_id === undefined || body.coingecko_id === null || body.coingecko_id === ''
    ? null
    : normalizeCoingeckoId(body.coingecko_id)
  if (body.coingecko_id && !askedId) return NextResponse.json({ error: 'Invalid coin id' }, { status: 400 })
  const coingeckoId = askedId ?? builtin?.coingeckoId ?? null
  if (!coingeckoId) {
    return NextResponse.json({ error: `Pick ${symbol} from the coin search so we know which coin it is` }, { status: 400 })
  }
  if (!validQuantity(quantity)) return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })

  // One ticker, one coin: refuse a second coin that shares a held ticker.
  const { data: sameTicker, error: readError } = await sb
    .from('finance_crypto_holdings')
    .select('*')
    .eq('symbol', symbol)
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
  const clash = ((sameTicker || []) as HoldingRow[]).find(h => {
    const existingId = holdingCoinId(h)
    return existingId !== null && existingId !== coingeckoId
  })
  if (clash) {
    return NextResponse.json({
      error: `You already hold ${clash.name || symbol} under the ticker ${symbol}. Two different coins can't share a ticker here; remove that one first if it's a mistake.`,
      code: 'ticker_taken',
    }, { status: 409 })
  }

  const rawName = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  const isBuiltinCoin = !!builtin && builtin.coingeckoId === coingeckoId
  const record = {
    symbol,
    name: rawName || builtin?.name || symbol,
    quantity,
    avg_cost_basis_usd: avg_cost_basis_usd || null,
    wallet_address: wallet_address || null,
    notes: notes || null,
    owner: canonicalOwner(owner as string) || OWNERS[0],
    cost_currency: cost_currency || 'MXN',
  }

  const insert = (row: Record<string, unknown>) => sb
    .from('finance_crypto_holdings')
    .insert(row)
    .select()
    .single()

  let { data, error } = await insert({ ...record, coingecko_id: coingeckoId })
  if (error && isPendingCoinMigrationError(error)) {
    // Database without the any-coin migration: built-in coins still work
    // (priced from the built-in map); anything else has to wait for it.
    if (!isBuiltinCoin) {
      return NextResponse.json({ error: PENDING_MIGRATION_MESSAGE, code: 'migration_pending' }, { status: 409 })
    }
    ({ data, error } = await insert(record))
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// DELETE: remove holdings with their transactions — one ({ id }), several
// ({ ids }), or a whole coin ({ symbol }, optionally only { owner }'s).
export async function DELETE(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => null)
  const listed: string[] | null = typeof body?.id === 'string' && body.id
    ? [body.id]
    : Array.isArray(body?.ids) && body.ids.length > 0 && body.ids.length <= 50 && body.ids.every((x: unknown) => typeof x === 'string' && x)
      ? body.ids
      : null
  const symbol = body?.symbol !== undefined ? normalizeSymbol(body.symbol) : null
  if (!listed && !symbol) return NextResponse.json({ error: 'Missing id, ids or symbol' }, { status: 400 })

  let sb
  try { sb = getSupabase() } catch (e) { return configErrorResponse(e) }

  let ids: string[]
  if (listed) {
    ids = listed
  } else {
    const { data, error } = await sb.from('finance_crypto_holdings').select('*').eq('symbol', symbol)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const owner = typeof body.owner === 'string' && body.owner ? body.owner : null
    ids = ((data || []) as HoldingRow[]).filter(h => !owner || ownersEqual(h.owner, owner)).map(h => h.id)
    if (ids.length === 0) return NextResponse.json({ error: 'Nothing to remove' }, { status: 404 })
  }

  // Transactions first (the FK cascades too, but don't rely on it), then holdings.
  const txDelete = await sb.from('crypto_transactions').delete().in('holding_id', ids)
  if (txDelete.error) return NextResponse.json({ error: txDelete.error.message }, { status: 500 })
  const { error } = await sb.from('finance_crypto_holdings').delete().in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: ids.length })
}
