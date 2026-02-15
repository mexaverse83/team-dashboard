import type { FinanceCategory, FinanceTransaction, FinanceBudget, FinanceRecurring } from './finance-types'

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
