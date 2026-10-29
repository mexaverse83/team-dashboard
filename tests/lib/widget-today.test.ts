import { describe, expect, it } from 'vitest'
import { buildToday, RESERVE_SHARE, scheduledLeft, type TodayInput, type TodayTransaction } from '@/lib/widget/today'
import { buildWidgetPayload } from '@/lib/widget/payload'
import type { BudgetVsActualRow } from '@/lib/summary/types'

const row = (category: string, spent: number, budget: number, extra: Record<string, unknown> = {}): BudgetVsActualRow => ({
  category, icon: '', spent, budget, pct_used: Math.round((spent / budget) * 100), status: 'ok' as const, pace_vs_budget_pct: 0,
  projected_month_total: spent, is_non_monthly: false, cycle_months: 1, ...extra,
})

/** Oct 29 2026 as the live summary read it (3 days left, budgets over, WEST ahead). */
function octSummary() {
  return {
    current_month: {
      month: '2026-10', day_of_month: 29, days_in_month: 31, month_progress_pct: 94, total_spent: 116549,
      budget_vs_actual: [row('Other', 16961, 5000), row('Transport', 5767, 5500), row('Groceries', 12127, 13000), row('Dining Out', 9214, 15000)],
    },
    month_projection: { expected_income: 208800, spent_so_far: 116549, projected_spend: 119673, known_upcoming_treatment: 0, known_upcoming_baby: 0, projected_savings: 89127, method: '' },
    subscriptions: { active: [
      { name: 'Rent', amount: 35000, frequency: 'monthly', monthly_equivalent: 35000, last_charge: '2026-11-01', next_charge: '2026-11-01' },
      { name: 'Twitter', amount: 1486, frequency: 'yearly', monthly_equivalent: 124, last_charge: '2027-01-01', next_charge: '2027-01-01' },
    ], total_monthly: 0, total_annual: 0 },
    installments: { active: [{ name: 'Regalo Rochie', merchant: '', monthly_payment: 988.89, payments_remaining: 7, total_remaining: 6922, end_date: '2027-05-03' }], total_monthly_commitment: 0 },
    year_end_goal_plan: { target_year: 2026, target_amount: 965000, current_saved: 601534, total_needed_by_december: 363466, projected_free_cash_by_december: 206265, on_track: false },
    emergency_fund: { funded_pct: 96, months_covered: 5.8 },
  } as unknown as TodayInput['summary']
}

/** Discretionary spend Oct 23–28 (live daily_spend) plus a planned row that must not count. */
const octTxs = (): TodayTransaction[] => [
  ...[1006, 308, 2227, 211, 288, 1923].map((amount, i) => ({ transaction_date: `2026-10-${23 + i}`, amount, category_id: 'c' })),
  { transaction_date: '2026-10-27', amount: 35000, category_id: 'rent', tags: ['auto-recurring'] },
]

const input = (over: Partial<TodayInput> = {}): TodayInput => ({
  summary: octSummary(), transactions: octTxs(), target: 84869, stretchTarget: 115790,
  upcoming: [{ date: '2026-11-01', label: 'Rent', amount: 47907, count: 8 }], westFundedPct: 92.9, westMonthsToDelivery: 14, ...over,
})

