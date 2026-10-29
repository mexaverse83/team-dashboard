import type { FinanceCategory, FinanceTransaction, FinanceBudget, FinanceRecurring, BillingCycle } from './finance-types'

export type BudgetType = 'needs' | 'wants' | 'savings'

// Billing cycle → months
export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, 'semi-annual': 6, annual: 12,
}

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: 'Monthly', bimonthly: 'Bimonthly', quarterly: 'Quarterly', 'semi-annual': 'Semi-annual', annual: 'Annual',
}

/**
 * Calculate rolling average monthly spend for a category based on its billing cycle.
 * Looks back over the cycle window and averages to a monthly figure.
 */
export function rollingMonthlyAverage(
  transactions: FinanceTransaction[],
  categoryId: string,
  cycle: BillingCycle = 'monthly',
  asOfDate: Date = new Date()
): number {
  const months = CYCLE_MONTHS[cycle]
  const lookbackMs = months * 30 * 24 * 60 * 60 * 1000
  const cutoff = new Date(asOfDate.getTime() - lookbackMs)

  const cycleTxs = transactions.filter(t =>
    t.category_id === categoryId &&
    t.type === 'expense' &&
    new Date(t.transaction_date) >= cutoff
  )

  const total = cycleTxs.reduce((s, t) => s + t.amount_mxn, 0)
  return total / months
}

/**
 * Smart budget comparison: compare spend over the full billing cycle window vs budget × cycle months.
 * Returns { spent, budget, pct, isOverBudget } adjusted for the billing cycle.
 */
export function cycleBudgetComparison(
  transactions: FinanceTransaction[],
  categoryId: string,
  monthlyBudget: number,
  cycle: BillingCycle = 'monthly',
  asOfDate: Date = new Date()
): { spent: number; budget: number; pct: number; isOverBudget: boolean; monthlyAvg: number } {
  const months = CYCLE_MONTHS[cycle]
  const lookbackMs = months * 30 * 24 * 60 * 60 * 1000
  const cutoff = new Date(asOfDate.getTime() - lookbackMs)

  const cycleTxs = transactions.filter(t =>
    t.category_id === categoryId &&
    t.type === 'expense' &&
    new Date(t.transaction_date) >= cutoff
  )

  const spent = cycleTxs.reduce((s, t) => s + t.amount_mxn, 0)
  const budget = monthlyBudget * months
  const pct = budget > 0 ? (spent / budget) * 100 : 0
  const monthlyAvg = spent / months

  return { spent, budget, pct, isOverBudget: pct > 110, monthlyAvg } // 10% grace
}

/**
 * Get the allocated amount for a transaction in a specific month.
 * If the transaction has coverage_start/end, split evenly across covered months.
 * Otherwise, allocate fully to the transaction_date month.
 */
export function allocatedAmount(tx: FinanceTransaction, targetMonth: string): number {
  // targetMonth format: "YYYY-MM"
  if (!tx.coverage_start || !tx.coverage_end) {
    // Standard: full amount in transaction month
    return tx.transaction_date.startsWith(targetMonth) ? tx.amount_mxn : 0
  }

  // Parse as integer parts to avoid timezone-shift bugs (YYYY-MM-DD parsed as UTC → shifts day in negative offsets)
  const [sy, sm] = tx.coverage_start.split('-').map(Number)
  const [ey, em] = tx.coverage_end.split('-').map(Number)
  const [ty, tm] = targetMonth.split('-').map(Number)

  // Count months in coverage window
  const coveredMonths = Math.max(1, (ey - sy) * 12 + (em - sm) + 1)

  // Check if target month falls within coverage window
  const targetVal = ty * 12 + tm
  const startVal = sy * 12 + sm
  const endVal = ey * 12 + em
  if (targetVal >= startVal && targetVal <= endVal) {
    return tx.amount_mxn / coveredMonths
  }
  return 0
}

/**
 * Get allocated monthly spend for a category, respecting coverage periods.
 * Use this instead of simple month filtering for accurate reports.
 */
export function allocatedMonthlySpend(
  transactions: FinanceTransaction[],
  categoryId: string,
  targetMonth: string
): number {
  return transactions
    .filter(t => t.category_id === categoryId && t.type === 'expense')
    .reduce((sum, tx) => sum + allocatedAmount(tx, targetMonth), 0)
}

/**
 * Auto-suggest coverage period based on billing cycle.
 * For arrears billing: coverage ends the month before payment, spans cycle length.
 */
