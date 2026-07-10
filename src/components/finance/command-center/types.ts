import type { AlertSeverity } from '@/components/ui/alert-card'

// ─── Summary endpoint response shape (subset we use) ─────────────────────────
export interface Summary {
  month_projection?: {
    expected_income: number
    spent_so_far: number
    projected_spend: number
    known_upcoming_treatment: number
    projected_savings: number
    method: string
  }
  current_month: {
    month: string
    day_of_month: number
    days_in_month: number
    month_progress_pct: number
    total_spent: number
    budget_vs_actual: Array<{
      category: string
      icon: string
      spent: number
      budget: number
      pct_used: number
      projected_month_total: number
      pace_vs_budget_pct: number
      status: 'ok' | 'warning' | 'over'
      is_non_monthly: boolean
      cycle_months: number
    }>
  }
  income: { total_monthly: number }
  spending: { total_monthly_avg: number }
  budgets: { total_budgeted: number }
  subscriptions: { total_monthly: number; total_annual: number }
  installments: { total_monthly_commitment: number }
  debts: { total_balance: number; total_minimums: number }
  emergency_fund: { current: number; target: number; months_covered: number }
  goals: { active: Array<{ name: string; target: number; current: number; pct: number; monthly_needed: number; on_track: boolean }> }
  cash_flow: { monthly_income: number; fixed_commitments: number; discretionary_available: number }
  goal_funding: { total_monthly_needed: number; discretionary_available: number; gap: number; fully_funded: boolean }
  year_end_goal_plan: {
    target_amount: number
    current_saved: number
    goal_remaining: number
    treatment_remaining: number
    total_needed_by_december: number
    months_remaining: number
    monthly_free_cash: number
    projected_free_cash_by_december: number
    monthly_all_in_needed: number
    shortfall_by_december: number
    surplus_by_december: number
    monthly_extra_needed: number
    on_track: boolean
    recommended_cuts: Array<{
      category: string
      icon: string
      current_budget: number
      recommended_cap: number
      cut_amount: number
    }>
  }
  fertility_plan: {
    name: string
    range_min: number
    range_max: number
    planning_total: number
    start_month: string
    end_month: string
    remaining_amount: number
    current_month_commitment: number
    total_goal_monthly_needed: number
    monthly_free_cash: number
    discretionary_after_treatment: number
    monthly_gap_to_keep_goals: number
    fully_funded_with_goals: boolean
    deferred_catch_up_monthly: number
    current_month_event: TreatmentEvent | null
    monthly_events: TreatmentEvent[]
    remaining_events: TreatmentEvent[]
    recommended_cuts: Array<{
      category: string
      icon: string
      current_budget: number
      recommended_cap: number
      cut_amount: number
    }>
  }
  msi_timeline: Array<{ name: string; merchant: string; monthly_payment: number; payments_remaining: number; end_date: string }>
  crypto: null | {
    total_value_mxn: number
    pnl_mxn: number
    pnl_pct: number
    risks: { concentration: { symbol: string; pct: number } | null; large_loss: { pnl_pct: number } | null }
  }
}

export interface TreatmentEvent {
  date: string
  month: string
  amount: number
  minAmount: number
  maxAmount: number
  label: string
}

export interface Forecast {
  period: { start: string; end: string; days: number }
  series: Array<{ date: string; inflow: number; outflow: number; net: number; running_balance: number }>
  events: import('@/components/finance/bills-timeline').ForecastEvent[]
  summary: {
    total_inflow: number
    total_outflow: number
    net_delta: number
    ending_balance: number
    min_balance: { date: string; balance: number }
    max_balance: { date: string; balance: number }
    next_7_days: { events: number; net: number }
    next_30_days: { events: number; net: number }
  }
}

export type Alert = {
  id: string
  severity: AlertSeverity
  title: string
  description: string
  action?: { label: string; href: string }
  weight: number
}

export type BudgetCat = Summary['current_month']['budget_vs_actual'][number]

// ─── Formatting ──────────────────────────────────────────────────────────────
export function fmtMoney(n: number, opts: { decimals?: number; compact?: boolean } = {}) {
  const { compact = false } = opts
  if (compact && Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (compact && Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n).toLocaleString()}`
}

export function fmtMonth(month: string) {
  const d = new Date(`${month}-01T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}
