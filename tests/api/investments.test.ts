// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, fail: '', writes: [] as Array<{ table: string; op: string; payload: unknown }> }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  let one = false
  const rows = () => state.tables[table] ?? []
  const result = () => Promise.resolve({ data: one ? rows()[0] ?? null : rows(), error: state.fail === table ? { message: 'offline' } : null })
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => result().then(resolve, reject) }
  for (const method of ['select', 'eq', 'in', 'ilike', 'order', 'limit', 'gte', 'lte', 'gt']) chain[method] = () => chain
  chain.single = chain.maybeSingle = () => { one = true; return chain }
  chain.insert = (payload: unknown) => { state.writes.push({ table, op: 'insert', payload }); return chain }
  chain.update = (payload: unknown) => { state.writes.push({ table, op: 'update', payload }); return chain }
  chain.delete = () => { state.writes.push({ table, op: 'delete', payload: null }); return chain }
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
vi.mock('@/lib/crypto-prices', () => ({ fetchCryptoPrices: async () => ({ BTC: { usd: 100000, mxn: 1800000, change24h: 0 } }), impliedUsdMxn: () => 18 }))
vi.mock('@/lib/stock-prices', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/stock-prices')>()),
  fetchStockQuotes: async () => ({ quotes: { NVDA: { symbol: 'NVDA', price: 150, currency: 'USD', previousClose: 148, change: 2, changePct: 1.35, usd: 150, mxn: 2775, source: 'yahoo' } }, usdMxn: 18.5, usdMxnSource: 'yahoo' }),
}))

import * as stocks from '@/app/api/finance/investments/stocks/route'
import * as fixedIncome from '@/app/api/finance/investments/fixed-income/route'
import * as realEstate from '@/app/api/finance/investments/real-estate/route'
import * as retirement from '@/app/api/finance/retirement/route'
import * as crypto from '@/app/api/finance/crypto/route'

const get = (url: string) => new NextRequest(`http://localhost${url}`)
const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) })

beforeEach(() => {
  state.tables = {}; state.fail = ''; state.writes = []
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('investments API failures are loud (F18, VIS-17)', () => {
  it.each([
    ['stocks', stocks.GET, '/api/finance/investments/stocks', 'finance_stock_holdings', 'stocks'],
    ['fixed income', fixedIncome.GET, '/api/finance/investments/fixed-income', 'finance_fixed_income', 'instruments'],
    ['real estate', realEstate.GET, '/api/finance/investments/real-estate', 'finance_real_estate', 'properties'],
  ])('%s: a database error is a 500 with an error body, not 200 with []', async (_label, GET, url, table, key) => {
    state.fail = table
    const res = await GET(get(url))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeTruthy()
    expect(body[key]).toBeUndefined()
  })

  it('returns rows on success', async () => {
    state.tables.finance_stock_holdings = [{ id: 's1', ticker: 'VOO' }]
    const res = await stocks.GET(get('/api/finance/investments/stocks'))
    expect(res.status).toBe(200)
    expect((await res.json()).stocks).toEqual([{ id: 's1', ticker: 'VOO' }])
  })

  it('answers 503 instead of an anon-key read when the service key is missing in production', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    const res = await stocks.GET(get('/api/finance/investments/stocks'))
    expect(res.status).toBe(503)
  })

  it('retirement: a database error is a 500', async () => {
    state.fail = 'finance_retirement'
    const res = await retirement.GET(get('/api/finance/retirement'))
    expect(res.status).toBe(500)
  })

  it('crypto: editing only notes keeps the cost basis and currency', async () => {
    const res = await crypto.POST(post('/api/finance/crypto', { id: 'c1', symbol: 'BTC', quantity: 0.5, notes: 'cold wallet' }))
    expect(res.status).toBe(200)
    const write = state.writes.find(w => w.table === 'finance_crypto_holdings' && w.op === 'update')
    const patch = write?.payload as Record<string, unknown>
    expect(patch.notes).toBe('cold wallet')
    expect(patch.quantity).toBe(0.5)
    expect('avg_cost_basis_usd' in patch).toBe(false)
    expect('cost_currency' in patch).toBe(false)
    expect('owner' in patch).toBe(false)
  })

  it('crypto: a new holding still gets insert defaults', async () => {
    await crypto.POST(post('/api/finance/crypto', { symbol: 'BTC', quantity: 0, owner: 'laura' }))
    const write = state.writes.find(w => w.op === 'insert')
    expect(write?.payload).toMatchObject({ avg_cost_basis_usd: null, cost_currency: 'MXN', owner: 'Laura' })
  })

  it('crypto: a holdings read error is a 500 that still carries prices', async () => {
    state.fail = 'finance_crypto_holdings'
    const res = await crypto.GET(get('/api/finance/crypto'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeTruthy()
    expect(body.prices.BTC.mxn).toBe(1800000)
  })

  it('canonicalizes owner casing on holding inserts', async () => {
    const res = await stocks.POST(post('/api/finance/investments/stocks', { ticker: 'voo', owner: 'laura' }))
    expect(res.status).toBe(201)
    expect(state.writes).toEqual([{ table: 'finance_stock_holdings', op: 'insert', payload: expect.objectContaining({ ticker: 'VOO', owner: 'Laura', currency: 'USD', shares: 0, asset_type: 'stock' }) }])
  })

  it('stocks GET carries live quotes for public tickers', async () => {
    state.tables.finance_stock_holdings = [
      { id: 'n', ticker: 'NVDA', shares: 0.34692423, asset_type: 'stock', currency: 'USD' },
      { id: 'pe', ticker: 'NXM', shares: 10000, asset_type: 'private_equity', currency: 'USD' },
    ]
    const body = await (await stocks.GET(get('/api/finance/investments/stocks'))).json()
    expect(body.quotes.NVDA.mxn).toBe(2775)
    expect(body.quotes.NXM).toBeUndefined()
    expect(body.usd_mxn).toBe(18.5)
    expect(body.transactions_ready).toBe(true)
  })

  it('stocks: refuses an invalid ticker and never edits or removes private equity', async () => {
    expect((await stocks.POST(post('/api/finance/investments/stocks', { ticker: 'https://evil', owner: 'laura' }))).status).toBe(400)
    state.tables.finance_stock_holdings = [{ id: 'pe', ticker: 'NXM', asset_type: 'private_equity' }]
    expect((await stocks.POST(post('/api/finance/investments/stocks', { id: 'pe', shares: 1 }))).status).toBe(409)
    const del = await stocks.DELETE(new NextRequest('http://localhost/api/finance/investments/stocks', { method: 'DELETE', body: JSON.stringify({ ids: ['pe'] }) }))
    expect(del.status).toBe(409)
    expect(state.writes).toEqual([])
  })
})
