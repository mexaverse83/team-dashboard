// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, fail: '', writes: [] as Array<{ table: string; op: string; payload: unknown }> }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  const result = () => Promise.resolve({ data: state.tables[table] ?? [], error: state.fail === table ? { message: 'offline' } : null })
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => result().then(resolve, reject) }
  for (const method of ['select', 'eq', 'ilike', 'order', 'limit', 'gte', 'lte', 'gt', 'single']) chain[method] = () => chain
  chain.insert = (payload: unknown) => { state.writes.push({ table, op: 'insert', payload }); return chain }
  chain.update = (payload: unknown) => { state.writes.push({ table, op: 'update', payload }); return chain }
  chain.delete = () => { state.writes.push({ table, op: 'delete', payload: null }); return chain }
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
vi.mock('@/lib/crypto-prices', () => ({ fetchCryptoPrices: async () => ({ BTC: { usd: 100000, mxn: 1800000, change24h: 0 } }) }))

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

  it('crypto: a holdings read error is a 500 that still carries prices', async () => {
    state.fail = 'finance_crypto_holdings'
    const res = await crypto.GET(get('/api/finance/crypto'))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeTruthy()
    expect(body.prices.BTC.mxn).toBe(1800000)
  })

  it('canonicalizes owner casing on holding inserts', async () => {
    const res = await stocks.POST(post('/api/finance/investments/stocks', { ticker: 'VOO', owner: 'laura' }))
    expect(res.status).toBe(200)
    expect(state.writes).toEqual([{ table: 'finance_stock_holdings', op: 'insert', payload: { ticker: 'VOO', owner: 'Laura' } }])
  })
})
