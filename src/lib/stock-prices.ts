// Live quotes for public stocks and ETFs, plus the USD/MXN rate.
//
// Yahoo Finance's chart endpoint (keyless) is the primary source: it answers
// for US listings (NVDA, VOO) and Mexican ones (WALMEX.MX) with the listing
// currency and the previous close for the day change. It refuses requests
// without a browser-like User-Agent (429), so one is always sent.
//
// Fallback for US tickers: Nasdaq's quote API (keyless, US listings only;
// stocks and ETFs live under different asset classes). Stooq's CSV quote URL
// no longer answers (Nov 2026: "page does not exist"), so it isn't used.
//
// A quote that can't be fetched is simply absent: callers show "no price" and
// fall back to cost, never $0. Private equity is never priced here.
import { fetchCryptoPrices, impliedUsdMxn } from '@/lib/crypto-prices'

export type ListingCurrency = 'USD' | 'MXN'

export interface StockQuote {
  symbol: string
  /** Last price in the listing's currency. */
  price: number
  currency: ListingCurrency
  previousClose: number | null
  /** Day change in the listing's currency, and in percent. */
  change: number | null
  changePct: number | null
  /** The price in USD and MXN (converted at the live USD/MXN rate). */
  usd: number
  mxn: number
  source: 'yahoo' | 'nasdaq'
}

export type StockQuotes = Record<string, StockQuote>

export interface StockQuotesResult {
  quotes: StockQuotes
  usdMxn: number | null
  usdMxnSource: 'yahoo' | 'crypto' | null
}

/** Tickers we query: upper case, 1–15 of A-Z 0-9 . - (BRK-B, WALMEX.MX, GFNORTEO.MX). */
export const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,14}$/

export function normalizeTicker(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().toUpperCase()
  return TICKER_PATTERN.test(t) ? t : null
}

const TIMEOUT_MS = 5000
const QUOTE_TTL_MS = 60 * 1000
const FX_TTL_MS = 5 * 60 * 1000
const MAX_CACHE = 200
export const YAHOO_HEADERS = {
  accept: 'application/json',
  // Yahoo answers 429 to requests without a browser-like agent.
  'user-agent': 'Mozilla/5.0 (compatible; MonaFinance/1.0)',
}

type RawQuote = Omit<StockQuote, 'usd' | 'mxn'>

const quoteCache = new Map<string, { at: number; quote: RawQuote }>()
let fxCache: { at: number; rate: number; source: 'yahoo' | 'crypto' } | null = null

const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)

function dayChange(price: number, previousClose: number | null) {
  if (!previousClose) return { change: null, changePct: null }
  const change = price - previousClose
  return { change, changePct: (change / previousClose) * 100 }
}

/** Parse a Yahoo /v8/finance/chart answer into a quote (USD or MXN listings only). */
export function parseYahooChart(symbol: string, data: unknown): RawQuote | null {
  const meta = (data as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } })?.chart?.result?.[0]?.meta
  if (!meta) return null
  const price = pos(meta.regularMarketPrice)
  const currency = String(meta.currency ?? '').toUpperCase()
  if (!price || (currency !== 'USD' && currency !== 'MXN')) return null
  const previousClose = pos(meta.previousClose) ?? pos(meta.chartPreviousClose)
  return { symbol, price, currency, previousClose, ...dayChange(price, previousClose), source: 'yahoo' }
}

