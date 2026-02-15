import type { FinanceCategory, FinanceTransaction, FinanceBudget, FinanceRecurring } from './finance-types'

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
