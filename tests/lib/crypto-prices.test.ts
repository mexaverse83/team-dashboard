import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchCryptoPrices } from '@/lib/crypto-prices'

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response
const paprika = (usd: number, mxn: number) => json({ quotes: { USD: { price: usd, percent_change_24h: 2 }, MXN: { price: mxn } } })

afterEach(() => vi.unstubAllGlobals())

describe('fetchCryptoPrices', () => {
  it('uses CoinGecko when it answers', async () => {
    const fetchMock = vi.fn(async () => json({ kaspa: { usd: 0.05, mxn: 0.9, usd_24h_change: 3 } }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchCryptoPrices(['KAS'])).toEqual({ KAS: { usd: 0.05, mxn: 0.9, change24h: 3 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to Coinpaprika when CoinGecko is blocked', async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes('coingecko') ? json('blocked', false) : paprika(84000, 1500000))
    vi.stubGlobal('fetch', fetchMock)
    const prices = await fetchCryptoPrices(['BTC'])
    expect(prices).toEqual({ BTC: { usd: 84000, mxn: 1500000, change24h: 2 } })
    expect(fetchMock.mock.calls[1][0]).toContain('coinpaprika.com/v1/tickers/btc-bitcoin')
  })

  it('fills only the coins CoinGecko missed', async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes('coingecko')
      ? json({ bitcoin: { usd: 84000, mxn: 1500000 } })
      : paprika(0.045, 0.81))
    vi.stubGlobal('fetch', fetchMock)
    const prices = await fetchCryptoPrices(['BTC', 'KAS'])
    expect(prices?.BTC.mxn).toBe(1500000)
    expect(prices?.KAS.mxn).toBe(0.81)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns null when no source has prices', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await fetchCryptoPrices(['BTC'])).toBeNull()
  })
})
