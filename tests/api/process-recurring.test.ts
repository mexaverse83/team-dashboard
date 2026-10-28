// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  fail: '',
  insert: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  rpc: vi.fn(),
  upsertResult: null as null | ((table: string, row: Row) => { data: unknown; error: unknown }),
  auth: { ok: true, method: 'api-key' } as Record<string, unknown>,
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: state.rpc, from: (table: string) => {
  const filters: Array<[string, unknown]> = []
  const result = () => ({
    data: (state.tables[table] ?? []).filter(row => filters.every(([k, v]) => !(k in row) || row[k] === v)),
    error: state.fail === table ? { message: 'query failed' } : null,
  })
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve) }
  for (const method of ['select', 'gte', 'lte', 'order', 'limit', 'ilike']) chain[method] = () => chain
  chain.eq = (k: string, v: unknown) => { filters.push([k, v]); return chain }
  chain.insert = (row: unknown) => { state.insert(table, row); return Promise.resolve({ error: null }) }
  chain.update = (row: unknown) => { state.update(table, row); return { eq: () => Promise.resolve({ error: null }) } }
  chain.upsert = (row: Row) => {
    state.upsert(table, row)
    const res = state.upsertResult?.(table, row) ?? { data: [{ id: 'new' }], error: null }
    const thenable = { select: () => Promise.resolve(res), then: (r: (v: unknown) => unknown) => Promise.resolve(res).then(r) }
    return thenable
  }
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => state.auth }))
import { GET, POST } from '@/app/api/finance/process-recurring/route'

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://supabase.test')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service')
  state.tables = { finance_monthly_savings: [{ month: '2026-08-01', owner: 'total' }] }; state.fail = ''
  state.insert.mockReset(); state.upsert.mockReset(); state.update.mockReset()
  state.rpc.mockReset().mockResolvedValue({ data: null, error: null })
  state.upsertResult = null
  state.auth = { ok: true, method: 'api-key' }
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
const process = () => POST(new NextRequest('http://localhost/api/finance/process-recurring', { method: 'POST' }))
const txUpserts = () => state.upsert.mock.calls.filter(([t]) => t === 'finance_transactions').map(([, row]) => row as Row)
const closes = () => state.rpc.mock.calls.filter(([fn]) => fn === 'finance_close_month').map(([, args]) => args.p_month)

describe('recurring processor safeguards', () => {
  it('never inserts when a subscription duplicate check fails', async () => {
    state.tables.finance_recurring = [{ id: 'sub', name: 'Internet', amount: 500, currency: 'MXN', frequency: 'monthly', next_due_date: '2026-09-01' }]
    state.fail = 'finance_transactions'
    const response = await process()
    expect(response.status).toBe(503)
    expect(state.insert.mock.calls.some(([t]) => t === 'finance_transactions')).toBe(false)
    expect(state.upsert.mock.calls.some(([t]) => t === 'finance_transactions')).toBe(false)
    expect(closes()).toEqual([])
  })
  it('does not silently equate USD and MXN, and reports it as a warning that does not block close', async () => {
    state.tables.finance_recurring = [{ id: 'sub', name: 'USD subscription', amount: 20, currency: 'USD', frequency: 'monthly', next_due_date: '2026-09-01' }]
    const response = await process()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(txUpserts()).toEqual([])
    expect(body.item_warnings).toEqual([{ item: 'Subscription USD subscription', message: expect.stringContaining('MXN') }])
    expect(body.results.errors).toEqual([])
  })
  it('an item warning does not stop an unrelated month close', async () => {
    state.tables.finance_monthly_savings = [{ month: '2026-07-01', owner: 'total' }]
    state.tables.finance_recurring = [{ id: 'sub', name: 'Odd', amount: 20, currency: 'MXN', frequency: 'fortnightly', next_due_date: '2026-09-01' }]
    const response = await process()
    expect(response.status).toBe(200)
    expect(closes()).toEqual(['2026-08-01'])
    expect((await response.json()).closed_months.map((m: { month: string }) => m.month)).toEqual(['2026-08-01'])
  })
  it('defers month close when a budget lookup fails', async () => {
    state.fail = 'finance_budgets'
    expect((await process()).status).toBe(503)
    expect(closes()).toEqual([])
  })
  it('stops at the first failed atomic close and makes the failure observable', async () => {
    state.tables.finance_monthly_savings = [{ month: '2026-06-01', owner: 'total' }]
    state.rpc.mockImplementation(async (fn: string) => fn === 'finance_close_month' ? { error: { message: 'migration missing' } } : { data: null, error: null })
    const response = await process()
    expect(response.status).toBe(503)
    expect(closes()).toEqual(['2026-07-01'])
    expect((await response.json()).ok).toBe(false)
  })
  it('closes three prior months when there is no snapshot history', async () => {
    state.tables.finance_monthly_savings = []
    expect((await process()).status).toBe(200)
    expect(closes()).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
  })
})

