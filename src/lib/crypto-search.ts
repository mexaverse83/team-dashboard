// Coin search for the crypto "Add coin" flow: a thin proxy over CoinGecko's
// keyless /search. No secrets leave the server (the optional demo key is sent
// as a header only), answers are trimmed to what the picker shows, and a
// short in-memory cache keeps typing from hammering the API.

export interface CoinSearchResult {
  id: string
  symbol: string
  name: string
  thumb: string | null
  market_cap_rank: number | null
}

export class CoinSearchError extends Error {}

const TIMEOUT_MS = 5000
const TTL_MS = 10 * 60 * 1000
const MAX_RESULTS = 12
const MAX_CACHE = 200

const cache = new Map<string, { at: number; results: CoinSearchResult[] }>()

/** Trimmed, lower-cased query, or null when it is too short / too long to search. */
export function normalizeQuery(raw: string | null | undefined): string | null {
  const q = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (q.length < 1 || q.length > 50) return null
  return q
}

function toResult(raw: unknown): CoinSearchResult | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== 'string' || typeof c.symbol !== 'string' || typeof c.name !== 'string') return null
  const thumb = typeof c.thumb === 'string' && c.thumb.startsWith('https://') ? c.thumb : null
  const rank = typeof c.market_cap_rank === 'number' && c.market_cap_rank > 0 ? c.market_cap_rank : null
  return { id: c.id, symbol: c.symbol.toUpperCase(), name: c.name, thumb, market_cap_rank: rank }
}

/** Ranked coins first (by market cap), then unranked in CoinGecko's order. */
function rank(results: CoinSearchResult[]): CoinSearchResult[] {
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.market_cap_rank ?? Infinity) - (b.r.market_cap_rank ?? Infinity) || a.i - b.i)
    .map(x => x.r)
}

export async function searchCoins(rawQuery: string, { now = Date.now() }: { now?: number } = {}): Promise<CoinSearchResult[]> {
  const q = normalizeQuery(rawQuery)
  if (!q) return []
  const hit = cache.get(q)
  if (hit && now - hit.at < TTL_MS) return hit.results

  const headers: Record<string, string> = { accept: 'application/json' }
  if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY
  let res: Response
  try {
    res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, {
      headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new CoinSearchError('Coin search timed out')
  }
  if (!res.ok) throw new CoinSearchError(`Coin search failed (${res.status})`)
  const data = await res.json().catch(() => null)
  const coins = Array.isArray(data?.coins) ? data.coins : []
  const results = rank(coins.map(toResult).filter((r: CoinSearchResult | null): r is CoinSearchResult => r !== null)).slice(0, MAX_RESULTS)

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(q, { at: now, results })
  return results
}

/** Test hook: forget cached searches. */
export function clearCoinSearchCache() {
  cache.clear()
}