export function suggestCoveragePeriod(paymentDate: string, cycle: BillingCycle): { start: string; end: string } {
  const [year, month] = paymentDate.split('-').map(Number)
  const months = CYCLE_MONTHS[cycle]
  // Work entirely in UTC with numeric date parts. Parsing YYYY-MM-DD and then
  // reading local fields shifts first-of-month payments backward in Mexico.
  const coverageEnd = new Date(Date.UTC(year, month - 1, 0))
  const coverageStart = new Date(Date.UTC(coverageEnd.getUTCFullYear(), coverageEnd.getUTCMonth() - months + 1, 1))
  return {
    start: coverageStart.toISOString().slice(0, 10),
    end: coverageEnd.toISOString().slice(0, 10),
  }
}

const NEEDS_CATS = ['Rent/Mortgage', 'Groceries', 'Utilities', 'Electricity', 'Internet', 'Phone', 'Transport', 'Health', 'Maintenance']
const SAVINGS_CATS = ['Investments']

export function defaultBudgetType(catName: string): BudgetType {
  if (NEEDS_CATS.includes(catName)) return 'needs'
  if (SAVINGS_CATS.includes(catName)) return 'savings'
  return 'wants'
}

// Default categories — always available even before SQL schema is run
export const DEFAULT_CATEGORIES: FinanceCategory[] = [
  { id: 'cat-rent', name: 'Rent/Mortgage', icon: '🏠', color: '#8B5CF6', type: 'expense', is_default: true, sort_order: 1 },
  { id: 'cat-groc', name: 'Groceries', icon: '🛒', color: '#10B981', type: 'expense', is_default: true, sort_order: 2 },
  { id: 'cat-dining', name: 'Dining Out', icon: '🍽️', color: '#F59E0B', type: 'expense', is_default: true, sort_order: 3 },
  { id: 'cat-transport', name: 'Transport', icon: '🚗', color: '#3B82F6', type: 'expense', is_default: true, sort_order: 4 },
  { id: 'cat-util', name: 'Utilities', icon: '⚡', color: '#EF4444', type: 'expense', is_default: true, sort_order: 5 },
  { id: 'cat-subs', name: 'Subscriptions', icon: '📱', color: '#EC4899', type: 'expense', is_default: true, sort_order: 6 },
  { id: 'cat-ent', name: 'Entertainment', icon: '🎬', color: '#F97316', type: 'expense', is_default: true, sort_order: 7 },
  { id: 'cat-health', name: 'Health', icon: '🏥', color: '#14B8A6', type: 'expense', is_default: true, sort_order: 8 },
  { id: 'cat-shop', name: 'Shopping', icon: '🛍️', color: '#A855F7', type: 'expense', is_default: true, sort_order: 9 },
  { id: 'cat-travel', name: 'Travel', icon: '✈️', color: '#06B6D4', type: 'expense', is_default: true, sort_order: 10 },
  { id: 'cat-biz', name: 'Business', icon: '💼', color: '#6366F1', type: 'expense', is_default: true, sort_order: 11 },
  { id: 'cat-edu', name: 'Education', icon: '📚', color: '#84CC16', type: 'expense', is_default: true, sort_order: 12 },
  { id: 'cat-gifts', name: 'Gifts', icon: '🎁', color: '#E11D48', type: 'expense', is_default: true, sort_order: 13 },
  { id: 'cat-maint', name: 'Maintenance', icon: '🔧', color: '#78716C', type: 'expense', is_default: true, sort_order: 14 },
  { id: 'cat-other', name: 'Other', icon: '📦', color: '#6B7280', type: 'expense', is_default: true, sort_order: 15 },
  { id: 'cat-salary', name: 'Salary', icon: '💰', color: '#10B981', type: 'income', is_default: true, sort_order: 1 },
  { id: 'cat-free', name: 'Freelance', icon: '💻', color: '#3B82F6', type: 'income', is_default: true, sort_order: 2 },
  { id: 'cat-invest', name: 'Investments', icon: '📈', color: '#F59E0B', type: 'income', is_default: true, sort_order: 3 },
  { id: 'cat-other-inc', name: 'Other Income', icon: '🏦', color: '#6B7280', type: 'income', is_default: true, sort_order: 4 },
]

export function enrichTransactions(txs: FinanceTransaction[], cats: FinanceCategory[]): FinanceTransaction[] {
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]))
  return txs.map(t => ({ ...t, category: catMap[t.category_id] }))
}

export function enrichBudgets(budgets: FinanceBudget[], cats: FinanceCategory[]): FinanceBudget[] {
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]))
  return budgets.map(b => ({ ...b, category: catMap[b.category_id] }))
}

export function enrichRecurring(recs: FinanceRecurring[], cats: FinanceCategory[]): FinanceRecurring[] {
  const catMap = Object.fromEntries(cats.map(c => [c.id, c]))
  return recs.map(r => ({ ...r, category: catMap[r.category_id] }))
}

/**
 * YYYY-MM key in local time. Date#toISOString converts to UTC first, which
 * shifts local-midnight dates to the previous month in timezones behind UTC
 * (e.g. constructing June 1st in Mexico City stringifies as "2026-05").
 */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// ── Goals: one definition of "months left" and "monthly needed" ─────────────
