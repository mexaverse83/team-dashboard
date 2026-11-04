// Live crypto prices, keyed by ticker.
//
// CoinGecko's keyless API started rejecting simple/price requests (403 from
// its CDN) in Sep 2026, which zeroed every crypto figure. We still try it
// first (with COINGECKO_API_KEY as a demo key when set), then fill anything
// missing from Coinpaprika, which is keyless and quotes MXN directly.
//
// Any coin can be priced: callers pass holding rows, and a row's coingecko_id
// (else the built-in map) says which coin its ticker is. Results stay keyed by
// ticker for every existing consumer.

import { BUILTIN_COINS, BUILTIN_SYMBOLS, builtinCoin, coinpaprikaIdFor, resolveCoinIds, type CoinRef } from '@/lib/crypto-coins'

export interface CoinPrice {
  usd: number
  mxn: number
  change24h: number
}

export type CryptoPrices = Record<string, CoinPrice>

/** Built-in ticker → CoinGecko id (holdings may carry their own coingecko_id). */
export const COINGECKO_IDS: Record<string, string> = Object.fromEntries(BUILTIN_COINS.map(c => [c.symbol, c.coingeckoId]))

const TIMEOUT_MS = 5000

function cacheOptions(bust: boolean): RequestInit {
  return bust
    ? { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) }
    : { next: { revalidate: 300 }, signal: AbortSignal.timeout(TIMEOUT_MS) } as RequestInit
}

async function fromCoinGecko(ids: Record<string, string>, bust: boolean): Promise<CryptoPrices> {
  const unique = [...new Set(Object.values(ids))]
  if (unique.length === 0) return {}
  const headers: Record<string, string> = { accept: 'application/json' }
  if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${unique.map(encodeURIComponent).join(',')}&vs_currencies=usd,mxn&include_24hr_change=true`,
    { ...cacheOptions(bust), headers },
  )
  if (!res.ok) return {}
  const data = await res.json()
  const prices: CryptoPrices = {}
  for (const [symbol, id] of Object.entries(ids)) {
    const coin = data?.[id]
    if (coin?.usd > 0 && coin?.mxn > 0) {
      prices[symbol] = { usd: coin.usd, mxn: coin.mxn, change24h: coin.usd_24h_change ?? 0 }
    }
  }
  return prices
}

async function fromCoinpaprika(ids: Record<string, string>, bust: boolean): Promise<CryptoPrices> {
  const entries = await Promise.all(Object.entries(ids).map(async ([symbol, coingeckoId]) => {
    const id = coinpaprikaIdFor(symbol, coingeckoId)
    const guessed = builtinCoin(symbol)?.coinpaprikaId !== id
    try {
      const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${encodeURIComponent(id)}?quotes=USD,MXN`, cacheOptions(bust))
      if (!res.ok) return null
      const data = await res.json()
      // A guessed id must answer with the same ticker, or it's another coin.
      if (guessed && String(data?.symbol ?? '').toUpperCase() !== symbol) return null
      const usd = data?.quotes?.USD
      const mxn = data?.quotes?.MXN
      if (!(usd?.price > 0) || !(mxn?.price > 0)) return null
      return [symbol, { usd: usd.price, mxn: mxn.price, change24h: usd.percent_change_24h ?? 0 }] as const
    } catch {
      return null
    }
  }))
  return Object.fromEntries(entries.filter((e): e is NonNullable<typeof e> => e !== null))
}

/**
 * Prices keyed by ticker for `coins`: bare tickers (built-in coins) or holding
 * rows carrying `coingecko_id`. Defaults to every built-in coin. Returns null
 * only when no source produced any price, so callers can tell "unavailable"
 * apart from "some coins missing".
 */
export async function fetchCryptoPrices(
  coins: readonly CoinRef[] = BUILTIN_SYMBOLS,
  { bust = false }: { bust?: boolean } = {},
): Promise<CryptoPrices | null> {
  const ids = resolveCoinIds(coins)
  let prices: CryptoPrices = {}
  try {
    prices = await fromCoinGecko(ids, bust)
  } catch (e) {
    console.error('CoinGecko fetch error:', e)
  }
  const missing = Object.fromEntries(Object.entries(ids).filter(([s]) => !prices[s]))
  if (Object.keys(missing).length > 0) {
    prices = { ...prices, ...await fromCoinpaprika(missing, bust) }
  }
  return Object.keys(prices).length > 0 ? prices : null
}

/** USD→MXN implied by today's coin quotes (each quote carries both currencies). */
export function impliedUsdMxn(prices: CryptoPrices | null | undefined): number | null {
  const rates = Object.values(prices || {})
    .filter(p => p.usd > 0 && p.mxn > 0)
    .map(p => p.mxn / p.usd)
    .filter(r => r > 5 && r < 50)
    .sort((a, b) => a - b)
  return rates.length ? rates[Math.floor(rates.length / 2)] : null
}
