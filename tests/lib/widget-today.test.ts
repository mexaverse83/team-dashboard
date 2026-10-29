import { describe, expect, it } from 'vitest'
import { buildToday, committedLeft, fixedLeft, RESERVE_SHARE, scheduledLeft, type TodayInput, type TodayTransaction } from '@/lib/widget/today'
import { unbudgetedRoutine } from '@/lib/summary/projection'
import type { TxRow } from '@/lib/summary/history'
import { buildWidgetPayload } from '@/lib/widget/payload'
import type { BudgetVsActualRow } from '@/lib/summary/types'

const row = (category: string, spent: number, budget: number, extra: Partial<BudgetVsActualRow> = {}): BudgetVsActualRow => ({
  category, icon: '', spent, budget, pct_used: Math.round((spent / budget) * 100), status: 'ok' as const, pace_vs_budget_pct: 0,
  projected_month_total: spent, is_non_monthly: false, cycle_months: 1, ...extra,
})

const NAMES = { other: 'Other', dining: 'Dining Out', groceries: 'Groceries', maint: 'Maintenance', rent: 'Rent/Mortgage', shop: 'Shopping', ahorro: 'Ahorro WEST', health: 'Health' }

/** Oct 29 2026 as the live summary read it (3 days left, everyday budgets over, WEST ahead). */
function octSummary() {
  return {
    current_month: {
      month: '2026-10', day_of_month: 29, days_in_month: 31, month_progress_pct: 94, total_spent: 116549,
      budget_vs_actual: [
        row('Other', 16961, 5000, { expected_remaining: 308 }), row('Transport', 5767, 5500, { expected_remaining: 356 }),
        row('Groceries', 12127, 13000, { expected_remaining: 806 }), row('Dining Out', 9214, 15000, { expected_remaining: 713 }),
        row('Electricity', 6067, 5000, { is_non_monthly: true, cycle_months: 2, expected_remaining: 0 }),
        row('Maintenance', 4667, 4400, { expected_remaining: 332 }), row('Rent/Mortgage', 45000, 45000, { expected_remaining: 0 }),
        row('Utilities', 1919, 2000, { expected_remaining: 0 }), row('Subscriptions', 300, 1800, { expected_remaining: 0 }),
      ],
    },
    month_projection: { expected_income: 208800, spent_so_far: 116549, projected_spend: 119673, known_upcoming_treatment: 0, known_upcoming_baby: 0, projected_savings: 89127, method: '' },
    subscriptions: { active: [
      { name: 'Rent', amount: 35000, frequency: 'monthly', monthly_equivalent: 35000, last_charge: '2026-11-01', next_charge: '2026-11-01' },
      { name: 'Twitter', amount: 1486, frequency: 'yearly', monthly_equivalent: 124, last_charge: '2027-01-01', next_charge: '2027-01-01' },
    ], total_monthly: 0, total_annual: 0 },
    installments: { active: [{ name: 'Regalo Rochie', merchant: '', monthly_payment: 988.89, payments_remaining: 7, total_remaining: 6922, end_date: '2027-05-03' }], total_monthly_commitment: 0 },
    year_end_goal_plan: { target_year: 2026, target_amount: 965000, current_saved: 601534, total_needed_by_december: 363466, projected_free_cash_by_december: 206265, shortfall_by_december: 157201, monthly_extra_needed: 52401, on_track: false },
    emergency_fund: { funded_pct: 96, months_covered: 5.8 },
  } as unknown as TodayInput['summary']
}

/** Everyday spend Oct 23–28 (live daily_spend), plus planned and non-everyday rows that must not count as a day's spend. */
const octTxs = (): TodayTransaction[] => [
  ...[1006, 308, 2227, 211, 288, 1923].map((amount, i) => ({ transaction_date: `2026-10-${23 + i}`, amount, category_id: 'other' })),
  { transaction_date: '2026-10-01', amount: 35000, category_id: 'rent', tags: ['auto-recurring'] },
  { transaction_date: '2026-10-01', amount: 989, category_id: 'shop', tags: ['auto-msi'] },
  { transaction_date: '2026-10-27', amount: 4400, category_id: 'maint' },
]

