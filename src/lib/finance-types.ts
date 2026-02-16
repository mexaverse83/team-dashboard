export type BillingCycle = 'monthly' | 'bimonthly' | 'quarterly' | 'semi-annual' | 'annual'

export interface FinanceCategory {
  id: string
  name: string
  icon: string
  color: string
  type: 'expense' | 'income' | 'both'
  is_default: boolean
  sort_order: number
  billing_cycle?: BillingCycle
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
  coverage_start: string | null
  coverage_end: string | null
  owner: string | null
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
  owner: string | null
  // Joined
  category?: FinanceCategory
}

// V2 Types

export interface FinanceIncomeSource {
  id: string
  name: string
  type: 'salary' | 'freelance' | 'passive' | 'side_hustle' | 'investment' | 'other'
  amount: number
  currency: string
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinanceDebt {
  id: string
  name: string
  creditor: string | null
  balance: number
  interest_rate: number
  minimum_payment: number
  type: 'credit_card' | 'personal_loan' | 'auto_loan' | 'mortgage' | 'student_loan' | 'medical' | 'other'
  start_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface FinanceDebtPayment {
  id: string
  debt_id: string
  payment_date: string
  amount: number
  principal_portion: number
  interest_portion: number
  remaining_balance: number
  created_at: string
}

export interface FinanceEmergencyFund {
  id: string
  target_months: number
  target_amount: number
  current_amount: number
  risk_score: number | null
  account_allocation_json: Record<string, unknown>[]
  created_at: string
  updated_at: string
}

export interface FinanceAuditReport {
  id: string
  period_start: string
  period_end: string
  report_json: Record<string, unknown>
  created_at: string
}

export interface FinanceInstallment {
  id: string
  name: string
  merchant: string | null
  total_amount: number
  installment_count: number
  installment_amount: number
  start_date: string
  end_date: string
  payments_made: number
  credit_card: string | null
  category_id: string | null
  is_active: boolean
  notes: string | null
  owner: string | null
  created_at: string
  updated_at: string
  // Joined
  category?: FinanceCategory
}

export interface FinanceGoal {
  id: string
  name: string
  target_amount: number
  current_amount: number
  target_date: string | null
  is_completed: boolean
  priority: number
  monthly_contribution: number
  investment_vehicle: string | null
  milestones_json: Record<string, unknown>[]
  owner: string | null
  scope: 'personal' | 'shared'
  created_at: string
  updated_at: string
}
