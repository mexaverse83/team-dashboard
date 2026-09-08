// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, fail: '', insert: vi.fn(), rpc: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc: state.rpc, from: (table: string) => {
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.tables[table] ?? [], error: state.fail === table ? { message: 'query failed' } : null }).then(resolve) }
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'limit']) chain[method] = () => chain
  chain.insert = (row: unknown) => { state.insert(table, row); return Promise.resolve({ error: null }) }
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
import { POST } from '@/app/api/finance/process-recurring/route'

beforeEach(() => {
  state.tables = { finance_monthly_savings: [{ month: '2026-08-01' }] }; state.fail = ''
  state.insert.mockReset(); state.rpc.mockReset().mockResolvedValue({ error: null })
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-08T15:00:00Z'))
})
afterEach(() => vi.useRealTimers())
const process = () => POST(new NextRequest('http://localhost/api/finance/process-recurring', { method: 'POST' }))

describe('recurring processor safeguards', () => {
  it('never inserts when a subscription duplicate check fails', async () => {
    state.tables.finance_recurring = [{ id: 'sub', name: 'Internet', amount: 500, currency: 'MXN', frequency: 'monthly', next_due_date: '2026-09-01' }]
    state.fail = 'finance_transactions'
    const response = await process()
    expect(response.status).toBe(503)
    expect(state.insert).not.toHaveBeenCalled()
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('does not silently equate USD and MXN', async () => {
    state.tables.finance_recurring = [{ id: 'sub', name: 'USD subscription', amount: 20, currency: 'USD', frequency: 'monthly', next_due_date: '2026-09-01' }]
    expect((await process()).status).toBe(503)
    expect(state.insert).not.toHaveBeenCalled()
  })
  it('defers month close when a budget lookup fails', async () => {
    state.fail = 'finance_budgets'
    expect((await process()).status).toBe(503)
    expect(state.insert).not.toHaveBeenCalled()
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('stops at the first failed atomic close and makes the failure observable', async () => {
    state.tables.finance_monthly_savings = [{ month: '2026-06-01' }]
    state.rpc.mockResolvedValue({ error: { message: 'migration missing' } })
    const response = await process()
    expect(response.status).toBe(503)
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith('finance_close_month', { p_month: '2026-07-01' })
    expect((await response.json()).ok).toBe(false)
  })
  it('closes three prior months when there is no snapshot history', async () => {
    state.tables.finance_monthly_savings = []
    expect((await process()).status).toBe(200)
    expect(state.rpc.mock.calls.map(call => call[1].p_month)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
  })
})
