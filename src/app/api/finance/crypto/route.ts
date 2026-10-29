import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { canonicalOwner, OWNERS } from '@/lib/owners'
import { fetchCryptoPrices } from '@/lib/crypto-prices'
import { ConfigError, configErrorResponse, getAdminClient, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'

const getSupabase = () => getAdminClient()

const COIN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  KAS: 'Kaspa',
  LIT: 'Lighter',
  AERO: 'Aerodrome',
  HYPE: 'Hyperliquid',
}

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

  const prices = await fetchCryptoPrices(undefined, { bust })

  // A failed holdings read is an error, not an empty portfolio (F18): the
  // client shows "couldn't load" instead of $0. Prices still ride along.
  if (dbError) {
    return NextResponse.json({ error: 'Failed to load crypto holdings', holdings: [], prices }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
  return withDegradedHeader(NextResponse.json({ holdings, prices }), degraded)
}

// POST: add or update a holding
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const body = await req.json()
  const { id, symbol, quantity, avg_cost_basis_usd, cost_currency, wallet_address, notes, owner } = body

  if (!symbol || !COIN_NAMES[symbol]) {
    return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 })
  }

  if (quantity === undefined || quantity < 0) {
    return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
  }

  const record = {
    symbol,
    name: COIN_NAMES[symbol],
    quantity,
    avg_cost_basis_usd: avg_cost_basis_usd || null,
    wallet_address: wallet_address || null,
    notes: notes || null,
    owner: canonicalOwner(owner) || OWNERS[0],
    cost_currency: cost_currency || 'MXN',
  }

  let sb
  try { sb = getSupabase() } catch (e) { return configErrorResponse(e) }

  if (id) {
    // Partial update: only fields present in the body, so editing notes never wipes cost basis
    const patch: Record<string, unknown> = { symbol, name: COIN_NAMES[symbol], quantity }
    if (avg_cost_basis_usd !== undefined) patch.avg_cost_basis_usd = avg_cost_basis_usd ?? null
    if (cost_currency !== undefined) patch.cost_currency = cost_currency || 'MXN'
    if (wallet_address !== undefined) patch.wallet_address = wallet_address || null
    if (notes !== undefined) patch.notes = notes || null
    if (owner !== undefined) patch.owner = canonicalOwner(owner) || OWNERS[0]
    const { data, error } = await sb
      .from('finance_crypto_holdings')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } else {
    // Insert
    const { data, error } = await sb
      .from('finance_crypto_holdings')
      .insert(record)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }
}

// DELETE: remove a holding
export async function DELETE(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let sb
  try { sb = getSupabase() } catch (e) { return configErrorResponse(e) }
  const { error } = await sb
    .from('finance_crypto_holdings')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
