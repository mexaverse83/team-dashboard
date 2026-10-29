// Response contract for GET /api/finance/summary (and buildSummary()).
//
// Every field added by the Mona v2 plan (§3) stays OPTIONAL in the type so
// consumers keep a graceful fallback, but buildSummary() always fills them.
// WS4 owns this file.

export interface PlanEvent {
  month: string
  amount: number
  label?: string
  [key: string]: unknown
}

export interface BudgetVsActualRow {
  category: string
  icon: string
  billing_cycle?: string
  spent: number
  /** Monthly-equivalent spend (non-monthly: cycle window ÷ cycle months), unrounded to centavos. */
  monthly_equivalent_spent?: number
  budget: number
  monthly_budget?: number
  pct_used: number
  over_under?: number
  status: 'ok' | 'warning' | 'over'
  daily_pace?: number
  budget_daily_pace?: number
  pace_vs_budget_pct: number
  projected_month_total: number
  expected_remaining?: number
  projection_basis?: string
  history_median?: number
  history_months?: number
  history_month_totals?: number[]
  times_over_budget?: number
  is_non_monthly: boolean
  is_fixed?: boolean
  cycle_months: number
  /** v2 (WS4): 'cash' basis on home — see the budgets parity test. */
  basis?: 'cash' | 'allocated'
  /** v2 (WS4): lets cards link to /finance/transactions?category=<id>. */
  category_id?: string
  /** v2 (WS4): non-monthly rows rate this calendar-cycle spend against `budget`. */
  cycle_window_spent?: number
}

// ── §3 additions (all optional until WS4 lands) ─────────────────────────────

export interface SummaryVariable {
  budget: number
  spent: number
  /** Signed: negative when controllable spend is already over budget. */
  left: number
  /** Includes today. */
  days_left: number
  /** e.g. "Sat Oct 31" */
  through_label: string
  /** YYYY-MM-DD of the same day as `through_label` (lets the widget localise it). */
  through_date?: string | null
  status: 'ok' | 'tight' | 'over'
  /** Days in the week window (through Sunday or month end), incl. today. */
  week_days_left?: number
  /** `left` pro-rated to the week window; equals `left` when negative. */
  week_left?: number
  categories?: number
}

export interface SummaryRecentTransaction {
  id: string
  date: string
  merchant: string
  amount: number
  owner: string | null
  category_name: string | null
  category_icon: string | null
  type?: 'expense' | 'income' | string
}

export type UpcomingKind = 'bill' | 'msi' | 'income' | 'baby' | 'west'

export interface SummaryUpcomingItem {
  date: string
  label: string
  amount: number
  kind: UpcomingKind
  /** Grouped bills: how many share the date, and their names. */
  count?: number
  items?: string[]
}

export interface SummaryWestPlan {
  month_target: number
  capacity_target: number
  projected_savings: number
  pct_of_capacity: number
  pct_of_target: number
  purchase_gap: number
  furnishing_budget: number
  cumulative_vs_capacity_since_jan: number
  months_to_delivery: number
  funded_pct: number
  /** The stretch target fits capacity (stretch ≤ 1.05). */
  feasible?: boolean
  projected_shortfall_at_delivery?: number
  stretch_factor?: number
}

export interface SummaryStaleness {
  gbm_confirmed_at: string | null
  ef_confirmed_at: string | null
  real_estate_confirmed_at: string | null
}

// ── Existing sections ───────────────────────────────────────────────────────

