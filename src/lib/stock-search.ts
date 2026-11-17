// Ticker search for the Stocks "Add stock" flow: a thin proxy over Yahoo
// Finance's keyless /v1/finance/search. Only stocks and ETFs listed in the US
// (USD) or Mexico (MXN) are offered, since those are the listings we can
// price and convert. The query only ever goes into the query string of a
// fixed host (no SSRF), answers are trimmed to what the picker shows, and a
// short in-memory cache keeps typing from hammering the API.
import { TICKER_PATTERN, YAHOO_HEADERS, type ListingCurrency } from '@/lib/stock-prices'

export interface StockSearchResult {
  symbol: string
  name: string
  /** Yahoo's exchange display name ("NASDAQ", "NYSE", "Mexico"). */
  exchange: string
  type: 'stock' | 'etf'
  currency: ListingCurrency
}

export class StockSearchError extends Error {}

const TIMEOUT_MS = 5000
const TTL_MS = 10 * 60 * 1000
const MAX_RESULTS = 8
const MAX_CACHE = 200

// Yahoo exchange codes → listing currency.
const US_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NYQ', 'ASE', 'PCX', 'BTS', 'NAS', 'NYS', 'CBO', 'PNK', 'OQB', 'OQX'])
const MX_EXCHANGES = new Set(['MEX'])

export function listingCurrency(exchange: string, symbol: string): ListingCurrency | null {
  if (MX_EXCHANGES.has(exchange) || symbol.endsWith('.MX')) return 'MXN'
  if (US_EXCHANGES.has(exchange) && !symbol.includes('.')) return 'USD'
  return null
}

const cache = new Map<string, { at: number; results: StockSearchResult[] }>()

/** Trimmed query, or null when it is empty or too long to search. */
export function normalizeStockQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (q.length < 1 || q.length > 40) return null
  return q
}

export function toStockResult(raw: unknown): StockSearchResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const quoteType = String(r.quoteType ?? '').toUpperCase()
  if (quoteType !== 'EQUITY' && quoteType !== 'ETF') return null
  const symbol = typeof r.symbol === 'string' ? r.symbol.trim().toUpperCase() : ''
  if (!TICKER_PATTERN.test(symbol)) return null
  const exchangeCode = String(r.exchange ?? '')
  const currency = listingCurrency(exchangeCode, symbol)
  if (!currency) return null
  const name = [r.longname, r.shortname].find((v): v is string => typeof v === 'string' && v.trim().length > 0)?.trim() ?? symbol
  const exchange = typeof r.exchDisp === 'string' && r.exchDisp ? r.exchDisp : exchangeCode
  return { symbol, name: name.slice(0, 80), exchange, type: quoteType === 'ETF' ? 'etf' : 'stock', currency }
}

export async function searchStocks(rawQuery: string, { now = Date.now() }: { now?: number } = {}): Promise<StockSearchResult[]> {
  const q = normalizeStockQuery(rawQuery)
  if (!q) return []
  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit && now - hit.at < TTL_MS) return hit.results

  let res: Response
  try {
    res = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${MAX_RESULTS}&newsCount=0`, {
      headers: YAHOO_HEADERS, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new StockSearchError('Stock search timed out')
  }
  if (!res.ok) throw new StockSearchError(`Stock search failed (${res.status})`)
  const data = await res.json().catch(() => null)
  if (!Array.isArray(data?.quotes)) throw new StockSearchError('Stock search failed (bad response)')

  const seen = new Set<string>()
  const results: StockSearchResult[] = []
  for (const raw of data.quotes) {
    const r = toStockResult(raw)
    if (!r || seen.has(r.symbol)) continue
    seen.add(r.symbol)
    results.push(r)
  }
  const trimmed = results.slice(0, MAX_RESULTS)
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(key, { at: now, results: trimmed })
  return trimmed
}

/** Test hook: forget cached searches. */
export function clearStockSearchCache() {
  cache.clear()
}
