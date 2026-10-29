import {
  buildFertilityCutRecommendations, FERTILITY_TREATMENT_PLAN, getRemainingTreatmentEvents, getTreatmentEventForMonth,
  getUnpaidTreatmentEventsForMonth, isFertilityPlanComplete, type CutCandidate, type TreatmentEvent, type TreatmentPaymentTx,
} from '@/lib/fertility-plan'
import {
  BABY_PLAN, EDUCATION_FUND_PLAN, getActiveChecklistItems, monthsUntilDue, projectEducationFund,
} from '@/lib/baby-plan'

/** Fertility plan payload: finished plans collapse to what was paid. */
export function buildFertilityPlan({
  paidTxs, asOf, month, goalMonthlyNeeded, discretionary, wantsBudgets,
}: {
  paidTxs: TreatmentPaymentTx[]
  /** mxNow() — local getters read the Mexico City date. */
  asOf: Date
  month: string
  goalMonthlyNeeded: number
  discretionary: number
  wantsBudgets: CutCandidate[]
}) {
  const plan = FERTILITY_TREATMENT_PLAN
  const totalPaid = Math.round(paidTxs.reduce((s, t) => s + t.amount, 0))
  const base = {
    name: plan.name,
    planning_total: plan.planningTotal,
    start_month: plan.startMonth,
    end_month: plan.endMonth,
    total_paid: totalPaid,
  }
  if (isFertilityPlanComplete()) {
    return {
      ...base,
      status: 'complete' as const,
      completed_month: plan.completedMonth,
      remaining_events: [] as TreatmentEvent[],
      remaining_amount: 0,
      current_month_commitment: 0,
      current_month_event: null,
      recommended_cuts: [],
    }
  }
  const remainingEvents = getRemainingTreatmentEvents(asOf)
  const currentEvent = getTreatmentEventForMonth(month) ?? remainingEvents[0] ?? null
  const commitment = currentEvent?.amount ?? 0
  const gap = Math.max(0, goalMonthlyNeeded + commitment - discretionary)
  return {
    ...base,
    status: 'active' as const,
    range_min: plan.minTotal,
    range_max: plan.maxTotal,
    monthly_events: plan.events,
    remaining_events: remainingEvents,
    remaining_amount: Math.max(0, plan.planningTotal - totalPaid),
    current_month_commitment: commitment,
    current_month_event: currentEvent,
    total_goal_monthly_needed: goalMonthlyNeeded,
    monthly_free_cash: discretionary,
    discretionary_after_treatment: discretionary - commitment,
    monthly_gap_to_keep_goals: gap,
    fully_funded_with_goals: gap <= 0,
    recommended_cuts: buildFertilityCutRecommendations(wantsBudgets, gap),
  }
}

/** Treatment money still expected this month (0 once the plan is complete). */
export function treatmentDueThisMonth(month: string, paidTxs: TreatmentPaymentTx[]): number {
  if (isFertilityPlanComplete()) return 0
  return getUnpaidTreatmentEventsForMonth(month, paidTxs).reduce((s, e) => s + e.amount, 0)
}

export interface BabyLedger {
  /** Baby-tagged spend, all time. */
  taggedPaid: TreatmentPaymentTx[]
  /** Tagged rows plus untagged rows that look like baby spend — what actually settles a month's event. */
  settlementPaid: TreatmentPaymentTx[]
  untaggedCandidates: number
}

/** Events still owed, in order: future ones in full, this month's net of what already landed. */
export function remainingBabyEvents(ledger: BabyLedger, today: string): TreatmentEvent[] {
  const month = today.slice(0, 7)
  const out: TreatmentEvent[] = []
  for (const event of BABY_PLAN.events) {
    if (event.month < month) continue
    if (event.month === month) {
      out.push(...getUnpaidTreatmentEventsForMonth(month, ledger.settlementPaid, [event], { matchMode: 'cumulative' }))
    } else if (event.date >= today) {
      out.push(event)
    }
  }
  return out
}

export function buildBabyPlan(ledger: BabyLedger, { asOf, today }: { asOf: Date; today: string }) {
  const month = today.slice(0, 7)
  const remaining = remainingBabyEvents(ledger, today)
  const spentToDate = Math.round(ledger.taggedPaid.reduce((s, t) => s + t.amount, 0))
  const currentEvent = remaining.find(e => e.month === month) ?? null
  return {
    name: BABY_PLAN.name,
    due_month: BABY_PLAN.dueMonth,
    months_to_birth: Math.max(0, monthsUntilDue(asOf)),
    range_min: BABY_PLAN.minTotal,
    range_max: BABY_PLAN.maxTotal,
    planning_total: BABY_PLAN.planningTotal,
    start_month: BABY_PLAN.startMonth,
    end_month: BABY_PLAN.endMonth,
    monthly_events: BABY_PLAN.events,
    remaining_events: remaining,
    // Budget left against TAGGED spend. remaining_scheduled follows the event
    // schedule (settled on tagged + look-alike rows), so the two differ until
    // the untagged candidates are tagged.
    remaining_amount: Math.max(0, BABY_PLAN.planningTotal - spentToDate),
    remaining_scheduled: Math.round(remaining.reduce((s, e) => s + e.amount, 0)),
    spent_to_date: spentToDate,
    untagged_candidates: ledger.untaggedCandidates,
    current_month_commitment: currentEvent?.amount ?? 0,
    current_month_event: currentEvent ?? remaining[0] ?? null,
    education: {
      name: EDUCATION_FUND_PLAN.name,
      monthly_contribution: EDUCATION_FUND_PLAN.monthlyContribution,
      start_month: EDUCATION_FUND_PLAN.startMonth,
      target_month: EDUCATION_FUND_PLAN.targetMonth,
      annual_return_rate: EDUCATION_FUND_PLAN.annualReturnRate,
      education_inflation_rate: EDUCATION_FUND_PLAN.educationInflationRate,
      ...projectEducationFund(),
    },
    checklist: getActiveChecklistItems(asOf).map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      severity: item.severity,
      window_end: item.windowEnd,
    })),
  }
}