// Summary, the Goals page and the widget used three different divisors
// (ceil(days/30), calendar-month difference, …), so the same 2026 goals asked
// $121k/mo on home and $182k/mo on Goals.

export interface CalendarDay {
  year: number
  /** 1-12 */
  month: number
  day: number
}

export type GoalLike = {
  target_amount?: number | null
  current_amount?: number | null
  target_date?: string | null
  goal_type?: string | null
  crypto_symbol?: string | null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function calendarDayKey(asOf: CalendarDay): string {
  return `${asOf.year}-${pad2(asOf.month)}-${pad2(asOf.day)}`
}

/** Funding months left, counting the current one: Oct 28 → Dec 31 is 3. 0 once the target month has passed. */
export function monthsRemaining(targetDate: string | null | undefined, asOf: CalendarDay): number {
  const match = /^(\d{4})-(\d{2})/.exec(targetDate || '')
  if (!match) return 0
  return Math.max(0, (Number(match[1]) - asOf.year) * 12 + (Number(match[2]) - asOf.month) + 1)
}

/** Goals counted in coins (1 BTC), never in pesos. */
export function isCryptoGoal(goal: GoalLike): boolean {
  return goal.goal_type === 'crypto' || !!goal.crypto_symbol
}

/** Past its target date: excluded from the monthly need and surfaced for roll-over instead. */
export function isGoalOverdue(goal: GoalLike, asOf: CalendarDay): boolean {
  return !!goal.target_date && goal.target_date.slice(0, 10) < calendarDayKey(asOf)
}

/**
 * Where a goal should be today on a straight line from its creation to its
 * target date (in the goal's own unit — pesos or coins). null when undated.
 */
export function goalPaceTarget(goal: { target_amount: number; target_date?: string | null; created_at?: string | null }, todayKey: string): number | null {
  if (!goal.target_date || !goal.created_at) return null
  const day = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)))
  const total = Math.round((day(goal.target_date.slice(0, 10)) - day(goal.created_at.slice(0, 10))) / 86_400_000)
  if (total <= 0) return null
  const elapsed = Math.min(total, Math.max(0, Math.round((day(todayKey) - day(goal.created_at.slice(0, 10))) / 86_400_000)))
  return goal.target_amount * (elapsed / total)
}

/** Pesos per month still needed to hit the goal by its date. 0 for crypto, undated, funded or overdue goals. */
export function monthlyNeeded(goal: GoalLike, asOf: CalendarDay): number {
  if (isCryptoGoal(goal) || isGoalOverdue(goal, asOf)) return 0
  const months = monthsRemaining(goal.target_date, asOf)
  const remaining = (goal.target_amount || 0) - (goal.current_amount || 0)
  if (months <= 0 || remaining <= 0) return 0
  return Math.round(remaining / months)
}

// ── Non-monthly budgets: one normalisation for home and the Budgets page ────
// A bimonthly bill lands once per two calendar months, so it is compared over
// the calendar window of its cycle ending in the viewed month against
// budget × cycle. A 30-day-multiple lookback can catch two bills (Electricity
// read 260% on Budgets and 121% on home).

/** Budget for a full billing cycle: bimonthly $2,500/mo → $5,000. */
export function cycleBudget(monthlyBudget: number, cycle: string | null | undefined = 'monthly'): number {
  return (monthlyBudget || 0) * (CYCLE_MONTHS[(cycle || 'monthly') as BillingCycle] || 1)
}

/** 'YYYY-MM' keys of the cycle window ending at `month`, oldest first. */
export function cycleWindowMonths(month: string, cycle: string | null | undefined = 'monthly'): string[] {
  const n = CYCLE_MONTHS[(cycle || 'monthly') as BillingCycle] || 1
  const [y, m] = month.split('-').map(Number)
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const index = y * 12 + (m - 1) - i
    keys.push(`${Math.floor(index / 12)}-${pad2((index % 12) + 1)}`)
  }
  return keys
}

/** Cash spent in a category over the cycle window ending at `month`, by transaction date. */
export function cycleWindowSpend(
  transactions: Array<{ category_id?: string | null; transaction_date?: string | null; type?: string | null; amount_mxn?: number | null; amount?: number | null }>,
  categoryId: string,
  month: string,
  cycle: string | null | undefined = 'monthly',
): number {
  const window = new Set(cycleWindowMonths(month, cycle))
  return transactions
    .filter(t => t.category_id === categoryId && (t.type ?? 'expense') === 'expense' && window.has((t.transaction_date || '').slice(0, 7)))
    .reduce((sum, t) => sum + (t.amount_mxn || t.amount || 0), 0)
}
