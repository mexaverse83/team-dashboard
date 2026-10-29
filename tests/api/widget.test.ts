// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  summary: null as unknown,
  west: null as unknown,
  insights: null as unknown,
  transactions: [] as unknown[],
  financeAuth: vi.fn(),
}))

vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: state.financeAuth }))
vi.mock('@/lib/server/summary', () => ({ buildSummary: vi.fn(async () => { if (!state.summary) throw new Error('down'); return state.summary }) }))
vi.mock('@/lib/server/west', () => ({ getWestProjection: vi.fn(async () => state.west) }))
vi.mock('@/lib/supabase-admin', () => {
  const tables: Record<string, () => unknown> = {
    finance_insights_cache: () => ({ data: state.insights, error: null }),
    finance_transactions: () => ({ data: state.transactions, error: null }),
    finance_categories: () => ({ data: [{ id: 'c-other', name: 'Other' }, { id: 'c-groc', name: 'Groceries' }, { id: 'c-rent', name: 'Rent' }], error: null }),
  }
  const chain = (table: string): unknown => new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(tables[table]())
      return () => chain(table)
    },
  })
  return {
    ConfigError: class ConfigError extends Error {},
    getAdminClientInfo: () => ({ client: { from: (t: string) => chain(t) }, degraded: false }),
    withDegradedHeader: (res: Response) => res,
  }
})

import { GET } from '@/app/api/finance/widget/route'

const row = (category: string, spent: number, budget: number, extra: Record<string, unknown> = {}) => ({
  category, icon: '', spent, budget, pct_used: Math.round(spent / budget * 100), status: 'ok', pace_vs_budget_pct: 0,
  projected_month_total: spent, is_non_monthly: false, cycle_months: 1, ...extra,
})

function reviewSummary() {
  return {
    income: { current_month_actual: 208800 },
    cash_flow: { monthly_income: 208800 },
    current_month: {
      month: '2026-10', day_of_month: 28, days_in_month: 31, month_progress_pct: 90, total_spent: 116466,
      budget_vs_actual: [
        row('Other', 16961, 5000), row('Transport', 5767, 5500), row('Groceries', 12044, 13000), row('Dining Out', 9214, 15000),
        row('Rent', 35000, 35000, { is_fixed: true }), row('Travel', 0, 20000, { is_non_monthly: true }),
      ],
    },
    month_projection: { expected_income: 208800, spent_so_far: 116466, projected_spend: 125264, projected_savings: 83536 },
    goal_funding: { total_monthly_needed: 121155 },
    emergency_fund: { months_covered: 15.6 },
    subscriptions: { active: [{ name: 'Rent', amount: 35000, frequency: 'monthly', monthly_equivalent: 35000, last_charge: '2026-11-01' }, { name: 'Internet', amount: 800, frequency: 'monthly', monthly_equivalent: 800, last_charge: '2026-11-01' }, { name: 'Annual', amount: 9000, frequency: 'annual', monthly_equivalent: 750, last_charge: '2027-01-01' }] },
    installments: { active: [{ name: 'Seguro sportage', merchant: '', monthly_payment: 758, payments_remaining: 1, total_remaining: 758, end_date: '2026-11-10' }] },
    baby_plan: { months_to_birth: 6 },
  }
}

const STALE_INSIGHTS = {
  generated_at: '2026-09-04T13:30:53Z',
  period_month: '2026-09-01',
  insights_json: [{ type: 'alert', icon: '', title: 'Protege $108,231 para WEST hoy', detail: 'meta WEST de septiembre', priority: 'high', category: 'WIDGET' }],
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-28T15:15:00Z')) // 09:15 in Mexico City
  state.summary = reviewSummary()
  state.west = { target: 11204000, months_to_delivery: 14, projected_at_delivery: { total_projected: 9758684 }, savings_plan: { months: [{ month: '2026-10', target: 152583 }] } }
  state.insights = STALE_INSIGHTS
  state.transactions = [
    { transaction_date: '2026-10-01', amount: 900, category_id: 'c-groc' },
    { transaction_date: '2026-10-01', amount: 100, amount_mxn: 120, category_id: 'c-other' },
    { transaction_date: '2026-10-03', amount: 35000, category_id: 'c-rent' },
    { transaction_date: '2026-10-28', amount: 500, category_id: 'c-groc' },
  ]
  state.financeAuth.mockReset()
  state.financeAuth.mockResolvedValue({ ok: true, method: 'user' })
  delete process.env.WIDGET_READ_TOKENS
})
afterEach(() => vi.useRealTimers())

const get = (headers: Record<string, string> = {}, method = 'GET') =>
  GET(new NextRequest('https://finance.autonomis.co/api/finance/widget', { headers, method }))

