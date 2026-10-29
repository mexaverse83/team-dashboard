import type {
  SummaryRecentTransaction,
  SummaryStaleness,
  SummaryUpcomingItem,
  SummaryVariable,
  SummaryWestPlan,
} from '@/lib/summary/types'

// ─── Summary endpoint response shape (subset we use) ─────────────────────────
// The optional tail mirrors the v2 contract (src/lib/summary/types.ts); every
// consumer must keep working while those fields are missing.
export interface Summary {
  variable?: SummaryVariable
  owner_spend?: Record<string, number>
  recent_transactions?: SummaryRecentTransaction[]
  upcoming?: SummaryUpcomingItem[]
  west_plan?: SummaryWestPlan | null
  staleness?: SummaryStaleness
  month_projection?: {
    expected_income: number
    income_received?: number
    income_still_scheduled?: number
    spent_so_far: number
    projected_spend: number
    known_upcoming_treatment: number
    known_upcoming_baby?: number
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
      is_fixed?: boolean
      category_id?: string
      cycle_months: number
    }>
  }
  income: {
    total_monthly: number
    configured_monthly?: number
    observed_monthly?: number
    current_month_actual?: number
    baseline_method?: 'configured' | 'observed-median'
  }
  spending: { total_monthly_avg: number }
  budgets: { total_budgeted: number }
  subscriptions: { total_monthly: number; total_annual: number; active?: Array<{ name: string; amount: number; last_charge?: string | null }> }
  installments: { total_monthly_commitment: number }
  debts: { total_balance: number; total_minimums: number }
  emergency_fund: {
    current: number
    target: number
    target_months?: number
    monthly_essentials?: number
    months_covered: number
    funded_pct?: number
    gap?: number
    essentials_basis?: 'derived' | 'manual'
    confirmed_at?: string | null
    days_since_confirmed?: number | null
  }
  goals: { active: Array<{ name: string; target: number; current: number; pct: number; monthly_needed: number; on_track: boolean }> }
  cash_flow: {
    monthly_income: number
    fixed_commitments: number
    discretionary_available: number
    /** v2: budgets + the clean-month median run rate (what "planned" means on home). */
    planned_spend?: number
    planned_spend_basis?: string
  }
  goal_funding: {
    total_monthly_needed: number
    discretionary_available: number
    gap: number
    fully_funded: boolean
    overdue_goals?: Array<{ name: string; target_date: string; remaining: number }>
  }
  year_end_goal_plan: {
    target_amount: number
    current_saved: number
    goal_remaining: number
    treatment_remaining: number
    baby_remaining_this_year?: number
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
  baby_plan?: {
    name: string
    due_month: string
    months_to_birth: number
    range_min: number
    range_max: number
    planning_total: number
    start_month: string
    end_month: string
    monthly_events: TreatmentEvent[]
    remaining_events: TreatmentEvent[]
    remaining_amount: number
    spent_to_date: number
    current_month_commitment: number
    current_month_event: TreatmentEvent | null
    education: {
      name: string
      monthly_contribution: number
      start_month: string
      target_month: string
      annual_return_rate: number
      education_inflation_rate: number
      months: number
      contributed: number
      projected_value: number
      tec_cost_min: number
      tec_cost_max: number
      coverage_pct_min: number
      coverage_pct_max: number
    }
    checklist: Array<{ id: string; title: string; description: string; severity: 'info' | 'warning'; window_end: string }>
    untagged_candidates?: number
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
