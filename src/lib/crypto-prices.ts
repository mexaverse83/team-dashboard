// Live crypto prices for the supported holdings, keyed by symbol.
//
// CoinGecko's keyless API started rejecting simple/price requests (403 from
// its CDN) in Sep 2026, which zeroed every crypto figure. We still try it
// first (with COINGECKO_API_KEY as a demo key when set), then fill anything
// missing from Coinpaprika, which is keyless and quotes MXN directly.

export interface CoinPrice {
  usd: number
  mxn: number
  change24h: number
}

export type CryptoPrices = Record<string, CoinPrice>

export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  KAS: 'kaspa',
  LIT: 'lighter',
  AERO: 'aerodrome-finance',
}

const COINPAPRIKA_IDS: Record<string, string> = {
  BTC: 'btc-bitcoin',
  ETH: 'eth-ethereum',
  SOL: 'sol-solana',
  KAS: 'kas-kaspa',
  LIT: 'lit-lighter',
  AERO: 'aero-aerodrome-finance',
}

const TIMEOUT_MS = 5000

function cacheOptions(bust: boolean): RequestInit {
  return bust
    ? { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) }
    : { next: { revalidate: 300 }, signal: AbortSignal.timeout(TIMEOUT_MS) } as RequestInit
}

async function fromCoinGecko(symbols: string[], bust: boolean): Promise<CryptoPrices> {
  const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean)
  if (ids.length === 0) return {}
  const headers: Record<string, string> = { accept: 'application/json' }
  if (process.env.COINGECKO_API_KEY) headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd,mxn&include_24hr_change=true`,
    { ...cacheOptions(bust), headers },
  )
  if (!res.ok) return {}
  const data = await res.json()
  const prices: CryptoPrices = {}
  for (const symbol of symbols) {
    const coin = data[COINGECKO_IDS[symbol]]
    if (coin?.usd > 0 && coin?.mxn > 0) {
      prices[symbol] = { usd: coin.usd, mxn: coin.mxn, change24h: coin.usd_24h_change ?? 0 }
    }
  }
  return prices
}

async function fromCoinpaprika(symbols: string[], bust: boolean): Promise<CryptoPrices> {
  const entries = await Promise.all(symbols.map(async symbol => {
    const id = COINPAPRIKA_IDS[symbol]
    if (!id) return null
    try {
      const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${id}?quotes=USD,MXN`, cacheOptions(bust))
      if (!res.ok) return null
      const data = await res.json()
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
 * Prices for `symbols` (defaults to every supported coin). Returns null only
 * when no source produced any price, so callers can tell "unavailable" apart
 * from "some coins missing".
 */
export async function fetchCryptoPrices(
  symbols: string[] = Object.keys(COINGECKO_IDS),
  { bust = false }: { bust?: boolean } = {},
): Promise<CryptoPrices | null> {
  const wanted = [...new Set(symbols)].filter(s => COINGECKO_IDS[s])
  let prices: CryptoPrices = {}
  try {
    prices = await fromCoinGecko(wanted, bust)
  } catch (e) {
    console.error('CoinGecko fetch error:', e)
  }
  const missing = wanted.filter(s => !prices[s])
  if (missing.length > 0) {
    prices = { ...prices, ...await fromCoinpaprika(missing, bust) }
  }
  return Object.keys(prices).length > 0 ? prices : null
}