export interface SummaryResponse {
  period: { start: string; end: string }
  income: {
    sources: Array<Record<string, unknown>>
    recurring: Array<Record<string, unknown>>
    future_recurring?: Array<Record<string, unknown>>
    configured_monthly: number
    observed_monthly: number
    current_month_actual: number
    total_monthly: number
    baseline_method: 'configured' | 'observed-median'
  }
  spending: {
    by_category: Array<Record<string, unknown>>
    total_monthly_avg: number
    by_month: Array<{ month: string; total: number }>
  }
  budgets: {
    total_budgeted: number
    total_spent: number
    categories: Array<{ category: string; icon?: string; budget: number; budget_type?: string; [key: string]: unknown }>
  }
  subscriptions: {
    /** `last_charge` holds the NEXT charge date (legacy name); `next_charge` is the same value. */
    active: Array<{ name: string; amount: number; frequency: string; monthly_equivalent: number; last_charge: string | null; next_charge?: string | null }>
    total_monthly: number
    total_annual: number
  }
  installments: {
    active: Array<{ name: string; merchant: string; monthly_payment: number; payments_remaining: number; total_remaining: number; end_date: string }>
    total_monthly_commitment: number
  }
  debts: {
    items: Array<{ name: string; balance: number; rate: number; minimum: number }>
    total_balance: number
    total_minimums: number
  }
  emergency_fund: {
    target: number
    current: number
    target_months: number
    monthly_essentials: number
    months_covered: number
    funded_pct: number
    gap: number
    risk_score: number
    /** v2 (WS4): 'derived' = median of 3 months of needs spend; 'manual' = explicit override. */
    essentials_basis?: 'derived' | 'manual'
    confirmed_at?: string | null
    derived_essentials?: number
    manual_essentials?: number | null
    stored_target?: number
    days_since_confirmed?: number | null
  }
  goals: {
    active: Array<{
      name: string; target: number; current: number; pct: number; monthly_needed: number; on_track: boolean
      id?: string; target_date?: string | null; months_remaining?: number; overdue?: boolean
      /** Crypto goals count coins (`unit` = symbol) and never enter peso totals. */
      is_crypto?: boolean; unit?: string; owner?: string | null; scope?: string | null
    }>
  }
  cash_flow: {
    monthly_income: number
    /** Budgets + MSI + debt minimums — what is budgeted, not what is spent. */
    fixed_commitments: number
    /** v2 (WS4): median clean spend (one-off lumps out) of the last 3 complete months, budgeted + unbudgeted. */
    planned_spend?: number
    planned_spend_basis?: 'median-clean-3mo' | 'budgets'
    /**
     * v2 (WS4): free cash per month = median clean net (income − spend, windfalls
     * and lumps out) of the last 3 complete months. Equals
     * goal_funding.discretionary_available and year_end_goal_plan.monthly_free_cash.
     */
    discretionary_available: number
  }
  current_month: {
    month: string
    day_of_month: number
    days_in_month: number
    month_progress_pct: number
    total_spent: number
    /** v2 (WS4): spend in savings-type categories, excluded from total_spent and budgets. */
    moved_to_savings?: number
    budget_basis?: 'cash'
    budget_vs_actual: BudgetVsActualRow[]
  }
  month_projection: {
    expected_income: number
    income_received?: number
    income_still_scheduled?: number
    spent_so_far: number
    projected_spend: number
    known_upcoming_treatment: number
    known_upcoming_baby?: number
    moved_to_savings?: number
    /** Routine spend in unbudgeted, non-everyday categories (Health…): median of the last 3 complete months. */
    unbudgeted_typical?: number
    /** That same spend posted this month (planned tags and savings moves out). */
    unbudgeted_spent?: number
    /** The part of unbudgeted_spent dated today (Mexico City). */
    unbudgeted_spent_today?: number
    projected_savings: number
    method: string
  }
  goal_funding: {
    total_monthly_needed: number
    discretionary_available: number
    gap: number
    fully_funded: boolean
    /** v2 (WS4): goals past their target date, excluded from the monthly need. */
    overdue_goals?: Array<{ name: string; target_date: string; remaining: number }>
  }
  year_end_goal_plan: Record<string, unknown>
  /** Active shape today; v2 (WS4) may return `{ status: 'complete', total_paid }`. */
  fertility_plan: Record<string, unknown> & { status?: 'active' | 'complete'; total_paid?: number }
  baby_plan: {
    name: string
    due_month: string
    months_to_birth: number
    planning_total: number
    remaining_events: PlanEvent[]
    /** planning_total − baby-TAGGED spend; untagged prenatal rows keep it high until tagged. */
    remaining_amount: number
    /** v2 (WS4): sum of remaining_events — what the schedule still expects to be paid. */
    remaining_scheduled?: number
    spent_to_date: number
    current_month_commitment: number
    current_month_event: PlanEvent | null
    checklist: Array<{ id: string; title: string; description: string; severity: 'info' | 'warning'; window_end: string }>
    /** v2 (WS4): rows that look like baby spend but lack the tag. */
    untagged_candidates?: number
    [key: string]: unknown
  }
  msi_timeline: Array<{ name: string; merchant: string; monthly_payment: number; payments_remaining: number; end_date: string }>
  crypto: null | {
    total_value_mxn: number
    total_value_usd?: number
    total_cost_mxn?: number
    pnl_mxn: number
    pnl_pct: number
    holdings?: Array<Record<string, unknown>>
    by_owner?: Record<string, { value_mxn: number }>
    risks?: { concentration: { symbol: string; pct: number } | null; large_loss: { pnl_pct: number } | null }
  }

  // ── §3 additions (optional) ──
  variable?: SummaryVariable
  owner_spend?: Record<string, number>
  recent_transactions?: SummaryRecentTransaction[]
  upcoming?: SummaryUpcomingItem[]
  west_plan?: SummaryWestPlan | null
  staleness?: SummaryStaleness
}
