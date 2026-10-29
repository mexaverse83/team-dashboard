import { lumpSum } from '@/lib/spend-projection'
import { buildFertilityCutRecommendations, type CutCandidate } from '@/lib/fertility-plan'
import { BABY_PLAN_TAG } from '@/lib/baby-plan'
import { hasTag, txAmount, type TxRow } from '@/lib/summary/history'

type KnownCash = { month: string; amount: number; label: string; posted?: boolean }
import type { BudgetVsActualRow, PlanEvent } from '@/lib/summary/types'
import type { SummaryGoal } from '@/lib/summary/goals'

// Carried at actuals, never trended: plan-driven one-offs, and rows the
// processor posts exactly once a month (a days-elapsed multiplier invents
// repeats that can't happen).
export const UNTRENDED_TAGS = ['fertility', BABY_PLAN_TAG, 'auto-recurring', 'auto-msi']

/** Month-end spend: per-category projections plus unbudgeted spend and still-owed plan events. */
export function projectMonthSpend({
  budgetVsActual, currentMonthTxs, budgetedCategoryIds, dayOfMonth, daysInMonth, treatmentDue, babyDue,
}: {
  budgetVsActual: BudgetVsActualRow[]
  currentMonthTxs: TxRow[]
  budgetedCategoryIds: Set<string>
  dayOfMonth: number
  daysInMonth: number
  treatmentDue: number
  babyDue: number
}) {
  const totalSpent = currentMonthTxs.reduce((s, t) => s + txAmount(t), 0)
  const projectedBudgeted = budgetVsActual.reduce((s, b) => s + b.projected_month_total, 0)
  const budgetedSpent = budgetVsActual.reduce((s, b) => s + b.spent, 0)
  const unbudgetedSpent = Math.max(0, Math.round(totalSpent) - budgetedSpent)
  const unbudgeted = currentMonthTxs.filter(t => !budgetedCategoryIds.has(t.category_id || ''))
  const atActuals = Math.round(unbudgeted.filter(t => hasTag(t, ...UNTRENDED_TAGS)).reduce((s, t) => s + txAmount(t), 0))
  // One-off charges (a $2,800 baby purchase) land once; only routine
  // unbudgeted spending runs at its daily pace past day 7.
  const lumps = lumpSum(unbudgeted.filter(t => !hasTag(t, ...UNTRENDED_TAGS)).map(txAmount), 0)
  const trended = Math.max(0, unbudgetedSpent - atActuals - lumps)
  const pastDay7 = dayOfMonth >= 7
  const projectedUnbudgeted = (pastDay7 && dayOfMonth > 0 ? Math.round(trended / dayOfMonth * daysInMonth) : trended) + lumps
  return {
    total_spent: Math.round(totalSpent),
    projected_spend: Math.round(projectedBudgeted + projectedUnbudgeted + atActuals + treatmentDue + babyDue),
    past_day_7: pastDay7,
  }
}

/**
 * Can the household reach its goals by the end of their target year? This
 * month contributes its projected savings; each later month the median clean
 * net of the last 3 complete months (plus income that starts later), minus
 * known lumps (WEST balloon) and baby events, plus once-a-year income
 * (aguinaldo) in the window. A lump or inflow dated THIS month counts until
 * it posts (then it's inside projectedSavings). Goals past their
 * date and crypto goals are out; the finished fertility plan adds nothing.
 */
export function buildYearEndPlan({
  goals, targetYear, month, projectedSavings, runRate, futureIncome, babyEvents, babyRoutine = 0, knownLumps, knownInflows = [], wantsBudgets,
}: {
  /** Monthly baby spend already reflected in the run rate. */
  babyRoutine?: number
  goals: SummaryGoal[]
  targetYear: number
  month: string
  projectedSavings: number
  runRate: number
  futureIncome: Array<{ start_date: string; monthly_amount: number }>
  babyEvents: PlanEvent[]
  knownLumps: KnownCash[]
  /** Once-a-year income the run rate can't see yet (aguinaldo). */
  knownInflows?: KnownCash[]
  wantsBudgets: CutCandidate[]
}) {
  const yearEnd = `${targetYear}-12`
  const inScope = goals.filter(g => !g.is_crypto && !g.overdue && (g.target_date || '').slice(0, 4) <= String(targetYear))
  const targetAmount = inScope.reduce((s, g) => s + g.target, 0)
  const saved = inScope.reduce((s, g) => s + g.current, 0)
  const goalRemaining = Math.max(0, Math.round(targetAmount - saved))
  // This month's event is already inside projectedSavings, and routine
  // prenatal spend is inside the run rate — only the excess of later events
  // (gear, the birth) is new money.
  const babyRemaining = Math.round(babyEvents
    .filter(e => e.month > month && e.month <= yearEnd)
    .reduce((s, e) => s + Math.max(0, e.amount - babyRoutine), 0))
  const ahead = (l: KnownCash) => (l.month > month || (l.month === month && !l.posted)) && l.month <= yearEnd
  const strip = ({ month, amount, label }: KnownCash) => ({ month, amount, label })
  const lumps = knownLumps.filter(ahead).map(strip)
  const inflows = knownInflows.filter(ahead).map(strip)
  const [y, m] = month.split('-').map(Number)
  const monthsRemaining = Math.max(1, (targetYear - y) * 12 + (12 - m) + 1)

  let projectedFreeCash = Math.max(0, projectedSavings)
  for (let i = 1; i < monthsRemaining; i++) {
    const index = y * 12 + (m - 1) + i
    const start = `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
    const extra = futureIncome.filter(r => r.start_date <= start).reduce((s, r) => s + r.monthly_amount, 0)
    projectedFreeCash += Math.max(0, runRate + extra)
  }
  projectedFreeCash += inflows.reduce((s, l) => s + l.amount, 0) - lumps.reduce((s, l) => s + l.amount, 0)
  projectedFreeCash = Math.round(projectedFreeCash)

  const totalNeeded = goalRemaining + babyRemaining
  const shortfall = Math.max(0, totalNeeded - projectedFreeCash)
  const monthlyExtra = Math.ceil(shortfall / monthsRemaining)
  return {
    target_year: targetYear,
    target_amount: targetAmount,
    current_saved: Math.round(saved),
    goal_remaining: goalRemaining,
    treatment_remaining: 0,
    baby_remaining_this_year: babyRemaining,
    known_lumps: lumps,
    known_inflows: inflows,
    total_needed_by_december: totalNeeded,
    months_remaining: monthsRemaining,
    monthly_free_cash: runRate,
    run_rate_basis: 'median net of the last 3 complete months (windfalls and one-off lumps excluded)',
    current_month_savings: Math.max(0, projectedSavings),
    projected_free_cash_by_december: projectedFreeCash,
    monthly_all_in_needed: Math.ceil(totalNeeded / monthsRemaining),
    shortfall_by_december: shortfall,
    surplus_by_december: Math.max(0, projectedFreeCash - totalNeeded),
    monthly_extra_needed: monthlyExtra,
    on_track: shortfall <= 0,
    recommended_cuts: buildFertilityCutRecommendations(wantsBudgets, monthlyExtra),
  }
}
