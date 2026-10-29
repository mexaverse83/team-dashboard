// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  cache: [] as Array<Record<string, unknown>>,
  insert: vi.fn(),
  summaryFails: false,
  auth: { ok: true, method: 'user' } as Record<string, unknown>,
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === 'finance_insights_cache' ? state.cache : [], error: null }).then(resolve) }
  for (const method of ['select', 'eq', 'order', 'limit']) chain[method] = () => chain
  chain.insert = (row: unknown) => { state.insert(table, row); return Promise.resolve({ error: null }) }
  chain.upsert = () => Promise.resolve({ error: null })
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => state.auth }))
vi.mock('@/lib/server/summary', () => ({
  buildSummary: async () => {
    if (state.summaryFails) throw new Error('summary down')
    return {
      current_month: { month: '2026-10', day_of_month: 28, days_in_month: 31, total_spent: 120_000, budget_vs_actual: [{ category: 'Dining Out', spent: 3_000, budget: 6_000 }] },
      month_projection: { projected_savings: 83_536 },
      income: { current_month_actual: 208_800 },
    }
  },
}))
vi.mock('@/lib/server/west', () => ({ getWestProjection: async () => null }))
import { GET, POST } from '@/app/api/finance/insights/route'

const SEPTEMBER_BRIEF = [
  { type: 'recommendation', icon: '🐺', title: 'Protege $108,231 para WEST hoy', detail: 'meta WEST de septiembre', priority: 'high', category: 'WIDGET' },
  { type: 'alert', icon: '🍽', title: 'Sep 5–6: sí cabe una cena', detail: 'fin de semana', priority: 'medium', category: 'WEEK' },
  { type: 'forecast', icon: '🏠', title: 'WEST readiness', detail: 'on track', priority: 'low', category: 'WEST' },
]

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  vi.stubEnv('FINANCE_LOCALE', 'en')
  state.cache = [{ insights_json: SEPTEMBER_BRIEF, generated_at: '2026-09-04T13:30:53Z', period_month: '2026-09-01' }]
  state.insert.mockReset(); state.summaryFails = false
  state.auth = { ok: true, method: 'user' }
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T18:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

const get = async () => (await GET(new NextRequest('http://localhost/api/finance/insights'))).json()

describe('insights freshness contract', () => {
  it('never serves the Sep 4 brief as current on Oct 28', async () => {
    const body = await get()
    expect(body.expired).toBe(true)
    expect(body.source).toBe('live')
    expect(body.llm_generated_at).toBe('2026-09-04T13:30:53Z')
    const current = JSON.stringify(body.insights)
    expect(current).not.toMatch(/septiembre|Sep 5–6|108,231/)
    expect(body.archived.map((i: { title: string }) => i.title)).toEqual(SEPTEMBER_BRIEF.map(i => i.title))
    expect(body.insights[0]).toMatchObject({ category: 'WIDGET', source: 'live' })
    expect(body.brief.directive.title).toBeTruthy()
  })
  it('serves a same-day LLM brief as source llm', async () => {
    state.cache = [{ insights_json: SEPTEMBER_BRIEF, generated_at: '2026-10-28T13:30:00Z', period_month: '2026-10-01' }]
    const body = await get()
    expect(body).toMatchObject({ source: 'llm', expired: false, archived: [] })
    expect(body.insights).toHaveLength(3)
  })
  it('keeps yesterday\'s non-daily items but replaces the daily ones', async () => {
    state.cache = [{ insights_json: SEPTEMBER_BRIEF, generated_at: '2026-10-27T13:30:00Z', period_month: '2026-10-01' }]
    const body = await get()
    expect(body.source).toBe('live')
    expect(body.insights.filter((i: { source: string }) => i.source === 'llm').map((i: { title: string }) => i.title)).toEqual(['WEST readiness'])
    expect(body.archived.map((i: { category: string }) => i.category)).toEqual(['WIDGET', 'WEEK'])
  })
  it('falls back to no current items, not stale ones, when live numbers are unavailable', async () => {
    state.summaryFails = true
    const body = await get()
    expect(body.insights).toEqual([])
    expect(body.archived).toHaveLength(3)
    expect(body.live_error).toBeTruthy()
  })
  it('reports an empty cache without inventing an LLM brief', async () => {
    state.cache = []
    const body = await get()
    expect(body).toMatchObject({ source: 'live', expired: false, empty: true, archived: [] })
  })
})

describe('POST /api/finance/insights', () => {
  const post = (body: unknown) => POST(new NextRequest('http://localhost/api/finance/insights', { method: 'POST', body: JSON.stringify(body) }))
  it('stores a script-generated brief with the API key only', async () => {
    expect((await post({ insights: SEPTEMBER_BRIEF })).status).toBe(403)
    state.auth = { ok: true, method: 'api-key' }
    const res = await post({ insights: SEPTEMBER_BRIEF })
    expect(res.status).toBe(200)
    expect(state.insert.mock.calls.find(([t]) => t === 'finance_insights_cache')?.[1]).toMatchObject({ period_month: '2026-10-01' })
    expect(state.insert.mock.calls.find(([t]) => t === 'finance_automation_runs')?.[1]).toMatchObject({ job: 'insights', status: 'ok', trigger: 'codex' })
  })
  it('generates only on POST { refresh: true }, never on a GET link', async () => {
    const viaGet = await (await GET(new NextRequest('http://localhost/api/finance/insights?refresh=true'))).json()
    expect(viaGet.source).toBe('live')
    expect(state.insert.mock.calls.find(([t]) => t === 'finance_insights_cache')).toBeUndefined()
    // A signed-in user may ask for a refresh by POST; without an AI key it explains instead of 403.
    const res = await post({ refresh: true })
    expect(res.status).not.toBe(403)
  })
})
