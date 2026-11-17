import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { StockSearchError, normalizeStockQuery, searchStocks } from '@/lib/stock-search'

// GET /api/finance/investments/stocks/search?q=nvidia
//   → { results: [{ symbol, name, exchange, type, currency }] }
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const q = normalizeStockQuery(req.nextUrl.searchParams.get('q'))
  if (!q) return NextResponse.json({ error: 'Type a company name or ticker (1–40 characters)' }, { status: 400 })

  try {
    const results = await searchStocks(q)
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, max-age=300' } })
  } catch (e) {
    const message = e instanceof StockSearchError ? e.message : 'Stock search failed'
    console.error('Stock search error:', e)
    return NextResponse.json({ error: message }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
}
