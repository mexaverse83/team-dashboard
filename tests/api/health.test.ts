// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[] | Error>,
  counts: {} as Record<string, number>,
  claimed: new Set<string>(),
  ledgerDown: false,
  released: [] as string[],
  sent: [] as Array<{ title: string; owner: string | null }>,
  auth: { ok: true, method: 'api-key' } as Record<string, unknown>,
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  const res = () => {
    const rows = state.tables[table]
    if (rows instanceof Error) return { data: null, error: { message: rows.message }, count: null }
    return { data: rows ?? [], error: null, count: state.counts[table] ?? (rows ?? []).length }
  }
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(res()).then(resolve) }
  for (const method of ['select', 'eq', 'is', 'not', 'or', 'gte', 'lte', 'order', 'limit', 'overlaps', 'contains']) chain[method] = () => chain
  chain.delete = () => { state.released.push(table); return chain }
  chain.insert = () => Promise.resolve({ error: null })
  chain.upsert = (row: { dedupe_key?: string }) => ({
    select: async () => {
      if (state.ledgerDown) return { data: null, error: { message: 'relation does not exist' } }
      const fresh = !!row.dedupe_key && !state.claimed.has(row.dedupe_key)
      if (row.dedupe_key) state.claimed.add(row.dedupe_key)
      return { data: fresh ? [{ id: 'x' }] : [], error: null }
    },
    then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
  })
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => state.auth }))
vi.mock('@/lib/automation/push', () => ({
  hasPushAudience: async () => true,
  sendPush: async (_s: unknown, message: { title: string }, opts: { owner?: string | null }) => { state.sent.push({ title: message.title, owner: opts?.owner ?? null }); return { sent: 1, failed: 0, pruned: 0, targeted: 1 } },
}))
vi.mock('@/lib/automation/live-brief', () => ({
  financeLocale: () => 'es',
  loadLiveBrief: async () => ({
    summary: { current_month: { budget_vs_actual: [{ category: 'Other', spent: 12_000, budget: 3_500 }] } },
    brief: { week: { title: 'w', detail: 'd' }, household: { title: 'h' } },
  }),
}))
import { GET as health } from '@/app/api/finance/health/route'
import { GET as remindersGET } from '@/app/api/finance/reminders/route'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  state.tables = {}; state.counts = {}; state.claimed = new Set(); state.sent = []; state.ledgerDown = false; state.released = []
  state.auth = { ok: true, method: 'api-key' }
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T18:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

const getHealth = async () => (await health(new NextRequest('http://localhost/api/finance/health'))).json()

describe('GET /api/finance/health', () => {
  it('reports late and failing jobs from the heartbeat ledger', async () => {
    state.tables.finance_automation_heartbeats = [
      { job: 'process-recurring', last_ok_at: '2026-10-26T12:05:00Z', last_run_at: '2026-10-26T12:05:00Z', last_status: 'ok', expected_every_h: 24 },
      { job: 'net-worth', last_ok_at: '2026-10-27T12:10:00Z', last_run_at: '2026-10-28T12:10:00Z', last_status: 'error', last_error: 'snapshot read failed', expected_every_h: 24 },
    ]
    state.counts = { finance_transactions: 939, finance_recurring_income: 3 }
    const body = await getHealth()
    expect(body.status).toBe('failing')
    expect(body.jobs.find((j: { job: string }) => j.job === 'process-recurring')).toMatchObject({ status: 'late', source: 'ledger' })
    expect(body.jobs.find((j: { job: string }) => j.job === 'net-worth')).toMatchObject({ status: 'failing', last_error: 'snapshot read failed' })
    expect(body.checks).toMatchObject({ ledger: 'ok', service_key_present: true, transactions: { count: 939, page_size: 1000, pages: 1 }, recurring_income_active: 3 })
  })
  it('infers job times from data before the ledger is migrated', async () => {
    state.tables.finance_automation_heartbeats = new Error('relation does not exist')
    state.tables.finance_automation_runs = new Error('relation does not exist')
    state.tables.finance_transactions = [{ created_at: '2026-10-28T12:06:00Z' }]
    state.tables.finance_net_worth_snapshots = [{ created_at: '2026-10-28T12:11:00Z' }]
    state.counts = { finance_recurring_income: 0 }
    const body = await getHealth()
    expect(body.checks.ledger).toBe('missing')
    expect(body.jobs.map((j: { job: string; status: string; source: string }) => [j.job, j.status, j.source])).toEqual([
      ['process-recurring', 'ok', 'inferred'],
      ['net-worth', 'ok', 'inferred'],
    ])
    expect(body.problems).toContain('No salary is set to post automatically')
    expect(body.status).toBe('late')
  })
  it('does not call a quiet processor late from inferred data', async () => {
    state.tables.finance_automation_heartbeats = new Error('relation does not exist')
    state.tables.finance_automation_runs = new Error('relation does not exist')
    // Last auto post on the 8th: normal for a processor that only posts on due days.
    state.tables.finance_transactions = [{ created_at: '2026-10-08T12:06:00Z' }]
    state.tables.finance_net_worth_snapshots = [{ created_at: '2026-10-28T12:11:00Z' }]
    state.counts = { finance_recurring_income: 3 }
    const body = await getHealth()
    expect(body.jobs.find((j: { job: string }) => j.job === 'process-recurring')).toMatchObject({ status: 'unknown', source: 'inferred' })
    expect(body.status).toBe('ok')
  })
  it('still flags an inferred processor that has posted nothing for over a month', async () => {
    state.tables.finance_automation_heartbeats = new Error('relation does not exist')
    state.tables.finance_transactions = [{ created_at: '2026-09-01T12:06:00Z' }]
    state.tables.finance_net_worth_snapshots = [{ created_at: '2026-10-28T12:11:00Z' }]
    state.counts = { finance_recurring_income: 3 }
    const body = await getHealth()
    expect(body.jobs.find((j: { job: string }) => j.job === 'process-recurring')).toMatchObject({ status: 'late' })
  })
})

describe('reminders route', () => {
  it('sends each reminder once even when the scheduler retries', async () => {
    state.auth = { ok: true, method: 'cron' }
    const call = () => remindersGET(new NextRequest('http://localhost/api/finance/reminders'))
    const first = await (await call()).json()
    expect(first.sent).toBe(1)
    expect(state.sent).toEqual([{ title: 'Other se pasó del presupuesto', owner: null }])
    const second = await (await call()).json()
    expect(second.sent).toBe(0)
    expect(second.outcomes).toEqual([{ key: 'budget:Other:2026-10:100', status: 'duplicate' }])
    expect(state.sent).toHaveLength(1)
  })
  it('does not report a reminder as sent when the ledger is missing', async () => {
    state.auth = { ok: true, method: 'cron' }
    state.ledgerDown = true
    const body = await (await remindersGET(new NextRequest('http://localhost/api/finance/reminders'))).json()
    expect(body.sent).toBe(0)
    expect(body.outcomes).toEqual([{ key: 'budget:Other:2026-10:100', status: 'ledger-missing' }])
    expect(body.warnings.join()).toContain('automation-runs')
    expect(state.sent).toEqual([])
  })
  it('only previews for a signed-in GET', async () => {
    state.auth = { ok: true, method: 'user' }
    const body = await (await remindersGET(new NextRequest('http://localhost/api/finance/reminders'))).json()
    expect(body.sent).toBe(false)
    expect(body.reminders).toHaveLength(1)
    expect(state.sent).toEqual([])
  })
})
