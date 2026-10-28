import { CYCLE_MONTHS, cycleWindowSpend, defaultBudgetType, type BudgetType } from '@/lib/finance-utils'
import { lumpSum, MIN_HISTORY_MONTHS, projectCategoryMonthEnd, summarizeCategoryHistory } from '@/lib/spend-projection'
import { txAmount, type TxRow } from '@/lib/summary/history'
import type { BudgetVsActualRow } from '@/lib/summary/types'

export interface BudgetRow {
  category_id: string
  month?: string | null
  amount: number
  budget_type?: string | null
}

export interface CategoryRow {
  id: string
  name: string
  icon?: string | null
  billing_cycle?: string | null
}

/**
 * One active budget per category: the latest at or before the current month,
 * or — when only future budgets exist — the latest of those.
 */
export function activeBudgetRows(budgets: BudgetRow[], currentMonth: string): BudgetRow[] {
  const byCategory: Record<string, BudgetRow> = {}
  const rank = (b: BudgetRow) => {
    const month = String(b.month || '').slice(0, 7)
    return `${month <= currentMonth ? '1' : '0'}-${month}`
  }
  for (const budget of budgets) {
    if (!budget.category_id) continue
    const current = byCategory[budget.category_id]
    if (!current || rank(budget) > rank(current)) byCategory[budget.category_id] = budget
  }
  return Object.values(byCategory)
}

export function budgetTypeFor(budget: BudgetRow | undefined, category: CategoryRow | undefined): BudgetType {
  return (budget?.budget_type as BudgetType) || defaultBudgetType(category?.name || '')
}

// Known scheduled charges whose month total can't exceed the budget by design:
// high %-used is normal, only spending BEYOND the budget matters.
export const FIXED_CATEGORIES = new Set(['Rent/Mortgage', 'Utilities', 'Subscriptions'])

/**
 * Cash-basis budget vs actual for the current month: amounts land in their
 * payment month (coverage windows are NOT spread — the Budgets page allocates
 * them; see tests/lib/summary/budgets.test.ts for the documented difference).
 * Non-monthly categories rate against their calendar cycle window, the same
 * normalisation the Budgets page uses (finance-utils cycleWindowSpend).
 */
export function buildBudgetVsActual({
  budgets, catMap, currentMonthTxs, historyTxs, month, dayOfMonth, daysInMonth,
}: {
  budgets: BudgetRow[]
  catMap: Map<string, CategoryRow>
  currentMonthTxs: TxRow[]
  /** Complete months before `month` (≥ the cycle window), expenses only. */
  historyTxs: TxRow[]
  month: string
  dayOfMonth: number
  daysInMonth: number
}): BudgetVsActualRow[] {
  const spentBy: Record<string, number> = {}
  for (const t of currentMonthTxs) {
    const key = t.category_id || 'uncategorized'
    spentBy[key] = (spentBy[key] || 0) + txAmount(t)
  }
  const historyBy: Record<string, Record<string, number>> = {}
  for (const t of historyTxs) {
    const m = (t.transaction_date || '').slice(0, 7)
    if (!m) continue
    const key = t.category_id || 'uncategorized'
    historyBy[key] = historyBy[key] || {}
    historyBy[key][m] = (historyBy[key][m] || 0) + txAmount(t)
  }
  const windowRows = [...historyTxs, ...currentMonthTxs]

  return budgets.map(b => {
    const cat = catMap.get(b.category_id)
    const billingCycle = cat?.billing_cycle || 'monthly'
    const cycleMonths = CYCLE_MONTHS[billingCycle as keyof typeof CYCLE_MONTHS] || 1
    const isNonMonthly = cycleMonths > 1
    const isFixed = FIXED_CATEGORIES.has(cat?.name || '')
    const spent = spentBy[b.category_id] || 0
    const monthlyBudget = b.amount || 0
    const effectiveBudget = isNonMonthly ? monthlyBudget * cycleMonths : monthlyBudget
    const windowSpent = isNonMonthly ? cycleWindowSpend(windowRows, b.category_id, month, billingCycle) : spent
    const pctUsed = effectiveBudget > 0 ? Math.round(windowSpent / effectiveBudget * 100) : 0

    let dailyPace = 0
    let budgetDailyPace = 0
    let paceVsBudget = 0
    if (!isNonMonthly && !isFixed) {
      dailyPace = dayOfMonth > 0 ? spent / dayOfMonth : 0
      budgetDailyPace = daysInMonth > 0 ? effectiveBudget / daysInMonth : 0
      paceVsBudget = budgetDailyPace > 0 ? Math.round((dailyPace / budgetDailyPace - 1) * 100) : 0
    }

    const history = summarizeCategoryHistory(
      Object.entries(historyBy[b.category_id] || {}).sort(([x], [y]) => x.localeCompare(y)).map(([, total]) => Math.round(total)),
      effectiveBudget,
    )
    const typicalMonth = history.monthsObserved >= MIN_HISTORY_MONTHS ? history.median : effectiveBudget
    const projection = projectCategoryMonthEnd({
      spent,
      budget: effectiveBudget,
      isFixed,
      isNonMonthly,
      dayOfMonth,
      daysInMonth,
      history,
      lumpSpent: lumpSum(currentMonthTxs.filter(t => t.category_id === b.category_id).map(txAmount), typicalMonth),
    })

    return {
      category: cat?.name || 'Unknown',
      category_id: b.category_id,
      icon: cat?.icon || '📦',
      billing_cycle: billingCycle,
      spent: Math.round(spent),
      cycle_window_spent: Math.round(windowSpent),
      budget: effectiveBudget,
      monthly_budget: monthlyBudget,
      pct_used: pctUsed,
      over_under: Math.round(windowSpent - effectiveBudget),
      status: (isFixed
        ? (spent > effectiveBudget ? 'over' : 'ok')
        : pctUsed < 80 ? 'ok' : pctUsed <= 100 ? 'warning' : 'over') as BudgetVsActualRow['status'],
      daily_pace: Math.round(dailyPace),
      budget_daily_pace: Math.round(budgetDailyPace),
      pace_vs_budget_pct: paceVsBudget,
      projected_month_total: projection.projected,
      expected_remaining: projection.expectedRemaining,
      projection_basis: projection.basis,
      history_median: history.median,
      history_months: history.monthsObserved,
      history_month_totals: history.monthTotals,
      times_over_budget: history.timesOverBudget,
      is_non_monthly: isNonMonthly,
      is_fixed: isFixed,
      cycle_months: cycleMonths,
      basis: 'cash' as const,
    }
  }).sort((a, b) => b.pct_used - a.pct_used)
}
