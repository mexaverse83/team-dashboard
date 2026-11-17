import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { ConfigError, configErrorResponse, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'
import { OWNERS, canonicalOwner } from '@/lib/owners'
import { normalizeTicker } from '@/lib/stock-prices'
import { isPrivateEquity } from '@/lib/stock-portfolio'
import { loadStockInputs } from '@/lib/server/stocks'

// Stock holdings. GET carries live quotes for the public tickers (never for
// private equity) and each holding's MXN cost from its ledger. Reads fail
// loudly (5xx + error) so the page shows "couldn't load", never $0 (F18).
// Private equity rows (Nexaminds) are read-only here: they're maintained by
// hand and valued by PrivateEquityCard.

const NO_STORE = { 'Cache-Control': 'no-store' }

function failure(e: unknown, label: string, message: string) {
  if (e instanceof ConfigError) return configErrorResponse(e)
  console.error(`${label} error:`, e)
  return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE })
}

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  try {
    const { client, degraded } = getAdminClientInfo()
    const { data, error } = await client.from('finance_stock_holdings').select('*').order('created_at', { ascending: false })
    if (error) throw error
    const inputs = await loadStockInputs(client, (data || []) as Array<Record<string, unknown> & { id: string }>, { bust: req.nextUrl.searchParams.has('t') })
    return withDegradedHeader(NextResponse.json({
      stocks: inputs.rows,
      quotes: inputs.quotes,
      usd_mxn: inputs.usdMxn,
      usd_mxn_source: inputs.usdMxnSource,
      transactions_ready: inputs.ledgerReady,
    }, { headers: { 'Cache-Control': 'private, no-store' } }), degraded)
  } catch (e) {
    return failure(e, 'Stocks GET', 'Failed to load stocks')
  }
}

const ASSET_TYPES = new Set(['stock', 'etf', 'fund'])
const isNonNegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

// POST: add a public holding ({ ticker, … }) or edit one ({ id, … }).
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  if (body.shares !== undefined && !isNonNegative(body.shares)) return NextResponse.json({ error: 'Invalid shares' }, { status: 400 })
  if (body.avg_cost_basis !== undefined && body.avg_cost_basis !== null && !isNonNegative(body.avg_cost_basis)) {
    return NextResponse.json({ error: 'Invalid cost' }, { status: 400 })
  }
  if (body.currency !== undefined && body.currency !== 'USD' && body.currency !== 'MXN') {
    return NextResponse.json({ error: 'Invalid currency' }, { status: 400 })
  }

  try {
    const sb = getAdminClientInfo().client

    if (body.id) {
      const { data: existing, error: readError } = await sb.from('finance_stock_holdings').select('*').eq('id', body.id).maybeSingle()
      if (readError) throw readError
      if (!existing) return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
      if (isPrivateEquity(existing)) return NextResponse.json({ error: 'Private equity isn’t edited here' }, { status: 409 })
      // Partial update: only the fields sent. The ticker itself is fixed once added.
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (body.name !== undefined) patch.name = text(body.name, 80) ?? existing.name
      if (body.shares !== undefined) patch.shares = body.shares
      if (body.avg_cost_basis !== undefined) patch.avg_cost_basis = body.avg_cost_basis ?? null
      if (body.broker !== undefined) patch.broker = text(body.broker, 40)
      if (body.notes !== undefined) patch.notes = text(body.notes, 500)
      if (body.owner !== undefined) patch.owner = canonicalOwner(body.owner as string) || OWNERS[0]
      const { data, error } = await sb.from('finance_stock_holdings').update(patch).eq('id', body.id).select().single()
      if (error) throw error
      return NextResponse.json(data)
    }

    const ticker = normalizeTicker(body.ticker)
    if (!ticker) return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 })
    const assetType = typeof body.asset_type === 'string' && ASSET_TYPES.has(body.asset_type) ? body.asset_type : 'stock'
    const currency = body.currency ?? (ticker.endsWith('.MX') ? 'MXN' : 'USD')
    const record = {
      ticker,
      name: text(body.name, 80) ?? ticker,
      exchange: text(body.exchange, 40) ?? (currency === 'MXN' ? 'BMV' : 'US'),
      asset_type: assetType,
      shares: isNonNegative(body.shares) ? body.shares : 0,
      avg_cost_basis: isNonNegative(body.avg_cost_basis) && body.avg_cost_basis > 0 ? body.avg_cost_basis : null,
      currency,
      broker: text(body.broker, 40),
      owner: canonicalOwner(body.owner as string) || OWNERS[0],
      notes: text(body.notes, 500),
    }
    const { data, error } = await sb.from('finance_stock_holdings').insert(record).select().single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return failure(e, 'Stocks POST', 'Save failed')
  }
}

// DELETE: remove public holdings with their transactions ({ id } or { ids }).
// finance_stock_transactions.holding_id is ON DELETE CASCADE, so the history
// goes in the same statement. Private equity is refused.
export async function DELETE(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => null)
  const ids: string[] | null = typeof body?.id === 'string' && body.id
    ? [body.id]
    : Array.isArray(body?.ids) && body.ids.length > 0 && body.ids.length <= 50 && body.ids.every((x: unknown) => typeof x === 'string' && x)
      ? body.ids
      : null
  if (!ids) return NextResponse.json({ error: 'Missing id or ids' }, { status: 400 })

  try {
    const sb = getAdminClientInfo().client
    const { data: rows, error: readError } = await sb.from('finance_stock_holdings').select('id, asset_type').in('id', ids)
    if (readError) throw readError
    const found = (rows || []) as Array<{ id: string; asset_type?: string | null }>
    if (found.some(isPrivateEquity)) return NextResponse.json({ error: 'Private equity can’t be removed here' }, { status: 409 })
    if (found.length === 0) return NextResponse.json({ error: 'Nothing to remove' }, { status: 404 })
    const { error } = await sb.from('finance_stock_holdings').delete().in('id', found.map(r => r.id))
    if (error) throw error
    return NextResponse.json({ ok: true, deleted: found.length })
  } catch (e) {
    return failure(e, 'Stocks DELETE', 'Delete failed')
  }
}
