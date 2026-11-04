// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ ok: true }))
vi.mock('@/lib/finance-api-auth', () => ({
  authorizeFinanceRequest: async () => auth.ok
    ? { ok: true }
    : { ok: false, response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) },
}))

import { GET } from '@/app/api/finance/crypto/search/route'
import { clearCoinSearchCache, searchCoins } from '@/lib/crypto-search'

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response
const get = (q?: string) => new NextRequest(`http://localhost/api/finance/crypto/search${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`)

const COINS = {
  coins: [
    { id: 'pepecoin-2', name: 'PepeCoin', symbol: 'pepecoin', market_cap_rank: null, thumb: 'https://coin-images.coingecko.com/p2.png', large: 'x' },
    { id: 'pepe', name: 'Pepe', api_symbol: 'pepe', symbol: 'PEPE', market_cap_rank: 45, thumb: 'https://coin-images.coingecko.com/pepe.jpg', large: 'y' },
    { id: 'ape-and-pepe', name: 'Ape and Pepe', symbol: 'APEPE', market_cap_rank: 145, thumb: 'http://insecure.example/x.png' },
    { name: 'broken' },
    { id: 'long-ticker', name: 'Long', symbol: 'THISTICKERISWAYTOOLONG', market_cap_rank: 9 },
    { id: 'odd-ticker', name: 'Odd', symbol: 'A$B', market_cap_rank: 10 },
  ],
  exchanges: [{ id: 'binance' }],
}

beforeEach(() => {
  auth.ok = true
  clearCoinSearchCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('GET /api/finance/crypto/search', () => {
  it('proxies CoinGecko search, trimmed to id/symbol/name/thumb/rank and ranked by market cap', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(COINS))
    vi.stubGlobal('fetch', fetchMock)
    const res = await GET(get(' Pepe '))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('max-age=300')
    const body = await res.json()
    expect(body.coins).toEqual([
      { id: 'pepe', symbol: 'PEPE', name: 'Pepe', thumb: 'https://coin-images.coingecko.com/pepe.jpg', market_cap_rank: 45 },
      { id: 'ape-and-pepe', symbol: 'APEPE', name: 'Ape and Pepe', thumb: null, market_cap_rank: 145 },
      { id: 'pepecoin-2', symbol: 'PEPECOIN', name: 'PepeCoin', thumb: 'https://coin-images.coingecko.com/p2.png', market_cap_rank: null },
    ])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.coingecko.com/api/v3/search?query=pepe')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends the optional CoinGecko key as a header, never in the URL or the answer', async () => {
    vi.stubEnv('COINGECKO_API_KEY', 'cg-secret')
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(COINS))
    vi.stubGlobal('fetch', fetchMock)
    const res = await GET(get('pepe'))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).not.toContain('cg-secret')
    expect((init?.headers as Record<string, string>)['x-cg-demo-api-key']).toBe('cg-secret')
    expect(await res.text()).not.toContain('cg-secret')
  })

  it('caches a query for a few minutes', async () => {
    const fetchMock = vi.fn(async () => json(COINS))
    vi.stubGlobal('fetch', fetchMock)
    await searchCoins('pepe', { now: 1_000 })
    await searchCoins('PEPE', { now: 60_000 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await searchCoins('pepe', { now: 1_000 + 11 * 60_000 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('answers 400 for an empty or oversized query without calling CoinGecko', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await GET(get())).status).toBe(400)
    expect((await GET(get('   '))).status).toBe(400)
    expect((await GET(get('x'.repeat(51)))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 502 when CoinGecko fails or times out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, false, 429)))
    const limited = await GET(get('btc'))
    expect(limited.status).toBe(502)
    expect((await limited.json()).error).toMatch(/429/)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError') }))
    const timedOut = await GET(get('eth'))
    expect(timedOut.status).toBe(502)
    expect((await timedOut.json()).error).toMatch(/timed out/)
  })

  it('requires finance auth', async () => {
    auth.ok = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await GET(get('btc'))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
