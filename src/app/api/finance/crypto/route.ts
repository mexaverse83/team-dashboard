import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
}

const COIN_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
}

async function fetchPrices() {
  try {
    const ids = Object.values(COINGECKO_IDS).join(',')
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,mxn&include_24hr_change=true`,
      { next: { revalidate: 300 } } // cache 5 min
    )
    if (!res.ok) return null
    const data = await res.json()
    const prices: Record<string, { usd: number; mxn: number; change24h: number }> = {}
    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      const coin = data[geckoId]
      if (coin) {
        prices[symbol] = {
          usd: coin.usd ?? 0,
          mxn: coin.mxn ?? 0,
          change24h: coin.usd_24h_change ?? 0,
        }
      }
    }
    return prices
  } catch (e) {
    console.error('CoinGecko fetch error:', e)
    return null
  }
}

// GET: return holdings + live prices
export async function GET() {
  let holdings: Record<string, unknown>[] = []
  let dbError: string | null = null

  try {
    const { data, error } = await getSupabase()
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
    console.error('Crypto DB error:', e)
    dbError = 'Database unavailable'
  }

  const prices = await fetchPrices()

  return NextResponse.json({ holdings, prices, dbError })
}

// POST: add or update a holding
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { id, symbol, quantity, avg_cost_basis_usd, wallet_address, notes } = body

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
  }

  if (id) {
    // Update
    const { data, error } = await getSupabase()
      .from('finance_crypto_holdings')
      .update(record)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } else {
    // Insert
    const { data, error } = await getSupabase()
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
  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await getSupabase()
    .from('finance_crypto_holdings')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
