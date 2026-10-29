// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  upsert: vi.fn(),
  insert: vi.fn(),
  auth: { ok: true, method: 'cron' } as Record<string, unknown>,
  west: null as null | { target: number; current_status: { amount_paid: number } },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.tables[table] ?? [], error: null }).then(resolve) }
  for (const method of ['select', 'eq', 'gte', 'order', 'limit']) chain[method] = () => chain
  chain.upsert = (row: unknown) => { state.upsert(table, row); return Promise.resolve({ error: null }) }
  chain.insert = (row: unknown) => { state.insert(table, row); return Promise.resolve({ error: null }) }
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => state.auth }))
vi.mock('@/lib/crypto-prices', () => ({ fetchCryptoPrices: async () => ({ BTC: { usd: 100_000, mxn: 1_900_000, change24h: 0 } }) }))
vi.mock('@/lib/server/west', () => ({
  getWestProjection: async () => { if (!state.west) throw new Error('no target'); return state.west },
}))
import { GET, POST } from '@/app/api/finance/net-worth/route'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  state.tables = {
    finance_real_estate: [{ name: 'WEST Apartment', property_type: 'pre_sale', current_value: 13_500_000, mortgage_balance: 8_699_300 }],
    finance_stock_holdings: [{ shares: 10, current_price: 100, currency: 'USD' }],
    finance_crypto_holdings: [{ symbol: 'BTC', quantity: 0.1 }],
    finance_net_worth_snapshots: [{ snapshot_date: '2026-10-27', net_worth: 1 }, { snapshot_date: '2026-10-28', net_worth: 2 }],
  }
  state.upsert.mockReset(); state.insert.mockReset()
  state.auth = { ok: true, method: 'cron' }
  state.west = { target: 11_204_000, current_status: { amount_paid: 2_600_000 } }
  vi.useFakeTimers()
  // 20:00 on Oct 28 in Mexico City is already Oct 29 in UTC.
  vi.setSystemTime(new Date('2026-10-29T02:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

const snapshotWrite = () => state.upsert.mock.calls.find(([t]) => t === 'finance_net_worth_snapshots')?.[1] as Row | undefined

describe('net-worth snapshots', () => {
  it('writes on a cron GET, dated on the Mexico City calendar', async () => {
    const response = await GET(new NextRequest('http://localhost/api/finance/net-worth'))
    expect(response.status).toBe(200)
    expect(snapshotWrite()).toMatchObject({ snapshot_date: '2026-10-28' })
    expect(state.insert.mock.calls.find(([t]) => t === 'finance_automation_runs')?.[1]).toMatchObject({ job: 'net-worth', status: 'ok', trigger: 'cron' })
  })
  it('does not write on a plain GET from a user', async () => {
    state.auth = { ok: true, method: 'user' }
    const body = await (await GET(new NextRequest('http://localhost/api/finance/net-worth'))).json()
    expect(snapshotWrite()).toBeUndefined()
    expect(body.snapshots).toHaveLength(2)
  })
  it('answers ?latest=1 with one row', async () => {
    state.auth = { ok: true, method: 'user' }
    const body = await (await GET(new NextRequest('http://localhost/api/finance/net-worth?latest=1'))).json()
    expect(body.summary.latest).toMatchObject({ net_worth: 1 })
    expect(body.snapshots).toBeUndefined()
  })
  it('values WEST equity from paid-to-date and USD holdings at the live implied rate', async () => {
    const body = await (await POST(new NextRequest('http://localhost/api/finance/net-worth', { method: 'POST' }))).json()
    expect(body.breakdown.real_estate).toBe(13_500_000 - (11_204_000 - 2_600_000))
    expect(body.usd_mxn).toBe(19)
    expect(body.usd_mxn_source).toBe('live')
    expect(body.breakdown.stocks).toBe(19_000)
  })
  it('falls back to the stored mortgage balance when the WEST tracker is unavailable', async () => {
    state.west = null
    const body = await (await POST(new NextRequest('http://localhost/api/finance/net-worth', { method: 'POST' }))).json()
    expect(body.breakdown.real_estate).toBe(13_500_000 - 8_699_300)
  })
})
