export interface FinanceCategory {
  id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income' | 'both'
  is_default: boolean
  sort_order: number
}

export interface FinanceTransaction {
  id: string
  type: 'expense' | 'income'
  amount: number
  currency: string
  amount_mxn: number
  category_id: string
  merchant: string | null
  description: string | null
  transaction_date: string
  is_recurring: boolean
  recurring_id: string | null
  tags: string[]
  created_at: string
  updated_at: string
  // Joined
  category?: FinanceCategory
}

export interface FinanceBudget {
  id: string
  category_id: string
  month: string
  amount: number
  // Joined
  category?: FinanceCategory
}

export interface FinanceRecurring {
  id: string
  name: string
  amount: number
  currency: string
  category_id: string
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
  next_due_date: string | null
  is_active: boolean
  merchant: string | null
  notes: string | null
  // Joined
  category?: FinanceCategory
}