describe('GET /api/finance/widget (v2)', () => {
  it('returns the v2 payload built in-process', async () => {
    const res = await get()
    const data = await res.json()
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(data.v).toBe(2)
    expect(data.variable).toEqual({ budget: 38500, spent: 43986, left: -5486, days_left: 4, through_label: 'Sat Oct 31', through_date: '2026-10-31', status: 'over' })
    expect(data.status).toBe('over')
    expect(data.top_over).toEqual({ name: 'Other', pct: 339, over_by: 11961 })
    expect(data.budget_pace.map((b: { name: string }) => b.name)).toEqual(['Other', 'Transport', 'Groceries', 'Dining Out'])
    expect(data.west_month).toMatchObject({ label: 'Oct', target: 152583, projected_savings: 83536, gap: 69047, pct: 55, tone: 'warn' })
    expect(data.milestones).toEqual({ baby_months: 6, west_funded_pct: 87.1, west_months_to_delivery: 14 })
  })

  it('never serves a stale LLM brief (W1)', async () => {
    const data = await (await get()).json()
    expect(data.brief).toEqual({ fresh: false, generated_at: '2026-09-04T13:30:53Z', title: null, detail: null })
    expect(JSON.stringify(data)).not.toContain('Protege')
    expect(data.coach.title).toBe('Pause Other — $12k over')
    expect(data.coach.url).toMatch(/^\/finance\/ask\?prompt=/)
    expect(data.wolff.directive.title).toBe('Pause Other — $12k over')
  })

  it('uses today\'s brief, cut on a word boundary (W14)', async () => {
    const long = 'Hold Other spending until Sunday so the everyday budgets recover before the month closes and the WEST transfer clears'
    state.insights = { generated_at: '2026-10-28T13:30:00Z', period_month: '2026-10-01', insights_json: [{ title: long, detail: 'x', category: 'WIDGET' }] }
    const data = await (await get()).json()
    expect(data.brief.fresh).toBe(true)
    expect(data.brief.title.endsWith('…')).toBe(true)
    expect(long.startsWith(data.brief.title.slice(0, -1))).toBe(true)
    expect(data.brief.title.length).toBeLessThanOrEqual(90)
  })

  it('buckets controllable daily spend by date (O1) and groups upcoming bills (O2)', async () => {
    const data = await (await get()).json()
    expect(data.daily_spend).toHaveLength(28)
    expect(data.daily_spend[0]).toBe(1020)
    expect(data.daily_spend[2]).toBe(0)
    expect(data.daily_spend[27]).toBe(500)
    expect(data.daily_budget_pace).toBe(Math.round(38500 / 31))
    expect(data.upcoming).toEqual([
      { date: '2026-11-01', label: 'Rent', amount: 35800, count: 2, kind: 'bill' },
      { date: '2026-11-10', label: 'Seguro sportage', amount: 758, count: 1, kind: 'msi' },
    ])
  })

  it('daily spend ends exactly at variable.spent', async () => {
    state.transactions = [
      { transaction_date: '2026-10-02', amount: 16961, category_id: 'c-other' },
      { transaction_date: '2026-10-05', amount: 12044, category_id: 'c-groc' },
      { transaction_date: '2026-10-09', amount: 35000, category_id: 'c-rent' },
    ]
    state.summary = { ...reviewSummary() }
    const cm = (state.summary as ReturnType<typeof reviewSummary>).current_month
    cm.budget_vs_actual = cm.budget_vs_actual.filter(r => ['Other', 'Groceries', 'Rent'].includes(r.category))
    const data = await (await get()).json()
    expect(data.daily_spend.reduce((s: number, v: number) => s + v, 0)).toBe(data.variable.spent)
  })

  it('words the coach line for the same period as the hero, never "Sunday"', async () => {
    const calm = reviewSummary()
    calm.current_month.budget_vs_actual = [row('Groceries', 9000, 13000), row('Dining Out', 6000, 15000), row('Other', 2000, 5000)]
    state.summary = { ...calm, upcoming: [] }
    const data = await (await get()).json()
    expect(data.variable.through_label).toBe('Sat Oct 31')
    expect(data.coach.rule).toBe('on-plan')
    expect(data.coach.title).toBe('On plan — $4,000/day thru Sat Oct 31')
    expect(data.coach_es.title).toBe('En plan — $4,000/día hasta sáb 31 oct')
    for (const t of [data.coach.title, data.coach_es.title, data.wolff.directive.title]) {
      expect(t).not.toMatch(/Sunday|domingo|this week|esta semana/i)
    }
  })

  it('measures the WEST bar against capacity like home, with the stretch target as a marker (W5)', async () => {
    state.summary = { ...reviewSummary(), month_projection: { projected_savings: 87448 }, west_plan: { month_target: 117586, capacity_target: 84869, projected_savings: 87448, pct_of_capacity: 103 } }
    const data = await (await get()).json()
    expect(data.west_month).toMatchObject({ target: 84869, pct: 103, gap: 0, tone: 'good', stretch_target: 117586 })
  })

  it('prefers the summary contract fields once WS4 provides them', async () => {
    state.summary = { ...reviewSummary(), variable: { budget: 38500, spent: 43986, left: -5486, days_left: 4, through_label: 'Sat Oct 31', status: 'over' }, upcoming: [{ date: '2026-10-30', label: 'Balloon', amount: 90000, kind: 'west' }, { date: '2026-10-30', label: 'Salary', amount: 50000, kind: 'income' }] }
    const data = await (await get()).json()
    expect(data.variable.through_label).toBe('Sat Oct 31')
    expect(data.variable.through_date).toBe('2026-10-31')
    expect(data.upcoming).toEqual([{ date: '2026-10-30', label: 'Balloon', amount: 90000, count: 1, kind: 'west' }])
  })

  it('keeps the legacy v1 fields for one release', async () => {
    const data = await (await get()).json()
    expect(Number.isFinite(data.safe_to_spend_day)).toBe(true)
    expect(data.net_this_month).toBe(208800 - 116466)
    expect(data.projected_savings).toBe(83536)
    expect(data.goal_monthly_needed).toBe(121155)
    expect(data.west_month.surplus_so_far).toBe(83536)
  })

  it('does not return a successful zero balance after a summary outage', async () => {
    state.summary = null
    expect((await get()).status).toBe(500)
  })

  it('accepts a read-only widget token on GET without session auth (W12)', async () => {
    process.env.WIDGET_READ_TOKENS = 'phone-a-0123456789abcdef,phone-b-0123456789abcdef'
    state.financeAuth.mockResolvedValue({ ok: false, response: new Response('{"error":"Unauthorized"}', { status: 401 }) })
    expect((await get({ 'x-widget-token': 'phone-b-0123456789abcdef' })).status).toBe(200)
    expect(state.financeAuth).not.toHaveBeenCalled()
    expect((await get({ 'x-widget-token': 'wrong-token-0123456789' })).status).toBe(401)
    expect((await get({ 'x-api-key': 'phone-a-0123456789abcdef' })).status).toBe(401)
  })
})