describe('buildToday (goal-safe daily allowance)', () => {
  it('computes the live Oct 29 allowance from the morning pool, holding part of the cushion back', () => {
    const t = buildToday(input())!
    // pool = 208,800 income − 84,869 target − 116,549 spent before today − 0 still scheduled in October
    expect(t.pool).toBe(7382)
    // cushion 89,127 − 84,869 = 4,258; 20% held back
    expect(t.reserve).toBe(Math.round(RESERVE_SHARE * 4258))
    expect(t.allowance).toBe(2170) // floor((7,382 − 852) / 3 / 10) × 10
    expect(t).toMatchObject({ date: '2026-10-29', state: 'ok', spent: 0, left: 2170, days_left: 3, tomorrow: 3260 })
    expect(t.goal).toMatchObject({ label: 'WEST', target: 84869, projected: 89127, pct: 105, buffer: 4258, no_spend_pct: 106, stretch_pct: 77 })
    // Not cushion ÷ days (4,258 / 3 = 1,419): that would count the expected spend twice.
    expect(t.allowance).toBeGreaterThan(1419)
  })

  it('keeps the allowance fixed as the day\'s spending comes in, and reads the state from it', () => {
    const base = buildToday(input())!
    const spend = (amount: number, tags?: string[]) => {
      const s = octSummary()
      s.month_projection!.spent_so_far += amount
      // The projection already expected planned rows; a discretionary one lowers it.
      if (!tags) s.month_projection!.projected_savings -= amount
      return buildToday(input({ summary: s, transactions: [...octTxs(), { transaction_date: '2026-10-29', amount, category_id: 'c', tags }] }))!
    }
    const lunch = spend(640)
    expect(lunch.allowance).toBe(base.allowance)
    expect(lunch).toMatchObject({ spent: 640, left: 1530, state: 'ok' })
    expect(spend(1800)).toMatchObject({ state: 'tight', left: 370 })
    const over = spend(2600)
    expect(over).toMatchObject({ state: 'over', left: -430 })
    expect(over.tomorrow).toBe(Math.floor((7382 - 852 - 2600) / 2 / 10) * 10)
    // A planned charge due today: pending this morning, posted later. Same plan either way.
    const gym = { name: 'Gym', amount: 1290, frequency: 'monthly', monthly_equivalent: 1290 }
    const pending = octSummary()
    pending.subscriptions!.active.push({ ...gym, last_charge: '2026-10-29', next_charge: '2026-10-29' })
    const posted = octSummary()
    posted.subscriptions!.active.push({ ...gym, last_charge: '2026-11-29', next_charge: '2026-11-29' })
    posted.month_projection!.spent_so_far += 1290
    const before = buildToday(input({ summary: pending }))!
    const after = buildToday(input({ summary: posted, transactions: [...octTxs(), { transaction_date: '2026-10-29', amount: 1290, tags: ['auto-recurring'] }] }))!
    expect(after).toMatchObject({ pool: before.pool, allowance: before.allowance, spent: 0, state: 'ok' })
    expect(before.pool).toBe(base.pool - 1290)
  })

  it('subtracts charges still due this month before spreading the rest', () => {
    const s = octSummary()
    s.subscriptions!.active.push({ name: 'Gym', amount: 1290, frequency: 'monthly', monthly_equivalent: 1290, last_charge: '2026-10-30', next_charge: '2026-10-30' })
    s.installments!.active.push({ name: 'Sofa', merchant: '', monthly_payment: 500, payments_remaining: 3, total_remaining: 1500, end_date: '2026-12-31' })
    s.month_projection!.known_upcoming_baby = 4000
    expect(scheduledLeft(s, '2026-10-29', '2026-10-31')).toBe(1290 + 500 + 4000)
    expect(buildToday(input({ summary: s }))!.pool).toBe(7382 - 5790)
    // Weekly plans repeat inside the window.
    s.subscriptions!.active = [{ name: 'Clase', amount: 100, frequency: 'weekly', monthly_equivalent: 433, last_charge: '2026-10-02', next_charge: '2026-10-02' }]
    s.installments!.active = []
    s.month_projection!.known_upcoming_baby = 0
    expect(scheduledLeft(s, '2026-10-01', '2026-10-31')).toBe(500)
  })

  it('turns into a no-spend day when even the goal is short', () => {
    const s = octSummary()
    s.month_projection = { ...s.month_projection!, expected_income: 195000, projected_savings: 75331 }
    const t = buildToday(input({ summary: s }))!
    expect(t.pool).toBeLessThanOrEqual(0)
    expect(t).toMatchObject({ state: 'risk', allowance: 0, reserve: 0 })
    expect(t.goal.pct).toBe(89)
    expect(t.goal.no_spend_pct).toBe(Math.round(((75331 + 1041) / 84869) * 100))
  })

  it('rebuilds each earlier day\'s room for the week and the streak', () => {
    const t = buildToday(input())!
    expect(t.week.map(d => d.date)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'])
    // Yesterday's morning pool = today's + yesterday's discretionary spend; the planned rent is not in it.
    expect(t.week[5]).toEqual({ date: '2026-10-28', spent: 1923, room: Math.floor((7382 + 1923 - 852) / 4 / 10) * 10, ok: true })
    expect(t.week[2]).toMatchObject({ date: '2026-10-25', spent: 2227, ok: false })
    expect(t.week[6]).toMatchObject({ today: true, ok: null, room: t.allowance })
    expect(t.streak).toBe(3)
    expect(t.yesterday).toEqual({ date: '2026-10-28', spent: 1923, room: t.week[5].room, diff: t.week[5].room - 1923 })
  })

  it('only counts this month\'s days, and has no history when the ledger read failed', () => {
    const s = octSummary()
    s.current_month.day_of_month = 2
    const t = buildToday(input({ summary: s, transactions: [{ transaction_date: '2026-10-01', amount: 100 }] }))!
    expect(t.week.map(d => d.date)).toEqual(['2026-10-01', '2026-10-02'])
    expect(t.streak).toBe(1)
    const none = buildToday(input({ transactions: null }))!
    expect(none).toMatchObject({ week: [], streak: null, yesterday: null, spent: 0 })
  })

  it('picks one structured nudge for today', () => {
    expect(buildToday(input())!.nudge).toEqual({ kind: 'skip', category: 'Other', over_by: 11961, url: '/finance/budgets' })
    const due = buildToday(input({ upcoming: [{ date: '2026-10-30', label: 'Rent', amount: 47907, count: 8 }] }))!
    expect(due.nudge).toMatchObject({ kind: 'due', label: 'Rent', count: 8, days: 1, url: '/finance/subscriptions' })
    const calm = octSummary()
    calm.current_month.budget_vs_actual = [row('Groceries', 12127, 13000), row('Dining Out', 9214, 15000)]
    expect(buildToday(input({ summary: calm }))!.nudge).toMatchObject({ kind: 'easy', category: 'Groceries', left: 873, days: 3 })
    calm.current_month.budget_vs_actual = [row('Groceries', 6000, 13000), row('Dining Out', 9214, 15000)]
    expect(buildToday(input({ summary: calm }))!.nudge).toMatchObject({ kind: 'fits', category: 'Groceries', left: 7000 })
    calm.current_month.budget_vs_actual = []
    expect(buildToday(input({ summary: calm }))!.nudge).toEqual({ kind: 'ahead', amount: 4258, url: '/finance/investments?tab=Real%20Estate' })
  })

  it('lists the goals without adding the year goals\' needs to the WEST target', () => {
    expect(buildToday(input())!.goals).toEqual([
      { kind: 'west_month', month: '2026-10', pct: 105, buffer: 4258, url: '/finance/investments?tab=Real%20Estate' },
      { kind: 'year', year: 2026, pct: 62, covered_pct: 57, on_track: false, url: '/finance/goals' },
      { kind: 'west_home', pct: 92.9, months: 14, url: '/finance/investments?tab=Real%20Estate' },
      { kind: 'emergency', pct: 96, months: 5.8, url: '/finance' },
    ])
  })

  it('is null without a month goal or projection', () => {
    expect(buildToday(input({ target: null }))).toBeNull()
    const s = octSummary()
    delete (s as { month_projection?: unknown }).month_projection
    expect(buildToday(input({ summary: s }))).toBeNull()
  })
})

describe('buildWidgetPayload · today', () => {
  it('adds `today` next to every existing v2 field', () => {
    const summary = { ...octSummary(), west_plan: { capacity_target: 84869, month_target: 115790, months_to_delivery: 14, funded_pct: 92.9 } } as unknown as TodayInput['summary']
    const p = buildWidgetPayload({ summary, west: null, insights: null, transactions: octTxs(), categoryNames: {}, now: new Date('2026-10-29T15:44:00Z') })
    expect(p.v).toBe(2)
    for (const k of ['variable', 'status', 'budget_pace', 'daily_spend', 'west_month', 'upcoming', 'milestones', 'coach', 'coach_es', 'brief', 'wolff']) expect(p).toHaveProperty(k)
    expect(p.today).toMatchObject({ allowance: 2170, streak: 3, goal: { pct: 105 } })
    expect(p.west_month).toMatchObject({ target: 84869, pct: 105 })
  })
})
