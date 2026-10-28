// @vitest-environment node
/**
 * The summary engine end to end on an October 2026 household fixture that
 * mirrors the live numbers the review found (variable −$5,486, prenatal
 * spend in Health, the finished fertility plan, a $25k hand-typed EF figure).
 */
import { describe, expect, it, vi } from 'vitest'
import { buildSummary } from '@/lib/server/summary'
import { fakeSupabase } from './fake-supabase'

vi.mock('@/lib/crypto-prices', () => ({ fetchCryptoPrices: async () => ({ BTC: { usd: 100000, mxn: 1800000, change24h: 0 } }) }))

const NOW = new Date('2026-10-28T18:00:00Z') // Wed Oct 28, noon in Mexico City

let seq = 0
const tx = (date: string, amount: number, category_id: string | null, merchant: string, extra: Record<string, unknown> = {}) =>
  ({ id: `t${String(++seq).padStart(4, '0')}`, transaction_date: date, type: 'expense', amount_mxn: amount, amount, category_id, merchant, tags: [], owner: 'Bernardo', created_at: `${date}T12:00:00Z`, ...extra })
const income = (date: string, amount: number, merchant: string, extra: Record<string, unknown> = {}) =>
  ({ ...tx(date, amount, 'salary', merchant, extra), type: 'income' })

const categories = [
  { id: 'groc', name: 'Groceries', icon: '🛒' },
  { id: 'dining', name: 'Dining Out', icon: '🍽️' },
  { id: 'other', name: 'Other', icon: '📦' },
  { id: 'transport', name: 'Transport', icon: '🚗' },
  { id: 'rent', name: 'Rent/Mortgage', icon: '🏠' },
  { id: 'util', name: 'Utilities', icon: '⚡' },
  { id: 'elec', name: 'Electricity', icon: '💡', billing_cycle: 'bimonthly' },
  { id: 'health', name: 'Health', icon: '🏥' },
  { id: 'salary', name: 'Salary', icon: '💰' },
]
const budgets = [
  { category_id: 'groc', month: '2026-10-01', amount: 13000 },
  { category_id: 'dining', month: '2026-10-01', amount: 15000 },
  { category_id: 'other', month: '2026-10-01', amount: 5000 },
  { category_id: 'transport', month: '2026-10-01', amount: 5500 },
  { category_id: 'rent', month: '2026-10-01', amount: 45000 },
  { category_id: 'util', month: '2026-10-01', amount: 2000 },
  { category_id: 'elec', month: '2026-10-01', amount: 2500, budget_type: 'needs' },
]

function history(month: string) {
  return [
    income(`${month}-01`, 150000, 'Bernardo salary'),
    income(`${month}-15`, 56800, 'Laura salary', { owner: 'laura' }),
    tx(`${month}-01`, 35000, 'rent', 'Rent', { tags: ['auto-recurring'] }),
    tx(`${month}-01`, 10000, 'rent', 'WEST', { tags: ['auto-recurring'] }),
    tx(`${month}-08`, 13000, 'groc', 'Soriana'),
    tx(`${month}-09`, 6000, 'transport', 'Gas'),
    tx(`${month}-10`, 15000, 'health', 'Doctor'),
    tx(`${month}-11`, 1900, 'util', 'Internet'),
    tx(`${month}-12`, 12000, 'dining', 'Restaurants'),
    tx(`${month}-13`, 4000, 'other', 'Misc'),
  ]
}

