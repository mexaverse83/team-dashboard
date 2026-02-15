import type { FinanceCategory, FinanceTransaction, FinanceBudget, FinanceRecurring, BillingCycle } from './finance-types'

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
  const payment = new Date(paymentDate)
  const months = CYCLE_MONTHS[cycle]
  // Coverage ends last day of previous month (arrears)
  const coverageEnd = new Date(payment.getFullYear(), payment.getMonth(), 0)
  const coverageStart = new Date(coverageEnd.getFullYear(), coverageEnd.getMonth() - months + 1, 1)
  return {
    start: coverageStart.toISOString().slice(0, 10),
    end: coverageEnd.toISOString().slice(0, 10),
  }
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
