// Which coin a crypto holding is. Holdings are keyed by ticker (`symbol`) for
// every consumer; `coingecko_id` (added by supabase-2026-11-crypto-any-coin.sql)
// says which coin that ticker means. Rows written before that migration, or
// read from a database that hasn't run it yet, fall back to the built-in map.

export interface BuiltinCoin {
  symbol: string
  name: string
  coingeckoId: string
  coinpaprikaId: string
}

export const BUILTIN_COINS: readonly BuiltinCoin[] = [
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', coinpaprikaId: 'btc-bitcoin' },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', coinpaprikaId: 'eth-ethereum' },
  { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana', coinpaprikaId: 'sol-solana' },
  { symbol: 'KAS', name: 'Kaspa', coingeckoId: 'kaspa', coinpaprikaId: 'kas-kaspa' },
  { symbol: 'LIT', name: 'Lighter', coingeckoId: 'lighter', coinpaprikaId: 'lit-lighter' },
  { symbol: 'AERO', name: 'Aerodrome', coingeckoId: 'aerodrome-finance', coinpaprikaId: 'aero-aerodrome-finance' },
  { symbol: 'HYPE', name: 'Hyperliquid', coingeckoId: 'hyperliquid', coinpaprikaId: 'hype-hyperliquid' },
]

const BY_SYMBOL = new Map(BUILTIN_COINS.map(c => [c.symbol, c]))

export function builtinCoin(symbol: string | null | undefined): BuiltinCoin | undefined {
  return symbol ? BY_SYMBOL.get(symbol.toUpperCase()) : undefined
}

export const BUILTIN_SYMBOLS = BUILTIN_COINS.map(c => c.symbol)

/** Tickers as stored: upper case, 1–15 of A–Z, 0–9, '.', '-' (same rule as the DB CHECK). */
export const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/
/** CoinGecko API ids: lower-case slugs. */
export const COINGECKO_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim().toUpperCase()
  return SYMBOL_PATTERN.test(s) ? s : null
}

export function normalizeCoingeckoId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim().toLowerCase()
  return COINGECKO_ID_PATTERN.test(id) ? id : null
}

/** A coin to price: a bare ticker (built-in coins) or a holding row. */
export type CoinRef = string | { symbol: string; coingecko_id?: string | null }

/**
 * Ticker → CoinGecko id for the coins asked for. A row's own coingecko_id wins
 * over the built-in map; tickers with neither are left out (unpriceable).
 */
export function resolveCoinIds(coins: readonly CoinRef[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const ref of coins) {
    const symbol = (typeof ref === 'string' ? ref : ref?.symbol)?.toUpperCase()
    if (!symbol) continue
    const own = typeof ref === 'string' ? null : normalizeCoingeckoId(ref.coingecko_id)
    if (own) out[symbol] = own
    else if (!out[symbol] && BY_SYMBOL.has(symbol)) out[symbol] = BY_SYMBOL.get(symbol)!.coingeckoId
  }
  return out
}

/** The CoinGecko id a stored holding stands for (its own, else the built-in one). */
export function holdingCoinId(h: { symbol: string; coingecko_id?: string | null }): string | null {
  return normalizeCoingeckoId(h.coingecko_id) ?? builtinCoin(h.symbol)?.coingeckoId ?? null
}

/**
 * Major coins whose Coinpaprika id is not `<ticker>-<coingecko id>`. The
 * search fallback in crypto-prices covers any coin missing here.
 */
export const COINPAPRIKA_OVERRIDES: Readonly<Record<string, string>> = {
  ripple: 'xrp-xrp',
  binancecoin: 'bnb-binance-coin',
  'avalanche-2': 'avax-avalanche',
  'the-open-network': 'ton-toncoin',
  'matic-network': 'matic-polygon',
  near: 'near-near-protocol',
  'crypto-com-chain': 'cro-cryptocom-chain',
  'staked-ether': 'steth-lido-staked-ether',
}

/**
 * Coinpaprika id for the keyless fallback. Built-ins and the overrides are
 * known; for any other coin Coinpaprika's ids are usually `<ticker>-<slug>`
 * with the same slug as CoinGecko (pepe-pepe, doge-dogecoin), so try that and
 * let the caller check the ticker it answers with.
 */
export function coinpaprikaIdFor(symbol: string, coingeckoId: string): string {
  const builtin = builtinCoin(symbol)
  if (builtin && builtin.coingeckoId === coingeckoId) return builtin.coinpaprikaId
  return COINPAPRIKA_OVERRIDES[coingeckoId] ?? `${symbol.toLowerCase()}-${coingeckoId}`
}

interface DbError { code?: string; message?: string; details?: string | null; hint?: string | null }

/**
 * True when a write failed because the any-coin migration hasn't run: the
 * coingecko_id column is missing (Postgres 42703 / PostgREST PGRST204) or the
 * old seven-ticker CHECK rejected the symbol (23514 on the symbol check).
 */
export function isPendingCoinMigrationError(error: DbError | null | undefined): boolean {
  if (!error) return false
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  if ((error.code === '42703' || error.code === 'PGRST204') && text.includes('coingecko_id')) return true
  if (error.code === '23514' && text.includes('symbol')) return true
  return false
}

export const PENDING_MIGRATION_MESSAGE =
  'Database update pending: for now only Bitcoin, Ethereum, Solana, Kaspa, Lighter, Aerodrome and Hyperliquid can be added. Any other coin needs supabase-2026-11-crypto-any-coin.sql to be applied first.'