function fixture() {
  seq = 0
  const transactions = [
    ...history('2026-07'), ...history('2026-08'), ...history('2026-09'),
    tx('2026-08-20', 6000, 'elec', 'CFE'),
    // Finished fertility treatment, all tagged.
    tx('2026-05-15', 92000, null, 'Clinic', { tags: ['fertility'] }),
    tx('2026-06-15', 84500, null, 'Clinic', { tags: ['fertility'] }),
    tx('2026-07-22', 75130, null, 'Clinic', { tags: ['fertility'] }),
    // May windfall: excluded from the run rate.
    income('2026-05-20', 80000, 'Unexpected income', { tags: ['fertility', 'windfall'] }),
    // October so far
    income('2026-10-01', 150000, 'Bernardo salary'),
    income('2026-10-15', 56800, 'Laura salary', { owner: 'laura' }),
    tx('2026-10-01', 35000, 'rent', 'Rent', { tags: ['auto-recurring'] }),
    tx('2026-10-01', 10000, 'rent', 'WEST', { tags: ['auto-recurring'] }),
    tx('2026-10-04', 12044, 'groc', 'Soriana', { owner: 'laura' }),
    tx('2026-10-06', 9214, 'dining', 'Restaurants'),
    tx('2026-10-07', 11100, 'other', 'Gym'),
    tx('2026-10-12', 2000, 'other', 'Misc', { owner: 'LAURA' }),
    tx('2026-10-16', 2000, 'other', 'Misc', { owner: 'LAURA' }),
    tx('2026-10-19', 1861, 'other', 'Misc', { owner: 'LAURA' }),
    tx('2026-10-14', 5767, 'transport', 'Gas'),
    tx('2026-10-11', 1900, 'util', 'Internet'),
    tx('2026-10-03', 753, 'health', 'Dha prenatal vitamins', { tags: ['baby'] }),
    tx('2026-10-09', 750, 'health', 'Nutriologa', { tags: ['baby'] }),
    tx('2026-10-05', 2800, 'health', 'Eco bebe', { tags: ['baby'] }),
    tx('2026-10-20', 2100, 'health', 'Cita gine'), // untagged prenatal
    tx('2026-10-30', 999, 'dining', 'Future-dated'),
  ]
  return {
    finance_transactions: transactions,
    finance_categories: categories,
    finance_budgets: budgets,
    finance_recurring: [
      { name: 'Rent', amount: 35000, frequency: 'monthly', next_due_date: '2026-11-01', is_active: true },
      { name: 'WEST', amount: 10000, frequency: 'monthly', next_due_date: '2026-11-01', is_active: true },
      { name: 'Internet', amount: 600, frequency: 'monthly', next_due_date: '2026-11-01', is_active: true },
      { name: 'Twitter', amount: 2000, frequency: 'yearly', next_due_date: '2027-01-01', is_active: true },
    ],
    finance_installments: [
      { name: 'Seguro sportage', merchant: 'Qualitas', installment_amount: 758, installment_count: 12, payments_made: 10, start_date: '2025-12-10', end_date: '2026-11-10', is_active: true },
    ],
    finance_debts: [],
    finance_emergency_fund: [{ current_amount: 390000, target_amount: 150000, target_months: 6, created_at: '2026-02-16T00:00:00Z', updated_at: '2026-02-16T00:00:00Z', account_allocation_json: { monthly_essentials: 25000 } }],
    finance_goals: [
      { id: 'g1', name: 'Bernardo 2026', target_amount: 755000, current_amount: 474146, target_date: '2026-12-31', monthly_contribution: 0, goal_type: 'savings', owner: 'Bernardo', scope: 'personal', is_completed: false },
      { id: 'g2', name: 'Laura 2026', target_amount: 210000, current_amount: 127388, target_date: '2026-12-31', monthly_contribution: 0, goal_type: 'savings', owner: 'Laura', scope: 'personal', is_completed: false },
      { id: 'g3', name: '1 BTC', target_amount: 1, current_amount: 0.25, target_date: '2027-12-31', monthly_contribution: 0, goal_type: 'crypto', crypto_symbol: 'BTC', scope: 'shared', is_completed: false },
    ],
    finance_income_sources: [],
    finance_recurring_income: [
      { name: 'Bernardo salary', amount: 150000, recurrence: 'monthly', day_of_month: 1, owner: 'bernardo', active: true },
      { name: 'Laura salary', amount: 56800, recurrence: 'monthly', day_of_month: 15, owner: 'laura', active: true },
    ],
    finance_crypto_holdings: [
      { symbol: 'BTC', quantity: 0.088, owner: 'Laura' },
      { symbol: 'BTC', quantity: 0.19982936, owner: 'bernardo' },
    ],
  }
}

const build = (now = NOW, tables = fixture()) => buildSummary(fakeSupabase(tables), { now, west: false })