const money = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const n = Number(v.replace(/[$,%\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Parse a Nasdaq /api/quote/{sym}/info answer (prices like "$151.34", change "-4.80"). */
export function parseNasdaqInfo(symbol: string, data: unknown): RawQuote | null {
  const primary = (data as { data?: { primaryData?: Record<string, unknown> } | null })?.data?.primaryData
  if (!primary) return null
  const price = pos(money(primary.lastSalePrice))
  if (!price) return null
  const change = money(primary.netChange)
  const previousClose = change !== null && price - change > 0 ? price - change : null
  return { symbol, price, currency: 'USD', previousClose, ...dayChange(price, previousClose), source: 'nasdaq' }
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    return await res.json().catch(() => null)
  } catch {
    return null
  }
}

async function fromYahoo(symbol: string): Promise<RawQuote | null> {
  const data = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, YAHOO_HEADERS)
  return data ? parseYahooChart(symbol, data) : null
}

async function fromNasdaq(symbol: string): Promise<RawQuote | null> {
  // Nasdaq lists US tickers only; class shares use a dot there (BRK.B), not Yahoo's dash.
  if (symbol.includes('.')) return null
  const sym = encodeURIComponent(symbol.replace('-', '.'))
  for (const assetClass of ['stocks', 'etf']) {
    const data = await getJson(`https://api.nasdaq.com/api/quote/${sym}/info?assetclass=${assetClass}`, YAHOO_HEADERS)
    const quote = data ? parseNasdaqInfo(symbol, data) : null
    if (quote) return quote
  }
  return null
}

async function fetchQuote(symbol: string, now: number, bust: boolean): Promise<RawQuote | null> {
  const hit = quoteCache.get(symbol)
  if (!bust && hit && now - hit.at < QUOTE_TTL_MS) return hit.quote
  const quote = (await fromYahoo(symbol)) ?? (await fromNasdaq(symbol))
  if (quote) {
    if (quoteCache.size >= MAX_CACHE) quoteCache.delete(quoteCache.keys().next().value as string)
    quoteCache.set(symbol, { at: now, quote })
  }
  // A failed refresh keeps serving the last good quote for a few minutes.
  if (!quote && hit && now - hit.at < 5 * QUOTE_TTL_MS) return hit.quote
  return quote
}

/** Live USD→MXN: Yahoo's MXN=X, else the rate implied by the crypto quotes (as the crypto tab does). */
export async function fetchUsdMxn({ now = Date.now(), bust = false }: { now?: number; bust?: boolean } = {}): Promise<{ rate: number; source: 'yahoo' | 'crypto' } | null> {
  if (!bust && fxCache && now - fxCache.at < FX_TTL_MS) return { rate: fxCache.rate, source: fxCache.source }
  const yahoo = await fromYahoo('MXN=X').catch(() => null)
  // Yahoo quotes MXN=X in MXN per USD; a sane band guards against a bad answer.
  const rate = yahoo && yahoo.price > 5 && yahoo.price < 50 ? yahoo.price : null
  if (rate) {
    fxCache = { at: now, rate, source: 'yahoo' }
    return { rate, source: 'yahoo' }
  }
  try {
    const implied = impliedUsdMxn(await fetchCryptoPrices(['BTC', 'ETH']))
    if (implied) {
      fxCache = { at: now, rate: implied, source: 'crypto' }
      return { rate: implied, source: 'crypto' }
    }
  } catch { /* no crypto quotes either */ }
  return fxCache ? { rate: fxCache.rate, source: fxCache.source } : null
}

/**
 * Quotes for `symbols` (invalid tickers are skipped). A USD listing's MXN
 * price needs the live rate: without one it has no quote at all rather than a
 * guessed conversion.
 */
export async function fetchStockQuotes(
  symbols: readonly string[],
  { now = Date.now(), bust = false }: { now?: number; bust?: boolean } = {},
): Promise<StockQuotesResult> {
  const unique = [...new Set(symbols.map(normalizeTicker).filter((s): s is string => !!s))]
  if (unique.length === 0) return { quotes: {}, usdMxn: null, usdMxnSource: null }
  const [fx, raw] = await Promise.all([
    fetchUsdMxn({ now, bust }),
    Promise.all(unique.map(s => fetchQuote(s, now, bust).catch(() => null))),
  ])
  const quotes: StockQuotes = {}
  for (const q of raw) {
    if (!q) continue
    if (q.currency === 'USD') {
      if (!fx) continue
      quotes[q.symbol] = { ...q, usd: q.price, mxn: q.price * fx.rate }
    } else {
      if (!fx) { quotes[q.symbol] = { ...q, usd: 0, mxn: q.price }; continue }
      quotes[q.symbol] = { ...q, usd: q.price / fx.rate, mxn: q.price }
    }
  }
  return { quotes, usdMxn: fx?.rate ?? null, usdMxnSource: fx?.source ?? null }
}

/** Test hook: forget cached quotes and the cached rate. */
export function clearStockPriceCache() {
  quoteCache.clear()
  fxCache = null
}
