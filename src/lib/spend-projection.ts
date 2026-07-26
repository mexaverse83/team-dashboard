import { median } from '@/lib/household-metrics'

// Month-end spend estimate per budget category.
//
// The projection used to read only within-month signals: daily pace for
// variable categories, the full budget for fixed ones. That made it blind to
// what actually happens month after month — Subscriptions billed $300 for three
// straight months while the forecast kept adding the untouched $1,500 of its
// stale $1,800 budget, and a quiet month in Dining Out was projected as if the
// household had no history of quiet months.
//
// Every rule here answers one question: how much more lands between today and
// month end? A budget is a plan; history is a measurement. When they disagree,
// history breaks the tie.

export type CategoryHistory = {
  /** Totals for complete months only (current month excluded), oldest first. */
  monthTotals: number[]
  /** Median of the most recent HISTORY_WINDOW_MONTHS — the forecasting signal. */
  median: number
  monthsObserved: number
  /** Complete months whose total exceeded the current budget, across the series. */
  timesOverBudget: number
}

/** Complete months required before history is trusted over the budget. */
export const MIN_HISTORY_MONTHS = 3

/**
 * Months the forecasting median is taken over. Deliberately short: this
 * household cancelled two subscriptions in March, and a six-month median kept
 * those dead charges in the forecast for months. A median (not a mean) over the
 * recent window still absorbs a single outlier.
 */
export const HISTORY_WINDOW_MONTHS = 3

/**
 * Weight on this month's own rate when blending with the historical rate.
 * Majority weight: current behaviour leads, history damps a single odd month.
 */
export const THIS_MONTH_WEIGHT = 0.6

export function summarizeCategoryHistory(monthTotals: number[], budget = 0): CategoryHistory {
  const recent = monthTotals.slice(-HISTORY_WINDOW_MONTHS)
  return {
    monthTotals,
    median: Math.round(median(recent)),
    monthsObserved: monthTotals.length,
    timesOverBudget: budget > 0 ? monthTotals.filter(total => total > budget).length : 0,
  }
}

export type ProjectionBasis =
  | 'posted-only'
  | 'history-median'
  | 'budget'
  | 'pace'
  | 'pace-blended-with-history'

export type CategoryProjection = {
  projected: number
  expectedRemaining: number
  basis: ProjectionBasis
}

export function projectCategoryMonthEnd({
  spent,
  budget,
  isFixed,
  isNonMonthly,
  dayOfMonth,
  daysInMonth,
  history,
}: {
  spent: number
  budget: number
  isFixed: boolean
  isNonMonthly: boolean
  dayOfMonth: number
  daysInMonth: number
  history?: CategoryHistory | null
}): CategoryProjection {
  const spentRounded = Math.round(spent)
  const trustHistory = !!history && history.monthsObserved >= MIN_HISTORY_MONTHS

  // Money already spent is the floor — a projection can never undercut it.
  const finish = (projected: number, basis: ProjectionBasis): CategoryProjection => {
    const clamped = Math.max(spentRounded, Math.round(projected))
    return { projected: clamped, expectedRemaining: clamped - spentRounded, basis }
  }

  // Bimonthly/annual bills aren't linear spending and may not bill at all this
  // month — count only what actually posted.
  if (isNonMonthly) return finish(spent, 'posted-only')

  // Fixed: the charge is scheduled, so expect it even before it posts — but
  // never more than history says actually lands. This is what stops a stale
  // budget from inventing spending that hasn't happened in months.
  if (isFixed) {
    return trustHistory
      ? finish(Math.min(budget, history.median), 'history-median')
      : finish(budget, 'budget')
  }

  // Variable, early month: a rate off 1-6 days is noise. Prefer observed
  // history over the budget, which is a plan rather than a measurement.
  if (dayOfMonth < 7) {
    return trustHistory ? finish(history.median, 'history-median') : finish(budget, 'budget')
  }

  // Variable, past day 7: estimate the remaining days directly. Blending this
  // month's rate with the historical one keeps a single unusual month from
  // either running away or erasing a consistent habit — and it cuts both ways:
  // a quiet month projects lower, a category the household reliably overspends
  // projects higher than its own slow start suggests.
  const thisMonthRate = dayOfMonth > 0 ? spent / dayOfMonth : 0
  const historyRate = trustHistory && daysInMonth > 0 ? history.median / daysInMonth : 0
  const rate = trustHistory
    ? THIS_MONTH_WEIGHT * thisMonthRate + (1 - THIS_MONTH_WEIGHT) * historyRate
    : thisMonthRate
  const remainingDays = Math.max(0, daysInMonth - dayOfMonth)

  return finish(
    spent + remainingDays * rate,
    trustHistory ? 'pace-blended-with-history' : 'pace',
  )
}
