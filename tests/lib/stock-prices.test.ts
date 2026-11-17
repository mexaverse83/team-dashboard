// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const crypto = vi.hoisted(() => ({ implied: null as number | null }))
vi.mock('@/lib/crypto-prices', () => ({
  fetchCryptoPrices: async () => ({}),
  impliedUsdMxn: () => crypto.implied,
}))

import { clearStockPriceCache, fetchStockQuotes, fetchUsdMxn, normalizeTicker, parseNasdaqInfo, parseYahooChart } from '@/lib/stock-prices'

const yahoo = (symbol: string, price: number, currency: string, previousClose?: number) => ({
  chart: { result: [{ meta: { symbol, currency, regularMarketPrice: price, chartPreviousClose: previousClose ?? price, instrumentType: 'EQUITY' } }], error: null },
})
const nasdaq = (price: string, change: string) => ({ data: { symbol: 'NVDA', primaryData: { lastSalePrice: price, netChange: change, percentageChange: '-3.07%' } } })

type Handler = (url: string) => unknown | null
function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: string | URL) => {
    const url = String(input)
    const body = handler(url)
    return body === null ? new Response('nope', { status: 500 }) : Response.json(body)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => { clearStockPriceCache(); crypto.implied = null })
afterEach(() => { vi.unstubAllGlobals() })

describe('stock quote parsing', () => {
  it('reads Yahoo’s chart meta: price, currency and the day change from the previous close', () => {
    const q = parseYahooChart('NVDA', yahoo('NVDA', 151.342, 'USD', 156.14))!
    expect(q).toMatchObject({ symbol: 'NVDA', price: 151.342, currency: 'USD', previousClose: 156.14, source: 'yahoo' })
    expect(q.change).toBeCloseTo(-4.798, 6)
    expect(q.changePct).toBeCloseTo(-3.0729, 3)
  })

  it('refuses a Yahoo answer without a price or in another currency', () => {
    expect(parseYahooChart('X', { chart: { result: [] } })).toBeNull()
    expect(parseYahooChart('X', yahoo('X', 0, 'USD'))).toBeNull()
    expect(parseYahooChart('SHOP.TO', yahoo('SHOP.TO', 100, 'CAD'))).toBeNull()
  })

  it('reads Nasdaq’s "$151.34" strings', () => {
    const q = parseNasdaqInfo('NVDA', nasdaq('$151.34', '-4.80'))!
    expect(q).toMatchObject({ price: 151.34, currency: 'USD', source: 'nasdaq' })
    expect(q.previousClose).toBeCloseTo(156.14, 6)
    expect(parseNasdaqInfo('X', { data: null })).toBeNull()
  })

  it('normalizes tickers and rejects anything that isn’t one', () => {
    expect(normalizeTicker(' nvda ')).toBe('NVDA')
    expect(normalizeTicker('walmex.mx')).toBe('WALMEX.MX')
    expect(normalizeTicker('../etc')).toBeNull()
    expect(normalizeTicker('https://evil.example')).toBeNull()
  })
})

describe('fetchStockQuotes', () => {
  it('prices US and Mexican listings in USD and MXN at Yahoo’s USD/MXN', async () => {
    const fetchMock = mockFetch(url => {
      if (url.includes('/chart/MXN%3DX')) return yahoo('MXN=X', 18.5, 'MXN')
      if (url.includes('/chart/NVDA')) return yahoo('NVDA', 150, 'USD', 148)
      if (url.includes('/chart/WALMEX.MX')) return yahoo('WALMEX.MX', 55, 'MXN')
      return null
    })
    const { quotes, usdMxn, usdMxnSource } = await fetchStockQuotes(['NVDA', 'WALMEX.MX'])
    expect(usdMxn).toBe(18.5)
    expect(usdMxnSource).toBe('yahoo')
    expect(quotes.NVDA).toMatchObject({ usd: 150, mxn: 150 * 18.5, currency: 'USD' })
    expect(quotes['WALMEX.MX'].mxn).toBe(55)
    expect(quotes['WALMEX.MX'].usd).toBeCloseTo(55 / 18.5, 9)
    // Yahoo needs a browser-like agent (429 otherwise).
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>
    expect(headers['user-agent']).toMatch(/Mozilla/)
  })

  it('falls back to Nasdaq when Yahoo fails, and leaves a ticker out when both fail', async () => {
    mockFetch(url => {
      if (url.includes('/chart/MXN%3DX')) return yahoo('MXN=X', 18.5, 'MXN')
      if (url.includes('api.nasdaq.com/api/quote/NVDA/info?assetclass=stocks')) return nasdaq('$151.34', '-4.80')
      return null
    })
    const { quotes } = await fetchStockQuotes(['NVDA', 'ZZZZ'])
    expect(quotes.NVDA).toMatchObject({ price: 151.34, source: 'nasdaq' })
    expect(quotes.ZZZZ).toBeUndefined()
  })

  it('a USD listing has no quote at all when no USD/MXN rate is available (never a guessed $0)', async () => {
    mockFetch(url => (url.includes('/chart/NVDA') ? yahoo('NVDA', 150, 'USD') : null))
    const { quotes, usdMxn } = await fetchStockQuotes(['NVDA'])
    expect(usdMxn).toBeNull()
    expect(quotes).toEqual({})
  })

  it('takes USD/MXN from the crypto quotes when Yahoo’s MXN=X fails', async () => {
    crypto.implied = 18.2
    mockFetch(() => null)
    expect(await fetchUsdMxn()).toEqual({ rate: 18.2, source: 'crypto' })
  })

  it('serves a cached quote without refetching', async () => {
    const fetchMock = mockFetch(url => {
      if (url.includes('/chart/MXN%3DX')) return yahoo('MXN=X', 18.5, 'MXN')
      if (url.includes('/chart/NVDA')) return yahoo('NVDA', 150, 'USD')
      return null
    })
    await fetchStockQuotes(['NVDA'])
    const calls = fetchMock.mock.calls.length
    await fetchStockQuotes(['NVDA'])
    expect(fetchMock.mock.calls.length).toBe(calls)
  })

  it('makes no request for an empty or invalid list', async () => {
    const fetchMock = mockFetch(() => null)
    expect(await fetchStockQuotes(['', '../x'])).toEqual({ quotes: {}, usdMxn: null, usdMxnSource: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
