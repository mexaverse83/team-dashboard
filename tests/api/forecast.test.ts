// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, fail: '' }))
vi.mock('@/lib/supabase-admin', () => {
  const client = { from: (table: string) => {
    const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve({ data: state.tables[table] ?? [], error: state.fail === table ? { message: 'offline' } : null }).then(resolve, reject) }
    for (const method of ['select', 'eq', 'gte', 'lte', 'lt', 'gt', 'in', 'contains', 'order', 'limit', 'range']) chain[method] = () => chain
    return chain
  } }
  return {
    ConfigError: class extends Error {},
    configErrorResponse: () => new Response(null, { status: 503 }),
    getAdminClientInfo: () => ({ client, degraded: false }),
    withDegradedHeader: (res: Response) => res,
  }
})
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
import { GET } from '@/app/api/finance/forecast/route'

type Ev = { source_id: string; date: string; type: string; amount_mxn: number; name: string }

beforeEach(() => {
  state.tables = {}; state.fail = ''
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-02-01T02:00:00Z')) // still January 31 in Mexico City
})
afterEach(() => vi.useRealTimers())
const forecast = async (days = 60) => (await GET(new NextRequest(`http://localhost/api/finance/forecast?days=${days}`))).json()

describe('scheduled cash flow', () => {
  it('uses the household calendar and per-payment amounts for weekly income', async () => {
    state.tables.finance_income_sources = [{ id: 'weekly', name: 'Weekly pay', amount: 1000, frequency: 'weekly' }]
    const data = await forecast()
    expect(data.period.start).toBe('2026-01-31')
    const income = data.events.filter((event: Ev) => event.source_id === 'weekly')
    expect(income.length).toBeGreaterThan(1)
    expect(income.every((event: Ev) => event.amount_mxn === 1000)).toBe(true)
  })
  it('keeps month-end subscription dates and respects future salary starts', async () => {
    state.tables.finance_recurring = [{ id: 'month-end', next_due_date: '2026-01-31', frequency: 'monthly', amount: 100, name: 'Monthly bill' }]
    state.tables.finance_recurring_income = [{ id: 'future', name: 'Future salary', recurrence: 'monthly', day_of_month: 31, amount: 2000, start_date: '2026-03-01', active: true }]
    const data = await forecast()
    expect(data.events.filter((e: Ev) => e.source_id === 'month-end').map((e: Ev) => e.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(data.events.filter((e: Ev) => e.source_id === 'future').map((e: Ev) => e.date)).toEqual(['2026-03-31'])
  })
  it('tops monthly income up to the observed baseline without the yearly bonus spread', async () => {
    state.tables.finance_income_sources = [{ id: 'agui', name: 'Aguinaldo', amount: 36000, frequency: 'yearly', pay_month: 12, pay_day: 20 }]
    state.tables.finance_transactions = ['2025-10', '2025-11', '2025-12'].map((m, i) => ({ id: `i${i}`, type: 'income', amount: 200000, amount_mxn: 200000, transaction_date: `${m}-15` }))
    const data = await forecast()
    const top = data.events.filter((event: Ev) => event.source_id === 'observed-income-baseline')
    expect(top.length).toBeGreaterThan(0)
    // 200,000 observed − 0 configured monthly cash; the 3,000/mo aguinaldo spread is a December lump, not a monthly cut.
    expect(top.every((event: Ev) => event.amount_mxn === 200000)).toBe(true)
  })
  it('keeps debt payments in the schedule', async () => {
    state.tables.finance_debts = [{ id: 'debt', name: 'Loan', balance: 5000, minimum_payment: 500 }]
    const data = await forecast()
    expect(data.events.some((e: Ev) => e.type === 'debt')).toBe(true)
  })
  it('returns an error when source data is incomplete', async () => {
    state.fail = 'finance_recurring'
    expect((await GET(new NextRequest('http://localhost/api/finance/forecast'))).status).toBe(503)
  })
})

describe('forecast realism (F09, F08)', () => {
  beforeEach(() => vi.setSystemTime(new Date('2026-10-28T18:00:00Z')))

  it('drops past plan events and settles October prenatal care on the month\'s spending', async () => {
    state.tables.finance_categories = [{ id: 'health', name: 'Health' }]
    state.tables.finance_transactions = [
      { id: 't1', transaction_date: '2026-10-05', type: 'expense', amount_mxn: 2800, category_id: 'health', merchant: 'Eco bebe', tags: [] },
      { id: 't2', transaction_date: '2026-10-20', type: 'expense', amount_mxn: 2100, category_id: 'health', merchant: 'Cita gine', tags: [] },
    ]
    const data = await forecast()
    const planned = data.events.filter((e: Ev) => e.source_id === 'baby-plan')
    expect(planned.every((e: Ev) => e.date >= '2026-10-28')).toBe(true)
    expect(planned.some((e: Ev) => e.date.startsWith('2026-10'))).toBe(false)
    expect(planned.map((e: Ev) => e.date)).toContain('2026-11-15')
  })

  it('adds a daily variable-spend outflow from the last 3 complete months', async () => {
    state.tables.finance_transactions = ['2026-07', '2026-08', '2026-09'].flatMap(m => [
      { id: `${m}-g`, transaction_date: `${m}-10`, type: 'expense', amount_mxn: 31000, merchant: 'Groceries', tags: [] },
      { id: `${m}-r`, transaction_date: `${m}-01`, type: 'expense', amount_mxn: 35000, merchant: 'Rent', tags: ['auto-recurring'] },
    ])
    const data = await forecast(30)
    expect(data.assumptions.typical_variable_monthly).toBe(31000)
    expect(data.series[0].variable_outflow).toBe(1000) // Oct: 31,000 / 31
    // 4 Oct days at 1,000 + 3 Nov days at 31,000/30, plus October's prenatal
    // event, still unpaid, due today.
    expect(data.summary.next_7_days.net).toBe(-(4000 + 3100 + 4000))
    expect(data.summary.total_outflow).toBeGreaterThan(29000)
  })

  it('schedules the 90k WEST balloon on its date and computes highlights from the series', async () => {
    state.tables.finance_real_estate_targets = [{ id: 'west', is_active: true, lump_sum_date: '2026-12-01', lump_sum_amount: 90000, monthly_payment: 10000, monthly_payment_end: '2027-03-01' }]
    state.tables.finance_recurring = [{ id: 'west-sub', name: 'WEST', amount: 10000, frequency: 'monthly', next_due_date: '2026-11-01' }]
    const data = await forecast(60)
    const lump = data.events.filter((e: Ev) => e.source_id === 'west-lump')
    expect(lump).toEqual([expect.objectContaining({ date: '2026-12-01', amount_mxn: -90000 })])
    // The monthly payment is already a subscription — not scheduled twice.
    expect(data.events.some((e: Ev) => e.source_id === 'west-monthly')).toBe(false)
    expect(data.summary.next_7_days.events).toBe(2) // unpaid Oct prenatal (today) + WEST sub on Nov 1
  })

  it('pays a yearly aguinaldo in December, not on the 1st of next October', async () => {
    state.tables.finance_income_sources = [{ id: 'agui', name: 'Laura aguinaldo', amount: 37400, frequency: 'yearly' }]
    const data = await forecast(90)
    expect(data.events.filter((e: Ev) => e.source_id === 'agui').map((e: Ev) => e.date)).toEqual(['2026-12-20'])
  })
})
