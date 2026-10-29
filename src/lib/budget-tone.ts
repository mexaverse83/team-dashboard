// One rule for what colour a budget gets, shared by Budget watch, the
// Budgets page, Budget Builder, goal bars and the widget (VIS-03, corrected):
//   red    (negative) — actual spend is over budget
//   amber  (warning)  — only the projection is over, or usage is 85–100%
//   green  (positive) — comfortably under plan
//   neutral           — a fixed category paid at (or, when nothing more is
//                       projected, under) its budget ("Paid"),
//                       or a row with no budget to judge against
export type Tone = 'positive' | 'warning' | 'negative' | 'neutral'

export interface BudgetToneInput {
  actual: number
  budget: number
  /** Projected month-end total; amber when only this exceeds the budget. */
  projected?: number | null
  /** Fixed/scheduled categories (rent, mortgage) read "Paid" at 100%, not amber. */
  isFixed?: boolean
}

/** Usage at or above this fraction of budget is amber. */
export const BUDGET_WARNING_RATIO = 0.85

// Fixed charges land at "exactly" budget give or take rounding.
const FIXED_TOLERANCE_RATIO = 0.005
const FIXED_TOLERANCE_ABS = 1

export function getBudgetTone({ actual, budget, projected, isFixed = false }: BudgetToneInput): Tone {
  const spent = Number(actual) || 0
  const limit = Number(budget) || 0
  if (limit <= 0) return 'neutral'
  const tolerance = Math.max(FIXED_TOLERANCE_ABS, limit * FIXED_TOLERANCE_RATIO)
  if (isFixed && Math.abs(spent - limit) <= tolerance) return 'neutral'
  // A fixed bill already paid for the month (projection = what's been charged)
  // has nothing left to pace, even if it came in under budget: "Paid".
  if (isFixed && spent > 0 && spent <= limit && projected != null && Number(projected) <= spent + tolerance) return 'neutral'
  if (spent > limit) return 'negative'
  if (spent / limit >= BUDGET_WARNING_RATIO) return 'warning'
  if (projected != null && Number(projected) > limit) return 'warning'
  return 'positive'
}

export interface BudgetStatus {
  tone: Tone
  /** Short word for a StatusPill: 'Over' · 'Watch' · 'On track' · 'Paid' · 'No budget'. */
  label: string
  /** Rounded usage percentage (0 when there is no budget). */
  pct: number
}

export function describeBudget(input: BudgetToneInput): BudgetStatus {
  const tone = getBudgetTone(input)
  const limit = Number(input.budget) || 0
  const pct = limit > 0 ? Math.round(((Number(input.actual) || 0) / limit) * 100) : 0
  const label = limit <= 0
    ? 'No budget'
    : tone === 'negative' ? 'Over'
      : tone === 'warning' ? 'Watch'
        : tone === 'neutral' ? 'Paid'
          : 'On track'
  return { tone, label, pct }
}

/** Token-backed classes per tone (see globals.css `@theme inline`). */
export const TONE_TEXT_CLASS: Record<Tone, string> = {
  positive: 'text-positive',
  warning: 'text-warning',
  negative: 'text-negative',
  neutral: 'text-fg-secondary',
}

export const TONE_BG_CLASS: Record<Tone, string> = {
  positive: 'bg-positive-bg',
  warning: 'bg-warning-bg',
  negative: 'bg-negative-bg',
  neutral: 'bg-surface-3',
}

export const TONE_FILL_CLASS: Record<Tone, string> = {
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
  neutral: 'bg-fg-tertiary',
}
