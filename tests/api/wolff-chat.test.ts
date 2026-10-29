// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Call = [string, ...unknown[]]
const state = vi.hoisted(() => ({
  rows: [] as Row[],
  queries: [] as Array<{ table: string; calls: Call[] }>,
  insert: vi.fn(),
  failTable: '',
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  const calls: Call[] = []
  state.queries.push({ table, calls })
  const result = () => {
    if (state.failTable === table) return { data: null, error: { message: 'date/time field value out of range' } }
    let rows = table === 'finance_wolff_chat' ? [...state.rows] : []
    for (const [m, ...args] of calls) {
      if (m === 'eq') rows = rows.filter(r => r[args[0] as string] === args[1])
      if (m === 'like') rows = rows.filter(r => String(r[args[0] as string] ?? '').startsWith(String(args[1]).replace('%', '')))
      if (m === 'gt') rows = rows.filter(r => String(r[args[0] as string]) > String(args[1]))
      if (m === 'order') rows.sort((a, b) => (String(a[args[0] as string]) < String(b[args[0] as string]) ? -1 : 1) * ((args[1] as { ascending: boolean }).ascending ? 1 : -1))
      if (m === 'limit') rows = rows.slice(0, args[0] as number)
    }
    return { data: rows, error: null }
  }
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve) }
  for (const m of ['select', 'eq', 'like', 'gt', 'gte', 'lt', 'lte', 'order', 'limit', 'ilike']) chain[m] = (...args: unknown[]) => { calls.push([m, ...args]); return chain }
  chain.insert = (row: unknown) => { state.insert(table, row); return Promise.resolve({ error: null }) }
  chain.upsert = () => Promise.resolve({ error: null })
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true, method: 'user' }) }))
import { GET } from '@/app/api/finance/wolff-chat/route'
import { POST as eventPOST } from '@/app/api/finance/wolff-events/route'

const msg = (id: string, minute: number, extra: Row = {}) => ({ id, role: 'user', content: id, status: 'answered', created_at: `2026-10-28T10:${String(minute).padStart(2, '0')}:00Z`, ...extra })

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  state.rows = []; state.queries = []; state.insert.mockReset(); state.failTable = ''
})
afterEach(() => vi.unstubAllEnvs())

const get = async (qs = '') => (await GET(new NextRequest(`http://localhost/api/finance/wolff-chat${qs}`))).json()

describe('wolff-chat GET', () => {
  it('returns the newest N messages in ascending order', async () => {
    state.rows = Array.from({ length: 60 }, (_, i) => msg(`m${i}`, i % 60))
    const body = await get('?limit=3')
    expect(body.messages.map((m: Row) => m.id)).toEqual(['m57', 'm58', 'm59'])
    expect((await get()).messages).toHaveLength(50)
  })
  it('returns only messages after ?since, ascending', async () => {
    state.rows = [msg('a', 1), msg('b', 2), msg('c', 3)]
    const body = await get('?since=2026-10-28T10:01:00Z')
    expect(body.messages.map((m: Row) => m.id)).toEqual(['b', 'c'])
    expect((await GET(new NextRequest('http://localhost/api/finance/wolff-chat?since=garbage'))).status).toBe(400)
  })
  it('returns the latest proactive question with its reply', async () => {
    state.rows = [
      msg('q1', 1, { asked_by: 'wolff-monitor:tx-1' }),
      msg('chat', 2, { asked_by: null }),
      msg('q2', 3, { asked_by: 'wolff-monitor:tx-2' }),
      { id: 'r2', role: 'wolff', content: 'Calm verdict', reply_to: 'q2', created_at: '2026-10-28T10:04:00Z' },
    ]
    const body = await get('?latest_proactive=1')
    expect(body.latest_proactive.question.id).toBe('q2')
    expect(body.latest_proactive.reply).toMatchObject({ id: 'r2', content: 'Calm verdict' })
    state.rows = [msg('chat', 2)]
    expect((await get('?latest_proactive=1')).latest_proactive).toBeNull()
  })
})

describe('wolff-events POST', () => {
  const post = (body: Row) => eventPOST(new NextRequest('http://localhost/api/finance/wolff-events', { method: 'POST', body: JSON.stringify(body) }))
  it('bounds a November month with < Dec 1, never a -31 date', async () => {
    await post({ transaction_id: 'tx-9', amount_mxn: 6_000, category_id: 'cat', merchant: 'Liverpool', transaction_date: '2026-11-20' })
    const args = state.queries.flatMap(q => q.calls).flatMap(([, ...a]) => a).map(String)
    expect(args.some(a => /-31$/.test(a))).toBe(false)
    expect(state.queries.flatMap(q => q.calls).filter(([m]) => m === 'lt').map(c => c[2])).toEqual(['2026-12-01', '2026-12-01'])
    const queued = state.insert.mock.calls.find(([t]) => t === 'finance_wolff_chat')?.[1] as Row
    expect(queued.asked_by).toBe('wolff-monitor:tx-9')
    expect(String(queued.content)).not.toMatch(/treatment/i)
    expect(String(queued.content)).toMatch(/baby-plan liquidity/)
  })
  it('answers 503 instead of a false "no budget" alarm when a lookup fails', async () => {
    state.failTable = 'finance_budgets'
    const res = await post({ transaction_id: 'tx-10', amount_mxn: 2_000, category_id: 'cat', transaction_date: '2026-09-15' })
    expect(res.status).toBe(503)
    expect(state.insert.mock.calls.some(([t]) => t === 'finance_wolff_chat')).toBe(false)
  })
  it('dedupes an import by the hash of its transaction ids', async () => {
    await post({ kind: 'imported', import_ids: ['b', 'a'], import_count: 2, import_total: 9_000 })
    const first = (state.insert.mock.calls.find(([t]) => t === 'finance_wolff_chat')?.[1] as Row).asked_by
    state.insert.mockReset()
    await post({ kind: 'imported', import_ids: ['a', 'b'], import_count: 2, import_total: 9_000 })
    expect((state.insert.mock.calls.find(([t]) => t === 'finance_wolff_chat')?.[1] as Row).asked_by).toBe(first)
    expect(String(first)).toMatch(/^wolff-monitor:import-[0-9a-f]{32}$/)
  })
})
