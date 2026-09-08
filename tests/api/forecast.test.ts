// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, fail: '' }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: state.tables[table] ?? [], error: state.fail === table ? { message: 'offline' } : null }).then(resolve) }
  for (const method of ['select', 'eq', 'gte', 'lte']) chain[method] = () => chain
  return chain
} }) }))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
import { GET } from '@/app/api/finance/forecast/route'

beforeEach(() => {
  state.tables = {}; state.fail = ''
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-02-01T02:00:00Z')) // still January 31 in Mexico City
})
afterEach(() => vi.useRealTimers())
const forecast = async () => (await GET(new NextRequest('http://localhost/api/finance/forecast?days=60'))).json()

describe('scheduled cash flow', () => {
  it('uses the household calendar and per-payment amounts for weekly income', async () => {
    state.tables.finance_income_sources = [{ id: 'weekly', name: 'Weekly pay', amount: 1000, frequency: 'weekly' }]
    const data = await forecast()
    expect(data.period.start).toBe('2026-01-31')
    const income = data.events.filter((event: { source_id: string }) => event.source_id === 'weekly')
    expect(income.length).toBeGreaterThan(1)
    expect(income.every((event: { amount_mxn: number }) => event.amount_mxn === 1000)).toBe(true)
  })
  it('keeps month-end subscription dates and respects future salary starts', async () => {
    state.tables.finance_recurring = [{ id: 'month-end', next_due_date: '2026-01-31', frequency: 'monthly', amount: 100, name: 'Monthly bill' }]
    state.tables.finance_recurring_income = [{ id: 'future', name: 'Future salary', recurrence: 'monthly', day_of_month: 31, amount: 2000, start_date: '2026-03-01', active: true }]
    const data = await forecast()
    expect(data.events.filter((e: { source_id: string }) => e.source_id === 'month-end').map((e: { date: string }) => e.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(data.events.filter((e: { source_id: string }) => e.source_id === 'future').map((e: { date: string }) => e.date)).toEqual(['2026-03-31'])
  })
  it('keeps debt payments in the schedule', async () => {
    state.tables.finance_debts = [{ id: 'debt', name: 'Loan', balance: 5000, minimum_payment: 500 }]
    const data = await forecast()
    expect(data.events.some((e: { type: string }) => e.type === 'debt')).toBe(true)
  })
  it('returns an error when source data is incomplete', async () => {
    state.fail = 'finance_recurring'
    expect((await GET(new NextRequest('http://localhost/api/finance/forecast'))).status).toBe(503)
  })
})
