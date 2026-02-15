import type { FinanceCategory, FinanceTransaction, FinanceBudget, FinanceRecurring } from './finance-types'

export const SEED_CATEGORIES: FinanceCategory[] = [
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

function tx(id: string, type: 'expense' | 'income', amount: number, catId: string, merchant: string, date: string, desc: string): FinanceTransaction {
  return { id, type, amount, currency: 'MXN', amount_mxn: amount, category_id: catId, merchant, description: desc, transaction_date: date, is_recurring: false, recurring_id: null, tags: [], created_at: date, updated_at: date }
}

export const SEED_TRANSACTIONS: FinanceTransaction[] = [
  // Jan 2026
  tx('t01', 'income', 55000, 'cat-salary', 'Nexaminds', '2026-01-01', 'Monthly salary'),
  tx('t02', 'income', 8000, 'cat-free', 'Client A', '2026-01-10', 'Freelance project'),
  tx('t03', 'expense', 15000, 'cat-rent', 'Landlord', '2026-01-01', 'Monthly rent'),
  tx('t04', 'expense', 4200, 'cat-groc', 'Walmart', '2026-01-03', 'Weekly groceries'),
  tx('t05', 'expense', 3800, 'cat-groc', 'HEB', '2026-01-10', 'Weekly groceries'),
  tx('t06', 'expense', 4100, 'cat-groc', 'Walmart', '2026-01-17', 'Weekly groceries'),
  tx('t07', 'expense', 3600, 'cat-groc', 'Soriana', '2026-01-24', 'Weekly groceries'),
  tx('t08', 'expense', 1200, 'cat-dining', 'La Carreta', '2026-01-05', 'Dinner'),
  tx('t09', 'expense', 850, 'cat-dining', 'Starbucks', '2026-01-08', 'Coffee + lunch'),
  tx('t10', 'expense', 1500, 'cat-dining', 'Sushi Roll', '2026-01-15', 'Dinner with friends'),
  tx('t11', 'expense', 680, 'cat-dining', 'McDonalds', '2026-01-22', 'Quick lunch'),
  tx('t12', 'expense', 2500, 'cat-transport', 'Uber', '2026-01-01', 'Monthly rides'),
  tx('t13', 'expense', 1800, 'cat-transport', 'Gas station', '2026-01-15', 'Fuel'),
  tx('t14', 'expense', 2200, 'cat-util', 'CFE', '2026-01-05', 'Electricity'),
  tx('t15', 'expense', 800, 'cat-util', 'Izzi', '2026-01-05', 'Internet'),
  tx('t16', 'expense', 400, 'cat-util', 'Agua y Drenaje', '2026-01-05', 'Water'),
  tx('t17', 'expense', 399, 'cat-subs', 'Claude', '2026-01-01', 'Claude Pro'),
  tx('t18', 'expense', 199, 'cat-subs', 'Spotify', '2026-01-01', 'Premium family'),
  tx('t19', 'expense', 279, 'cat-subs', 'Netflix', '2026-01-01', 'Standard plan'),
  tx('t20', 'expense', 2000, 'cat-ent', 'Cinepolis', '2026-01-12', 'Movies + snacks'),
  tx('t21', 'expense', 1500, 'cat-health', 'Pharmacy', '2026-01-20', 'Medications'),
  tx('t22', 'expense', 3500, 'cat-shop', 'Amazon', '2026-01-18', 'Electronics'),
  // Feb 2026
  tx('t23', 'income', 55000, 'cat-salary', 'Nexaminds', '2026-02-01', 'Monthly salary'),
  tx('t24', 'income', 12000, 'cat-free', 'Client B', '2026-02-05', 'Consulting gig'),
  tx('t25', 'expense', 15000, 'cat-rent', 'Landlord', '2026-02-01', 'Monthly rent'),
  tx('t26', 'expense', 4500, 'cat-groc', 'Walmart', '2026-02-01', 'Weekly groceries'),
  tx('t27', 'expense', 3900, 'cat-groc', 'HEB', '2026-02-07', 'Weekly groceries'),
  tx('t28', 'expense', 4200, 'cat-groc', 'Walmart', '2026-02-14', 'Weekly groceries'),
  tx('t29', 'expense', 950, 'cat-dining', 'La Carreta', '2026-02-02', 'Dinner'),
  tx('t30', 'expense', 1100, 'cat-dining', 'Sonora Grill', '2026-02-08', 'Business dinner'),
  tx('t31', 'expense', 750, 'cat-dining', 'Starbucks', '2026-02-12', 'Coffee'),
  tx('t32', 'expense', 2800, 'cat-transport', 'Uber', '2026-02-01', 'Monthly rides'),
  tx('t33', 'expense', 2000, 'cat-transport', 'Gas station', '2026-02-10', 'Fuel'),
  tx('t34', 'expense', 2200, 'cat-util', 'CFE', '2026-02-05', 'Electricity'),
  tx('t35', 'expense', 800, 'cat-util', 'Izzi', '2026-02-05', 'Internet'),
  tx('t36', 'expense', 400, 'cat-util', 'Agua y Drenaje', '2026-02-05', 'Water'),
  tx('t37', 'expense', 399, 'cat-subs', 'Claude', '2026-02-01', 'Claude Pro'),
  tx('t38', 'expense', 199, 'cat-subs', 'Spotify', '2026-02-01', 'Premium family'),
  tx('t39', 'expense', 279, 'cat-subs', 'Netflix', '2026-02-01', 'Standard plan'),
  tx('t40', 'expense', 850, 'cat-subs', 'AWS', '2026-02-01', 'Cloud hosting'),
  tx('t41', 'expense', 1800, 'cat-ent', 'Concert', '2026-02-14', 'Valentine concert'),
  tx('t42', 'expense', 2500, 'cat-shop', 'Liverpool', '2026-02-14', 'Valentine gift'),
  tx('t43', 'expense', 5000, 'cat-biz', 'OpenClaw', '2026-02-10', 'API credits'),
]

export const SEED_BUDGETS: FinanceBudget[] = [
  { id: 'b01', category_id: 'cat-rent', month: '2026-02-01', amount: 15000 },
  { id: 'b02', category_id: 'cat-groc', month: '2026-02-01', amount: 18000 },
  { id: 'b03', category_id: 'cat-dining', month: '2026-02-01', amount: 5000 },
  { id: 'b04', category_id: 'cat-transport', month: '2026-02-01', amount: 6000 },
  { id: 'b05', category_id: 'cat-util', month: '2026-02-01', amount: 4000 },
  { id: 'b06', category_id: 'cat-subs', month: '2026-02-01', amount: 2500 },
  { id: 'b07', category_id: 'cat-ent', month: '2026-02-01', amount: 3000 },
  { id: 'b08', category_id: 'cat-health', month: '2026-02-01', amount: 2000 },
  { id: 'b09', category_id: 'cat-shop', month: '2026-02-01', amount: 5000 },
  { id: 'b10', category_id: 'cat-biz', month: '2026-02-01', amount: 8000 },
]

export const SEED_RECURRING: FinanceRecurring[] = [
  { id: 'r01', name: 'Claude Pro', amount: 399, currency: 'MXN', category_id: 'cat-subs', frequency: 'monthly', next_due_date: '2026-03-01', is_active: true, merchant: 'Claude', notes: null },
  { id: 'r02', name: 'Spotify Premium', amount: 199, currency: 'MXN', category_id: 'cat-subs', frequency: 'monthly', next_due_date: '2026-03-01', is_active: true, merchant: 'Spotify', notes: null },
  { id: 'r03', name: 'Netflix', amount: 279, currency: 'MXN', category_id: 'cat-subs', frequency: 'monthly', next_due_date: '2026-03-01', is_active: true, merchant: 'Netflix', notes: null },
  { id: 'r04', name: 'AWS Hosting', amount: 850, currency: 'MXN', category_id: 'cat-subs', frequency: 'monthly', next_due_date: '2026-03-01', is_active: true, merchant: 'AWS', notes: null },
  { id: 'r05', name: 'Izzi Internet', amount: 800, currency: 'MXN', category_id: 'cat-util', frequency: 'monthly', next_due_date: '2026-03-05', is_active: true, merchant: 'Izzi', notes: null },
  { id: 'r06', name: 'CFE Electricity', amount: 2200, currency: 'MXN', category_id: 'cat-util', frequency: 'monthly', next_due_date: '2026-03-05', is_active: true, merchant: 'CFE', notes: null },
  { id: 'r07', name: 'GitHub Pro', amount: 2000, currency: 'MXN', category_id: 'cat-subs', frequency: 'yearly', next_due_date: '2026-06-01', is_active: true, merchant: 'GitHub', notes: null },
]

// Helper: attach category objects to transactions
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
