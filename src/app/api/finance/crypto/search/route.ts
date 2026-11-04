import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { CoinSearchError, normalizeQuery, searchCoins } from '@/lib/crypto-search'

// GET /api/finance/crypto/search?q=pepe → { coins: [{ id, symbol, name, thumb, market_cap_rank }] }
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const q = normalizeQuery(req.nextUrl.searchParams.get('q'))
  if (!q) return NextResponse.json({ error: 'Type a coin name or ticker (1–50 characters)' }, { status: 400 })

  try {
    const coins = await searchCoins(q)
    return NextResponse.json({ coins }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (e) {
    const message = e instanceof CoinSearchError ? e.message : 'Coin search failed'
    console.error('Coin search error:', e)
    return NextResponse.json({ error: message }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