describe('widget token scope', () => {
  it('is only honoured for GET requests', async () => {
    process.env.WIDGET_READ_TOKENS = 'phone-a-0123456789abcdef'
    const { authorizeWidgetRequest } = await import('@/lib/widget-auth')
    state.financeAuth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) })
    const post = new NextRequest('https://finance.autonomis.co/api/finance/widget', { method: 'POST', headers: { 'x-widget-token': 'phone-a-0123456789abcdef' } })
    expect((await authorizeWidgetRequest(post)).ok).toBe(false)
    const getReq = new NextRequest('https://finance.autonomis.co/api/finance/widget', { headers: { 'x-widget-token': 'phone-a-0123456789abcdef' } })
    expect((await authorizeWidgetRequest(getReq)).ok).toBe(true)
  })

  it('never hands one phone another phone’s token', async () => {
    const { widgetTokenForLoader } = await import('@/lib/widget-auth')
    const one = { WIDGET_READ_TOKENS: 'phone-a-0123456789abcdef' } as unknown as NodeJS.ProcessEnv
    const two = { WIDGET_READ_TOKENS: 'phone-a-0123456789abcdef,phone-b-0123456789abcdef' } as unknown as NodeJS.ProcessEnv
    expect(widgetTokenForLoader(null, one)).toBe('phone-a-0123456789abcdef')
    expect(widgetTokenForLoader('0', one)).toBe('phone-a-0123456789abcdef')
    expect(widgetTokenForLoader('1', one)).toBeNull()
    expect(widgetTokenForLoader('x', two)).toBeNull()
    expect(widgetTokenForLoader('1', two)).toBe('phone-b-0123456789abcdef')
  })

  it('ignores short tokens and an unset env', async () => {
    const { isValidWidgetToken, widgetReadTokens } = await import('@/lib/widget-auth')
    expect(widgetReadTokens({ WIDGET_READ_TOKENS: 'short, ,phone-a-0123456789abcdef' } as unknown as NodeJS.ProcessEnv)).toEqual(['phone-a-0123456789abcdef'])
    expect(isValidWidgetToken('anything', {} as unknown as NodeJS.ProcessEnv)).toBe(false)
    expect(isValidWidgetToken('', { WIDGET_READ_TOKENS: 'phone-a-0123456789abcdef' } as unknown as NodeJS.ProcessEnv)).toBe(false)
  })
})