describe('MSI catch-up', () => {
  it('posts each missed period at its due day and this month at the due day once passed', async () => {
    state.tables.finance_installments = [{ id: 'msi', name: 'Laptop', installment_count: 12, installment_amount: 1000, start_date: '2026-06-05', payments_made: 1, owner: 'bernardo', credit_card: null }]
    state.rpc.mockImplementation(async (fn: string) => ({ data: fn === 'finance_post_msi_payment' ? 'tx-id' : null, error: null }))
    const body = await (await process()).json()
    const posts = state.rpc.mock.calls.filter(([fn]) => fn === 'finance_post_msi_payment').map(([, a]) => [a.p_number, a.p_tx.transaction_date, a.p_tx.owner])
    expect(posts).toEqual([[2, '2026-07-05', 'Bernardo'], [3, '2026-08-05', 'Bernardo'], [4, '2026-09-05', 'Bernardo']])
    expect(body.results.installments).toBe(3)
  })
  it('dates the current month today when the due day has not arrived', async () => {
    state.tables.finance_installments = [{ id: 'msi', name: 'Phone', installment_count: 6, installment_amount: 500, start_date: '2026-08-20', payments_made: 1 }]
    await process()
    const posts = state.rpc.mock.calls.filter(([fn]) => fn === 'finance_post_msi_payment').map(([, a]) => a.p_tx.transaction_date)
    expect(posts).toEqual(['2026-09-08'])
  })
  it('falls back to insert + advance when the atomic RPC is not installed', async () => {
    state.tables.finance_installments = [{ id: 'msi', name: 'Phone', installment_count: 6, installment_amount: 500, start_date: '2026-09-01', payments_made: 0 }]
    state.rpc.mockImplementation(async (fn: string) => fn === 'finance_post_msi_payment'
      ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.finance_post_msi_payment' } }
      : { data: null, error: null })
    const body = await (await process()).json()
    expect(txUpserts()).toHaveLength(1)
    expect(state.update).toHaveBeenCalledWith('finance_installments', { payments_made: 1 })
    expect(body.item_warnings.map((w: { message: string }) => w.message).join()).toContain('msi-atomic')
  })
})

describe('idempotency and income', () => {
  it('ignores a duplicate insert that loses the race to the unique index', async () => {
    state.tables.finance_recurring = [{ id: 'sub', name: 'Internet', amount: 500, currency: 'MXN', frequency: 'monthly', next_due_date: '2026-09-01' }]
    state.upsertResult = (table) => table === 'finance_transactions' ? { data: [], error: null } : { data: [{}], error: null }
    const response = await process()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.results.subscriptions).toBe(0)
    expect(body.results.duplicates_ignored).toBe(1)
    expect(state.update).toHaveBeenCalledWith('finance_recurring', { next_due_date: '2026-10-01' })
  })
  it('posts the latest start_date row per income name, dated at day_of_month', async () => {
    state.tables.finance_recurring_income = [
      { id: 'old', name: 'Freelance', amount: 14000, owner: 'bernardo', category: 'freelance', recurrence: 'monthly', day_of_month: 1, active: true, start_date: null },
      { id: 'new', name: 'Freelance', amount: 18500, owner: 'bernardo', category: 'freelance', recurrence: 'monthly', day_of_month: 1, active: true, start_date: '2026-09-01' },
      { id: 'later', name: 'Bonus', amount: 1000, owner: 'laura', category: 'bonus', recurrence: 'monthly', day_of_month: 15, active: true, start_date: null },
    ]
    await process()
    const rows = txUpserts()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ amount: 18500, recurring_income_id: 'new', owner: 'Bernardo', transaction_date: '2026-09-01' })
  })
  it('canonicalizes income-source owners and never posts them as null when the name says who', async () => {
    state.tables.finance_income_sources = [{ id: 'src', name: 'Laura side gig', type: 'freelance', amount: 3000, currency: 'MXN', frequency: 'monthly', owner: null }]
    await process()
    expect(txUpserts()[0]).toMatchObject({ owner: 'Laura', income_source_id: 'src' })
  })
  it('posts a yearly source only in its pay_month', async () => {
    state.tables.finance_income_sources = [{ id: 'agui', name: 'Laura aguinaldo', type: 'salary', amount: 37400, frequency: 'yearly', owner: 'laura', pay_month: 12 }]
    await process()
    expect(txUpserts()).toEqual([])
  })
  it('stops a subscription at its end_date and deactivates it', async () => {
    state.tables.finance_recurring = [{ id: 'west', name: 'WEST', amount: 10000, currency: 'MXN', frequency: 'monthly', next_due_date: '2026-09-01', end_date: '2026-08-31' }]
    await process()
    expect(txUpserts()).toEqual([])
    expect(state.update).toHaveBeenCalledWith('finance_recurring', { is_active: false })
  })
  it('logs each run to the automation ledger', async () => {
    await process()
    expect(state.insert.mock.calls.find(([t]) => t === 'finance_automation_runs')?.[1]).toMatchObject({ job: 'process-recurring', status: 'ok' })
    expect(state.upsert.mock.calls.find(([t]) => t === 'finance_automation_heartbeats')?.[1]).toMatchObject({ job: 'process-recurring', last_status: 'ok' })
  })
  it('refuses a writing GET from a browser session', async () => {
    state.auth = { ok: true, method: 'user' }
    const response = await GET(new NextRequest('http://localhost/api/finance/process-recurring'))
    expect(response.status).toBe(405)
  })
})
