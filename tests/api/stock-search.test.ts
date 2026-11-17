// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ ok: true }))
vi.mock('@/lib/finance-api-auth', () => ({
  authorizeFinanceRequest: async () => (auth.ok ? { ok: true } : { ok: false, response: new Response(null, { status: 401 }) }),
}))

import { GET } from '@/app/api/finance/investments/stocks/search/route'
import { clearStockSearchCache } from '@/lib/stock-search'

const YAHOO_NVIDIA = {
  quotes: [
    { exchange: 'NMS', shortname: 'NVIDIA Corporation', longname: 'NVIDIA Corporation', quoteType: 'EQUITY', symbol: 'NVDA', exchDisp: 'NASDAQ' },
    { exchange: 'CME', shortname: 'NVIDIA future', quoteType: 'FUTURE', symbol: 'SNVDA=F', exchDisp: 'Chicago Mercantile Exchange' },
    { exchange: 'BTS', shortname: 'T-Rex 2X Long NVIDIA', quoteType: 'ETF', symbol: 'NVDX', exchDisp: 'BATS Trading' },
    { exchange: 'TOR', shortname: 'NVIDIA CDR', quoteType: 'EQUITY', symbol: 'NVDA.TO', exchDisp: 'Toronto' },
    { exchange: 'MEX', shortname: 'NVIDIA CORP', quoteType: 'EQUITY', symbol: 'NVDA.MX', exchDisp: 'Mexico' },
  ],
}

const get = (q: string) => new NextRequest(`http://localhost/api/finance/investments/stocks/search?q=${encodeURIComponent(q)}`)

beforeEach(() => { auth.ok = true; clearStockSearchCache(); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('GET /api/finance/investments/stocks/search', () => {
  it('returns US and Mexican stocks and ETFs only, with exchange, type and currency', async () => {
    const fetchMock = vi.fn(async () => Response.json(YAHOO_NVIDIA))
    vi.stubGlobal('fetch', fetchMock)
    const res = await GET(get('nvidia'))
    expect(res.status).toBe(200)
    const { results } = await res.json()
    expect(results).toEqual([
      { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', type: 'stock', currency: 'USD' },
      { symbol: 'NVDX', name: 'T-Rex 2X Long NVIDIA', exchange: 'BATS Trading', type: 'etf', currency: 'USD' },
      { symbol: 'NVDA.MX', name: 'NVIDIA CORP', exchange: 'Mexico', type: 'stock', currency: 'MXN' },
    ])
    const url = String((fetchMock.mock.calls[0] as unknown as [string])[0])
    expect(url.startsWith('https://query1.finance.yahoo.com/v1/finance/search?q=nvidia&quotesCount=8&newsCount=0')).toBe(true)
  })

  it('keeps the query inside the query string of the fixed host (no SSRF)', async () => {
    const fetchMock = vi.fn(async () => Response.json({ quotes: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await GET(get('x&host=evil.example/#@other'))
    const url = new URL(String((fetchMock.mock.calls[0] as unknown as [string])[0]))
    expect(url.host).toBe('query1.finance.yahoo.com')
    expect(url.searchParams.get('q')).toBe('x&host=evil.example/#@other')
  })

  it('caches a query for a short while', async () => {
    const fetchMock = vi.fn(async () => Response.json(YAHOO_NVIDIA))
    vi.stubGlobal('fetch', fetchMock)
    await GET(get('nvidia'))
    await GET(get('NVIDIA'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('answers 502 with a clear error when Yahoo fails or times out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 429 })))
    const res = await GET(get('apple'))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Stock search failed (429)')

    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError') }))
    const timedOut = await GET(get('tesla'))
    expect(timedOut.status).toBe(502)
    expect((await timedOut.json()).error).toBe('Stock search timed out')
  })

  it('rejects an empty or overlong query without calling out', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect((await GET(get('  '))).status).toBe(400)
    expect((await GET(get('a'.repeat(41)))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('needs finance auth', async () => {
    auth.ok = false
    expect((await GET(get('nvidia'))).status).toBe(401)
  })
})
