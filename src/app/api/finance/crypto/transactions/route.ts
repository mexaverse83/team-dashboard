import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`Missing env: URL=${!!url} KEY=${!!key}`)
  return createClient(url, key)
}

async function recalcHolding(holdingId: string) {
  const sb = getSupabase()
  const { data: txs, error } = await sb
    .from('crypto_transactions')
    .select('*')
    .eq('holding_id', holdingId)
    .order('transaction_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error || !txs) return

  let qty = 0
  let totalCost = 0

  for (const tx of txs) {
    if (tx.type === 'buy') {
      totalCost += tx.quantity * tx.price_per_coin_mxn
      qty += tx.quantity
    } else {
      // sell — proportionally reduce cost basis
      if (qty > 0) {
        const costPerUnit = totalCost / qty
        totalCost -= costPerUnit * tx.quantity
      }
      qty -= tx.quantity
      if (qty <= 0) { qty = 0; totalCost = 0 }
    }
  }

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
  const holdingId = req.nextUrl.searchParams.get('holding_id')
  const sb = getSupabase()

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

  return NextResponse.json({ transactions: txs })
}

// POST: log a new transaction and recalculate holding
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { holding_id, type, quantity, price_per_coin_mxn, exchange, notes, transaction_date } = body

  if (!holding_id || !type || !quantity || !price_per_coin_mxn) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!['buy', 'sell'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const total_mxn = quantity * price_per_coin_mxn
  const sb = getSupabase()

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
      transaction_date: transaction_date || new Date().toISOString().slice(0, 10),
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
  const { id, holding_id } = await req.json()
  if (!id || !holding_id) return NextResponse.json({ error: 'Missing id/holding_id' }, { status: 400 })

  const sb = getSupabase()
  const { error } = await sb.from('crypto_transactions').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recalcHolding(holding_id)
  return NextResponse.json({ ok: true })
}
