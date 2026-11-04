import { describe, it, expect, vi, afterEach } from 'vitest'
import { clearPaprikaSearchCache, fetchCryptoPrices } from '@/lib/crypto-prices'

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response
const paprika = (usd: number, mxn: number) => json({ quotes: { USD: { price: usd, percent_change_24h: 2 }, MXN: { price: mxn } } })

afterEach(() => { vi.unstubAllGlobals(); clearPaprikaSearchCache() })

describe('fetchCryptoPrices', () => {
  it('quotes HYPE from CoinGecko and falls back to its Hyperliquid ticker', async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes('coingecko')
      ? json({ hyperliquid: { usd: 78.56, mxn: 1451.7888, usd_24h_change: 1 } })
      : paprika(78.56, 1451.7888))
    vi.stubGlobal('fetch', fetchMock)
    expect((await fetchCryptoPrices(['HYPE']))?.HYPE.usd).toBe(78.56)
    expect(fetchMock.mock.calls[0][0]).toContain('ids=hyperliquid&')

    fetchMock.mockImplementation(async (url: string) => url.includes('coingecko') ? json('blocked', false) : paprika(78.56, 1451.7888))
    expect((await fetchCryptoPrices(['HYPE']))?.HYPE.mxn).toBe(1451.7888)
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain('/tickers/hype-hyperliquid?')
  })

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

  it('prices any held coin by its coingecko_id, still keyed by ticker', async () => {
    const fetchMock = vi.fn(async (_url: string) => json({
      bitcoin: { usd: 84000, mxn: 1500000, usd_24h_change: 1 },
      pepe: { usd: 0.00001, mxn: 0.0002, usd_24h_change: 5 },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const prices = await fetchCryptoPrices([{ symbol: 'BTC' }, { symbol: 'PEPE', coingecko_id: 'pepe' }, { symbol: 'NOID' }])
    expect(prices).toEqual({
      BTC: { usd: 84000, mxn: 1500000, change24h: 1 },
      PEPE: { usd: 0.00001, mxn: 0.0002, change24h: 5 },
    })
    expect(fetchMock.mock.calls[0][0]).toContain('ids=bitcoin,pepe&')
  })

  it("prices a built-in ticker as the holding's own coin when it says so", async () => {
    const fetchMock = vi.fn(async (_url: string) => json({ litentry: { usd: 1, mxn: 18 }, lighter: { usd: 99, mxn: 1800 } }))
    vi.stubGlobal('fetch', fetchMock)
    const prices = await fetchCryptoPrices(['LIT', { symbol: 'LIT', coingecko_id: 'litentry' }])
    expect(prices?.LIT.mxn).toBe(18)
    expect(fetchMock.mock.calls[0][0]).toContain('ids=litentry&')
  })

  it('falls back to a guessed Coinpaprika id for a new coin only when the ticker matches', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('coingecko')) return json('blocked', false)
      if (url.includes('doge-dogecoin')) return json({ symbol: 'DOGE', quotes: { USD: { price: 0.2, percent_change_24h: 1 }, MXN: { price: 3.6 } } })
      return json({ symbol: 'OTHER', quotes: { USD: { price: 1 }, MXN: { price: 18 } } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const prices = await fetchCryptoPrices([{ symbol: 'DOGE', coingecko_id: 'dogecoin' }, { symbol: 'WIF', coingecko_id: 'dogwifcoin' }])
    expect(prices).toEqual({ DOGE: { usd: 0.2, mxn: 3.6, change24h: 1 } })
    expect(fetchMock.mock.calls.map(c => c[0]).some(u => String(u).includes('/tickers/wif-dogwifcoin?'))).toBe(true)
  })

  it('knows the Coinpaprika id of major coins whose slug differs (XRP is xrp-xrp, not xrp-ripple)', async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes('coingecko')
      ? json('blocked', false)
      : json({ symbol: 'XRP', quotes: { USD: { price: 2, percent_change_24h: 1 }, MXN: { price: 36 } } }))
    vi.stubGlobal('fetch', fetchMock)
    const prices = await fetchCryptoPrices([{ symbol: 'XRP', coingecko_id: 'ripple' }])
    expect(prices?.XRP.mxn).toBe(36)
    expect(fetchMock.mock.calls[1][0]).toContain('/tickers/xrp-xrp?')
  })

  it('finds an unguessable Coinpaprika id by search, only when the ticker is unambiguous', async () => {
    const quote = json({ symbol: 'FOO', quotes: { USD: { price: 1, percent_change_24h: 0 }, MXN: { price: 18 } } })
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('coingecko')) return json('blocked', false)
      if (url.includes('/search?q=foo')) return json({ currencies: [{ id: 'foo-foo-network', symbol: 'FOO', is_active: true }, { id: 'bar-bar', symbol: 'BAR' }] })
      if (url.includes('/search?q=dup')) return json({ currencies: [{ id: 'dup-one', symbol: 'DUP' }, { id: 'dup-two', symbol: 'DUP' }] })
      if (url.includes('/tickers/foo-foo-network?')) return quote
      return json({}, false)
    })
    vi.stubGlobal('fetch', fetchMock)
    const prices = await fetchCryptoPrices([{ symbol: 'FOO', coingecko_id: 'foo-chain' }, { symbol: 'DUP', coingecko_id: 'dup-coin' }])
    expect(prices).toEqual({ FOO: { usd: 1, mxn: 18, change24h: 0 } })
    expect(fetchMock.mock.calls.some(c => /\/tickers\/dup-(one|two)/.test(String(c[0])))).toBe(false)
  })

  it('returns null when no source has prices', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    expect(await fetchCryptoPrices(['BTC'])).toBeNull()
  })
})
