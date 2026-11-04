// Coin search for the crypto "Add coin" flow: a thin proxy over CoinGecko's
// keyless /search. No secrets leave the server (the optional demo key is sent
// as a header only), answers are trimmed to what the picker shows, and a
// short in-memory cache keeps typing from hammering the API.
//
// Keyless CoinGecko has answered 403 from production before (see
// crypto-prices.ts), so when it fails the search falls back to Coinpaprika.
// Its ids are `<ticker>-<slug>`; the slug becomes the stored coingecko_id, so
// coinpaprikaIdFor() maps it straight back to the same Coinpaprika coin for
// pricing.
import { BUILTIN_COINS, COINGECKO_ID_PATTERN, COINPAPRIKA_OVERRIDES, SYMBOL_PATTERN } from '@/lib/crypto-coins'

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
  const symbol = c.symbol.trim().toUpperCase()
  // Coins the holdings API would refuse (odd tickers or ids) aren't offered.
  if (!SYMBOL_PATTERN.test(symbol) || !COINGECKO_ID_PATTERN.test(c.id)) return null
  return { id: c.id, symbol, name: c.name, thumb, market_cap_rank: rank }
}

/** Ranked coins first (by market cap), then unranked in CoinGecko's order. */
function rank(results: CoinSearchResult[]): CoinSearchResult[] {
  return results
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.market_cap_rank ?? Infinity) - (b.r.market_cap_rank ?? Infinity) || a.i - b.i)
    .map(x => x.r)
}

/** Coinpaprika id → the CoinGecko-style id that coinpaprikaIdFor() turns back into it. */
const PAPRIKA_TO_GECKO = new Map<string, string>([
  ...BUILTIN_COINS.map(c => [c.coinpaprikaId, c.coingeckoId] as [string, string]),
  ...Object.entries(COINPAPRIKA_OVERRIDES).map(([gecko, paprika]) => [paprika, gecko] as [string, string]),
])

export function paprikaToCoingeckoId(paprikaId: string, symbol: string): string | null {
  const known = PAPRIKA_TO_GECKO.get(paprikaId)
  if (known) return known
  const prefix = `${symbol.toLowerCase()}-`
  if (!paprikaId.startsWith(prefix)) return null
  const slug = paprikaId.slice(prefix.length)
  return COINGECKO_ID_PATTERN.test(slug) ? slug : null
}

function fromPaprika(raw: unknown): CoinSearchResult | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== 'string' || typeof c.symbol !== 'string' || typeof c.name !== 'string') return null
  if (c.is_active === false) return null
  const symbol = c.symbol.trim().toUpperCase()
  if (!SYMBOL_PATTERN.test(symbol)) return null
  const id = paprikaToCoingeckoId(c.id, symbol)
  if (!id) return null
  const rank = typeof c.rank === 'number' && c.rank > 0 ? c.rank : null
  return { id, symbol, name: c.name, thumb: null, market_cap_rank: rank }
}

async function searchCoinGecko(q: string): Promise<CoinSearchResult[]> {
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
  if (!Array.isArray(data?.coins)) throw new CoinSearchError('Coin search failed (bad response)')
  return data.coins.map(toResult).filter((r: CoinSearchResult | null): r is CoinSearchResult => r !== null)
}

async function searchCoinpaprika(q: string): Promise<CoinSearchResult[]> {
  let res: Response
  try {
    res = await fetch(`https://api.coinpaprika.com/v1/search?q=${encodeURIComponent(q)}&c=currencies&limit=25`, {
      headers: { accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new CoinSearchError('Coin search timed out')
  }
  if (!res.ok) throw new CoinSearchError(`Coin search failed (${res.status})`)
  const data = await res.json().catch(() => null)
  const list = Array.isArray(data?.currencies) ? data.currencies : []
  return list.map(fromPaprika).filter((r: CoinSearchResult | null): r is CoinSearchResult => r !== null)
}

export async function searchCoins(rawQuery: string, { now = Date.now() }: { now?: number } = {}): Promise<CoinSearchResult[]> {
  const q = normalizeQuery(rawQuery)
  if (!q) return []
  const hit = cache.get(q)
  if (hit && now - hit.at < TTL_MS) return hit.results

  let found: CoinSearchResult[]
  try {
    found = await searchCoinGecko(q)
  } catch (geckoError) {
    console.warn('CoinGecko search failed, trying Coinpaprika:', geckoError instanceof Error ? geckoError.message : geckoError)
    try {
      found = await searchCoinpaprika(q)
    } catch {
      throw geckoError
    }
  }
  const results = rank(found).slice(0, MAX_RESULTS)

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(q, { at: now, results })
  return results
}

/** Test hook: forget cached searches. */
export function clearCoinSearchCache() {
  cache.clear()
}