const input = (over: Partial<TodayInput> = {}): TodayInput => ({
  summary: octSummary(), transactions: octTxs(), categoryNames: NAMES, target: 84869, stretchTarget: 115790,
  upcoming: [{ date: '2026-11-01', label: 'Rent', amount: 47907, count: 8 }], westFundedPct: 92.9, westMonthsToDelivery: 14, ...over,
})

describe('buildToday (goal-safe daily allowance)', () => {
  it('computes the live Oct 29 allowance from the morning pool, holding part of the cushion back', () => {
    const t = buildToday(input())!
    // committed: nothing scheduled is left in October; Maintenance still expects 332
    expect(t.committed).toBe(332)
    // pool = 208,800 income − 84,869 target − 116,549 spent before today − 332 committed
    expect(t.pool).toBe(7050)
    // The everyday budgets are $5.6k over in total, so the whole pool is cushion: 20% held back.
    expect(t.reserve).toBe(Math.round(RESERVE_SHARE * 7050))
    expect(t.room).toBe(5640)
    expect(t.allowance).toBe(1880) // floor(5,640 / 3 / 10) × 10
    expect(t).toMatchObject({ date: '2026-10-29', state: 'ok', spent: 0, left: 1880, days_left: 3, tomorrow: 2820 })
    expect(t.goal).toMatchObject({ label: 'WEST', basis: 'capacity', target: 84869, projected: 89127, pct: 105, buffer: 4258, plan_pct: 102, stretch_pct: 77 })
  })

  it('keeps the allowance fixed as the day\'s spending comes in, whatever the projection does', () => {
    const base = buildToday(input())!
    const spend = (amount: number, savingsDrop: number) => {
      const s = octSummary()
      s.month_projection!.spent_so_far += amount
      s.current_month.budget_vs_actual[0].spent += amount
      // The projection does not fall one-for-one (history medians early in the month).
      s.month_projection!.projected_savings -= savingsDrop
      return buildToday(input({ summary: s, transactions: [...octTxs(), { transaction_date: '2026-10-29', amount, category_id: 'other' }] }))!
    }
    for (const drop of [0, 300, 640]) {
      const lunch = spend(640, drop)
      expect(lunch).toMatchObject({ allowance: base.allowance, reserve: base.reserve, pool: base.pool, spent: 640, left: 1240, state: 'ok' })
    }
    expect(spend(1500, 1500)).toMatchObject({ state: 'tight', left: 380 })
    const over = spend(2600, 2600)
    expect(over).toMatchObject({ state: 'over', left: -720 })
    // Tomorrow's morning gets its own reserve: pool 7,050 − 2,600 = 4,450, 20% held back.
    expect(over.tomorrow).toBe(Math.floor((4450 - Math.round(RESERVE_SHARE * 4450)) / 2 / 10) * 10)
    // The phone shows that same figure tomorrow morning.
    const s = octSummary()
    Object.assign(s.current_month, { day_of_month: 30 })
    s.month_projection!.spent_so_far += 2600
    s.current_month.budget_vs_actual[0].spent += 2600
    const next = buildToday(input({ summary: s, transactions: [...octTxs(), { transaction_date: '2026-10-29', amount: 2600, category_id: 'other' }] }))!
    expect(next.allowance).toBe(over.tomorrow)
    // And yesterday's room, rebuilt the next morning, is the one shown on the day.
    expect(next.yesterday).toMatchObject({ spent: 2600, room: base.allowance })
  })

  it('spending into the reserve is "over" with tomorrow\'s figure, never a no-spend day', () => {
    const spend = (amount: number, day = 29) => {
      const s = octSummary()
      Object.assign(s.current_month, { day_of_month: day })
      s.month_projection!.spent_so_far += amount
      s.current_month.budget_vs_actual[0].spent += amount
      return buildToday(input({ summary: s, transactions: [...octTxs(), { transaction_date: `2026-10-${day}`, amount, category_id: 'other' }] }))!
    }
    // Pool 7,050, room 5,640: $6,000 passes the room but leaves $1,050 over target.
    const band = spend(6000)
    expect(band).toMatchObject({ state: 'over', tomorrow: 420 })
    expect(band.goal.no_spend_pct).toBe(Math.round(((84869 + 1050) / 84869) * 100))
    // The goal row's free room agrees with tomorrow: the 2 days after today share it.
    expect(band.goals[0]).toMatchObject({ kind: 'west_month', days_left: 2, room: 840 })
    expect(spend(7000)).toMatchObject({ state: 'over', tomorrow: 20 })
    expect(spend(7050).state).toBe('risk')
    // The ordinary over-today case: free room = tomorrow × the days after today.
    const over = spend(2600)
    expect(over.goals[0]).toMatchObject({ days_left: 2, room: over.tomorrow! * 2 })
  })

  it('on the month\'s last day a small overrun is "over", not a missed target', () => {
    const s = octSummary()
    Object.assign(s.current_month, { day_of_month: 31 })
    const base = buildToday(input({ summary: s, transactions: octTxs() }))!
    expect(base.days_left).toBe(1)
    s.month_projection!.spent_so_far += base.allowance + 50
    s.current_month.budget_vs_actual[0].spent += base.allowance + 50
    const t = buildToday(input({ summary: s, transactions: [...octTxs(), { transaction_date: '2026-10-31', amount: base.allowance + 50, category_id: 'other' }] }))!
    expect(t).toMatchObject({ state: 'over', tomorrow: null })
  })

  it('turns to a no-spend day when one purchase passes the whole month\'s room', () => {
    const s = octSummary()
    s.month_projection!.spent_so_far += 9000
    s.current_month.budget_vs_actual[0].spent += 9000
    const t = buildToday(input({ summary: s, transactions: [...octTxs(), { transaction_date: '2026-10-29', amount: 9000, category_id: 'other' }] }))!
    expect(t).toMatchObject({ state: 'risk', spent: 9000, allowance: 1880, tomorrow: 0 })
    // The goal row's free room is what is left after today's spend: nothing.
    expect(t.goals[0]).toMatchObject({ kind: 'west_month', room: 0 })
  })

  it('never counts fixed bills, planned charges or savings moves as the day\'s spend', () => {
    const base = buildToday(input())!
    // Maintenance (a fixed budget row) posts its expected 332 today: committed falls as spent rises.
    const s = octSummary()
    s.month_projection!.spent_so_far += 332
    s.current_month.budget_vs_actual[5] = { ...s.current_month.budget_vs_actual[5], spent: 4999, expected_remaining: 0 }
    const bill = buildToday(input({ summary: s, transactions: [...octTxs(), { transaction_date: '2026-10-29', amount: 332, category_id: 'maint' }] }))!
    expect(bill).toMatchObject({ spent: 0, state: 'ok', pool: base.pool, allowance: base.allowance, streak: base.streak })
    // A transfer to a savings category is not in spent_so_far and not the day's spend.
    const moved = buildToday(input({ transactions: [...octTxs(), { transaction_date: '2026-10-29', amount: 20000, category_id: 'ahorro' }] }))!
    expect(moved).toMatchObject({ spent: 0, pool: base.pool, allowance: base.allowance })
    // A planned row tagged in an everyday category is not the day's spend either.
    const tagged = buildToday(input({ transactions: [...octTxs(), { transaction_date: '2026-10-29', amount: 989, category_id: 'other', tags: ['auto-msi'] }] }))!
    expect(tagged.spent).toBe(0)
    // The week only holds everyday spend: the 4,400 Maintenance on the 27th is not in it.
    expect(base.week.find(d => d.date === '2026-10-27')!.spent).toBe(288)
  })

  it('counts every unposted charge this month, overdue ones included, and MSI until the processor posts them', () => {
    const s = octSummary()
    // Nov 2, the processor has not run: Rent (due Nov 1) and the MSI are still owed.
    s.subscriptions!.active[0] = { ...s.subscriptions!.active[0], next_charge: '2026-11-01' }
    expect(scheduledLeft(s, '2026-11-01', '2026-11-30', false)).toBe(35000 + 989)
    // Once an auto-msi row exists this month, the MSI payments are posted.
    expect(scheduledLeft(s, '2026-11-01', '2026-11-30', true)).toBe(35000)
    // A plan two months behind owes this month's occurrence, not last month's.
    s.subscriptions!.active = [{ name: 'Gym', amount: 1290, frequency: 'monthly', monthly_equivalent: 1290, last_charge: '2026-09-15', next_charge: '2026-09-15' }]
    expect(scheduledLeft(s, '2026-10-01', '2026-10-31', true)).toBe(1290)
    // Weekly plans repeat inside the month; quarterly ones skip it.
    s.subscriptions!.active = [
      { name: 'Clase', amount: 100, frequency: 'weekly', monthly_equivalent: 433, last_charge: '2026-10-02', next_charge: '2026-10-02' },
      { name: 'Seguro', amount: 900, frequency: 'quarterly', monthly_equivalent: 300, last_charge: '2026-08-20', next_charge: '2026-08-20' },
    ]
    expect(scheduledLeft(s, '2026-10-01', '2026-10-31', true)).toBe(500)
    expect(scheduledLeft(s, '2026-11-01', '2026-11-30', true)).toBe(400 + 900)
    s.month_projection!.known_upcoming_baby = 4000
    expect(scheduledLeft(s, '2026-10-01', '2026-10-31', true)).toBe(4500)
  })

  it('adds the baby, treatment and MSI amounts to the fixed rows (only subscriptions overlap them)', () => {
    // Nov 10: subscriptions posted, Maintenance still expects 4,900, a $4,000 prenatal visit on the 15th.
    const nov = octSummary()
    Object.assign(nov.current_month, { month: '2026-11', day_of_month: 10, days_in_month: 30 })
    nov.subscriptions!.active = [{ name: 'Rent', amount: 35000, frequency: 'monthly', monthly_equivalent: 35000, last_charge: '2026-12-01', next_charge: '2026-12-01' }]
    nov.current_month.budget_vs_actual = [row('Maintenance', 0, 4900, { expected_remaining: 4900 }), row('Groceries', 4000, 13000)]
    nov.month_projection = { ...nov.month_projection!, known_upcoming_baby: 4000 }
    expect(committedLeft(nov, '2026-11-01', '2026-11-30', true)).toBe(4900 + 4000)
    // Before the processor's first run the MSI payments are owed on top.
    expect(committedLeft(nov, '2026-11-01', '2026-11-30', false)).toBe(4900 + 4000 + 989)
    const t = buildToday(input({ summary: nov, transactions: [{ transaction_date: '2026-11-01', amount: 989, category_id: 'shop', tags: ['auto-msi'] }] }))!
    expect(t.committed).toBe(8900)
  })

  it('takes the larger of the scheduled charges and the fixed rows\' expected remaining, never their sum', () => {
    const s = octSummary()
    expect(fixedLeft(s)).toBe(332)
    // The Gym subscription sits inside the Subscriptions row: counted once.
    s.subscriptions!.active.push({ name: 'Gym', amount: 1290, frequency: 'monthly', monthly_equivalent: 1290, last_charge: '2026-10-30', next_charge: '2026-10-30' })
    s.current_month.budget_vs_actual[8] = { ...s.current_month.budget_vs_actual[8], expected_remaining: 1290 }
    const t = buildToday(input({ summary: s }))!
    expect(t.committed).toBe(1622)
    expect(t.pool).toBe(7050 + 332 - 1622)
    // An overdue, unposted rent on Nov 2 stays out of the pool.
    const nov = octSummary()
    Object.assign(nov.current_month, { month: '2026-11', day_of_month: 2, days_in_month: 30 })
    nov.month_projection = { ...nov.month_projection!, spent_so_far: 2000, projected_spend: 120000, projected_savings: 88800 }
    nov.current_month.budget_vs_actual = nov.current_month.budget_vs_actual.map(b => ({ ...b, spent: 0, expected_remaining: b.category === 'Rent/Mortgage' ? 45000 : 0 }))
    const posted = buildToday(input({ summary: nov, transactions: [{ transaction_date: '2026-11-01', amount: 989, category_id: 'shop', tags: ['auto-msi'] }] }))!
    expect(posted.committed).toBe(45000)
  })

  it('turns into a no-spend day when even the goal is short', () => {
    const s = octSummary()
    s.month_projection = { ...s.month_projection!, expected_income: 200000, projected_savings: 80000 }
    const t = buildToday(input({ summary: s }))!
    expect(t.pool).toBeLessThanOrEqual(0)
    expect(t).toMatchObject({ state: 'risk', allowance: 0, reserve: 0 })
    expect(t.goal.pct).toBe(94)
    // Where the month lands with nothing more spent: target + pool (the pool is short).
    expect(t.goal.no_spend_pct).toBe(Math.round(((84869 + t.pool) / 84869) * 100))
    // The next bill is the nudge, not "skip Other" (the whole day is already no-spend).
    expect(t.nudge).toMatchObject({ kind: 'due', label: 'Rent', days: 3 })
    // Without a bill this week: how short the month lands even with no more spending.
    const quiet = buildToday(input({ summary: s, upcoming: [] }))!
    expect(quiet.nudge).toEqual({ kind: 'gap', amount: -quiet.pool, url: '/finance/investments?tab=Real%20Estate' })
  })

  it('rebuilds each earlier day\'s room for the week and the streak', () => {
    const t = buildToday(input())!
    expect(t.week.map(d => d.date)).toEqual(['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'])
    // Yesterday's morning pool = today's + yesterday's everyday spend.
    // Its reserve is that morning's (the budgets were already spent, so 20% of that pool).
    expect(t.week[5]).toEqual({ date: '2026-10-28', spent: 1923, room: Math.floor((8973 - Math.round(RESERVE_SHARE * 8973)) / 4 / 10) * 10, ok: false })
    expect(t.week[5].room).toBe(1790)
    expect(t.week[4]).toMatchObject({ date: '2026-10-27', spent: 288, ok: true })
    expect(t.week[6]).toMatchObject({ today: true, ok: null, room: t.allowance })
    expect(t.streak).toBe(0)
    expect(t.yesterday).toEqual({ date: '2026-10-28', spent: 1923, room: t.week[5].room, diff: t.week[5].room - 1923 })
  })

  it('only counts this month\'s days', () => {
    const s = octSummary()
    s.current_month.day_of_month = 2
    const t = buildToday(input({ summary: s, transactions: [{ transaction_date: '2026-10-01', amount: 100, category_id: 'other' }, { transaction_date: '2026-09-30', amount: 9000, category_id: 'other' }] }))!
    // Fewer than 3 finished days: no week row yet (a lone ring reads as missing data).
    expect(t.week).toEqual([])
    expect(t.yesterday).toMatchObject({ date: '2026-10-01', spent: 100 })
    expect(t.streak).toBe(1)
    s.current_month.day_of_month = 4
    const d4 = buildToday(input({ summary: s, transactions: [{ transaction_date: '2026-10-01', amount: 100, category_id: 'other' }, { transaction_date: '2026-09-30', amount: 9000, category_id: 'other' }] }))!
    expect(d4.week.map(d => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(d4.week[0].spent).toBe(100)
  })

  it('reserves the usual unbudgeted spend (Health…) so the allowance holds when it posts', () => {
    // Day 1: Health usually runs $15.5k a month with no budget row; nothing posted yet.
    const s = octSummary()
    s.month_projection = { ...s.month_projection!, unbudgeted_typical: 15500, unbudgeted_spent: 0 }
    const base = buildToday(input({ summary: s }))!
    expect(base.committed).toBe(332 + 15500)
    // A $3,000 Health bill posts today: committed falls as spent_so_far rises, the allowance holds.
    const h = octSummary()
    h.month_projection = { ...h.month_projection!, spent_so_far: h.month_projection!.spent_so_far + 3000, unbudgeted_typical: 15500, unbudgeted_spent: 3000 }
    const after = buildToday(input({ summary: h, transactions: [...octTxs(), { transaction_date: '2026-10-29', amount: 3000, category_id: 'health' }] }))!
    expect(after).toMatchObject({ pool: base.pool, allowance: base.allowance, spent: 0 })
    // Past the usual amount, the extra lowers the pool once.
    h.month_projection = { ...h.month_projection!, unbudgeted_spent: 18000 }
    expect(buildToday(input({ summary: h }))!.committed).toBe(332)
  })

  it('is null when the ledger or category read failed (today\'s spend would be unknown)', () => {
    expect(buildToday(input({ transactions: null }))).toBeNull()
    expect(buildToday(input({ categoryNames: new Map() }))).toBeNull()
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
    // The month is ahead but the 2026 goals are short: say where today's savings go.
    calm.current_month.budget_vs_actual = []
    expect(buildToday(input({ summary: calm }))!.nudge).toEqual({ kind: 'year', year: 2026, amount: 157201, url: '/finance/goals' })
    calm.year_end_goal_plan = { ...calm.year_end_goal_plan!, on_track: true, shortfall_by_december: 0 }
    expect(buildToday(input({ summary: calm }))!.nudge).toEqual({ kind: 'ahead', amount: 4258, url: '/finance/investments?tab=Real%20Estate' })
    calm.month_projection = { ...calm.month_projection!, projected_savings: 80000 }
    expect(buildToday(input({ summary: calm }))!.nudge).toMatchObject({ kind: 'short', amount: 4869 })
  })

  it('lists the goals without adding the year goals\' needs to the WEST target', () => {
    expect(buildToday(input())!.goals).toEqual([
      { kind: 'west_month', month: '2026-10', pct: 105, buffer: 4258, room: 5640, days_left: 3, url: '/finance/investments?tab=Real%20Estate' },
      { kind: 'year', year: 2026, pct: 62, covered_pct: 57, on_track: false, shortfall: 157201, monthly_extra: 52401, url: '/finance/goals' },
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
    const p = buildWidgetPayload({ summary, west: null, insights: null, transactions: octTxs(), categoryNames: NAMES, now: new Date('2026-10-29T15:44:00Z') })
    expect(p.v).toBe(2)
    for (const k of ['variable', 'status', 'budget_pace', 'daily_spend', 'west_month', 'upcoming', 'milestones', 'coach', 'coach_es', 'brief', 'wolff']) expect(p).toHaveProperty(k)
    expect(p.today).toMatchObject({ allowance: 1880, streak: 0, goal: { pct: 105, basis: 'capacity' } })
    expect(p.west_month).toMatchObject({ target: 84869, pct: 105 })
    // The phone's daily line and today's spend read the same everyday categories.
    expect(p.daily_spend.slice(22, 29)).toEqual(p.today!.week.map(d => d.spent))
  })
})

describe('unbudgetedRoutine (summary.month_projection)', () => {
  it('takes the median of the last 3 complete months of unbudgeted, non-everyday, unplanned spend', () => {
    const tx = (transaction_date: string, amount: number, category_id: string | null, tags?: string[]) =>
      ({ transaction_date, amount, category_id, tags }) as unknown as TxRow
    const everyday = new Set(['other'])
    const r = unbudgetedRoutine({
      historyTxs: [
        tx('2026-06-10', 90000, 'health'), // older than 3 months: out
        tx('2026-07-05', 12000, 'health'), tx('2026-08-05', 15500, 'health'), tx('2026-09-05', 19000, 'health'),
        tx('2026-09-06', 4000, null), // uncategorized counts (Sep: 23,000)
        tx('2026-09-07', 9000, 'other'), // everyday: the allowance covers it
        tx('2026-09-08', 45000, 'rent'), // budget row: fixedLeft covers it
        tx('2026-09-09', 2000, 'health', ['baby']), // planned: scheduled elsewhere
      ],
      currentMonthTxs: [tx('2026-10-03', 3000, 'health'), tx('2026-10-04', 700, 'other'), tx('2026-10-05', 989, 'shop', ['auto-msi'])],
      budgetedCategoryIds: new Set(['rent']),
      isEveryday: id => everyday.has(id || ''),
      month: '2026-10',
    })
    expect(r).toEqual({ typical: 15500, spent: 3000 })
  })
})