describe('buildSummary on the October 2026 fixture', () => {
  it('everyday budgets are one signed number: −$5,486 through Sat Oct 31', async () => {
    const s = await build()
    expect(s.variable).toMatchObject({ budget: 38500, spent: 43986, left: -5486, days_left: 4, through_label: 'Sat Oct 31', status: 'over' })
  })

  it('counts a one-off charge once instead of trending it', async () => {
    const s = await build()
    const other = s.current_month.budget_vs_actual.find(b => b.category === 'Other')!
    // Routine $5,861 runs at its blended pace; the $11,100 gym lands once.
    const rate = 0.6 * (5861 / 28) + 0.4 * (4000 / 31)
    expect(other.projected_month_total).toBe(Math.round(16961 + 3 * rate))
  })

  it('the finished fertility plan owes nothing and reports what was paid', async () => {
    const s = await build()
    expect(s.fertility_plan).toMatchObject({ status: 'complete', total_paid: 251630, remaining_amount: 0, recommended_cuts: [] })
    expect(s.month_projection.known_upcoming_treatment).toBe(0)
    expect(s.year_end_goal_plan.treatment_remaining).toBe(0)
  })

  it('settles the baby event on the month\'s cumulative spend (753 + 750 + 2,800 ≥ 4,000)', async () => {
    const s = await build()
    expect(s.baby_plan.spent_to_date).toBe(4303)
    expect(s.month_projection.known_upcoming_baby).toBe(0)
    expect(s.baby_plan.remaining_events.some(e => e.month === '2026-10')).toBe(false)
    expect(s.baby_plan.untagged_candidates).toBe(1) // 'Cita gine'
  })

  it('derives emergency essentials from needs spend (not the $25k typed in February)', async () => {
    const s = await build()
    // Rent 35k + groceries 13k + transport 6k + health 15k + utilities 1.9k; WEST is savings.
    expect(s.emergency_fund).toMatchObject({ monthly_essentials: 70900, essentials_basis: 'derived', manual_essentials: 25000, confirmed_at: '2026-02-16T00:00:00Z' })
    expect(s.emergency_fund.months_covered).toBe(5.5)
    expect(s.staleness?.ef_confirmed_at).toBe('2026-02-16T00:00:00Z')
  })

  it('keeps an explicitly marked manual essentials override', async () => {
    const tables = fixture()
    tables.finance_emergency_fund[0].account_allocation_json = { monthly_essentials: 25000, essentials_override: true } as never
    const s = await build(NOW, tables)
    expect(s.emergency_fund).toMatchObject({ monthly_essentials: 25000, essentials_basis: 'manual' })
  })

  it('goal need counts the current month and leaves crypto out of pesos', async () => {
    const s = await build()
    expect(s.goal_funding.total_monthly_needed).toBe(93618 + 27537)
    const btc = s.goals.active.find(g => g.name === '1 BTC')!
    expect(btc).toMatchObject({ is_crypto: true, unit: 'BTC', monthly_needed: 0 })
    expect(btc.current).toBeCloseTo(0.28782936, 8)
    expect(s.year_end_goal_plan.target_amount).toBe(965000)
  })

  it('typical spend replaces budgets as "planned" and feeds goal funding', async () => {
    const s = await build()
    // Jul/Sep 96,900, Aug 102,900 → median 96,900.
    expect(s.cash_flow.planned_spend).toBe(96900)
    expect(s.cash_flow.discretionary_available).toBe(s.income.total_monthly - 96900)
    expect(s.goal_funding.discretionary_available).toBe(s.cash_flow.discretionary_available)
  })

  it('the year-end plan starts from this month\'s projected savings and the clean run rate', async () => {
    const s = await build()
    const y = s.year_end_goal_plan as Record<string, number>
    expect(y.months_remaining).toBe(3)
    expect(y.current_month_savings).toBe(Math.max(0, s.month_projection.projected_savings))
    // Jul–Sep nets: 206,800 − 96,900 (− 6,000 CFE in Aug) → median 109,900
    expect(y.monthly_free_cash).toBe(109900)
    expect(y.projected_free_cash_by_december).toBe(Math.max(0, s.month_projection.projected_savings) + 2 * 109900)
  })

  it('owner spend, recent activity and upcoming bills come with the summary', async () => {
    const s = await build()
    expect(s.owner_spend?.Laura).toBe(12044 + 5861)
    expect(s.recent_transactions?.[0]).toMatchObject({ date: '2026-10-20', merchant: 'Cita gine', category_name: 'Health' })
    expect(s.recent_transactions?.some(t => t.date > '2026-10-28')).toBe(false)
    const nov1 = s.upcoming?.find(u => u.date === '2026-11-01' && u.kind === 'bill')
    expect(nov1).toMatchObject({ label: 'Rent + 2 more', amount: 45600, count: 3 })
    expect(s.upcoming?.find(u => u.kind === 'msi')).toMatchObject({ date: '2026-11-10', amount: 758 })
    expect(s.upcoming?.find(u => u.kind === 'income')).toMatchObject({ date: '2026-11-01', label: 'Bernardo salary' })
  })

  it('non-monthly budgets rate their calendar cycle window', async () => {
    const s = await build()
    const elec = s.current_month.budget_vs_actual.find(b => b.category === 'Electricity')!
    expect(elec).toMatchObject({ spent: 0, cycle_window_spent: 0, budget: 5000, basis: 'cash' })
    const sep = await build(new Date('2026-09-15T18:00:00Z'))
    expect(sep.current_month.budget_vs_actual.find(b => b.category === 'Electricity')).toMatchObject({ cycle_window_spent: 6000, pct_used: 120 })
  })

  it('crypto by owner matches lowercase owners', async () => {
    const s = await build()
    expect(s.crypto?.by_owner?.Bernardo.value_mxn).toBe(Math.round(0.19982936 * 1800000))
  })
})

describe('the year boundary', () => {
  it('on Dec 15 the 2026 goals ask for their whole remainder this month', async () => {
    const s = await build(new Date('2026-12-15T18:00:00Z'))
    expect(s.goal_funding.total_monthly_needed).toBe(280854 + 82612)
    expect((s.year_end_goal_plan as Record<string, number>).months_remaining).toBe(1)
  })

  it('on Jan 2 2027 the 2026 goals are overdue, not a one-month ask', async () => {
    const s = await build(new Date('2027-01-02T18:00:00Z'))
    expect(s.goal_funding.total_monthly_needed).toBe(0)
    expect(s.goal_funding.overdue_goals?.map(g => g.name)).toEqual(['Bernardo 2026', 'Laura 2026'])
    const y = s.year_end_goal_plan as Record<string, number>
    expect(y.target_year).toBe(2027)
    expect(y.goal_remaining).toBe(0)
  })
})
