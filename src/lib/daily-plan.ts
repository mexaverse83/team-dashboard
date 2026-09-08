import { calculateSpendingRoom, type SpendingRoomSummary } from '@/lib/spending-room'
import { mexicoCityDateParts, remainingCalendarWeekEnvelope } from '@/lib/insights-prompt.mjs'

const CONTROLLABLE = new Set(['Dining Out', 'Groceries', 'Entertainment', 'Shopping', 'Transport', 'Travel', 'Gifts', 'Other'])
type DailySummary = Omit<SpendingRoomSummary, 'current_month' | 'month_projection'> & {
  current_month: Omit<SpendingRoomSummary['current_month'], 'budget_vs_actual'> & { budget_vs_actual: Array<{ category: string; spent: number; budget: number; is_non_monthly: boolean }> }
  month_projection?: NonNullable<SpendingRoomSummary['month_projection']> & { projected_savings: number }
}

/** The same live plan for the browser brief and phone widget. */
export function calculateDailyPlan(summary: DailySummary, westTarget: number | null, weekday = mexicoCityDateParts().dayOfWeek) {
  const room = calculateSpendingRoom(summary)
  const remaining = summary.current_month.budget_vs_actual
    .filter(b => CONTROLLABLE.has(b.category) && !b.is_non_monthly)
    .reduce((sum, b) => sum + Math.max(0, b.budget - b.spent), 0)
  const week = remainingCalendarWeekEnvelope(remaining, room.daysLeft, weekday)
  const savings = summary.month_projection?.projected_savings ?? 0
  const westGap = westTarget == null ? null : Math.max(0, westTarget - savings)
  return {
    safe_to_spend_day: room.perDay,
    over_committed_by: Math.max(0, Math.round(-room.freeMonth)),
    controllable_per_day: week.dailyEnvelope,
    week_envelope: week.weekEnvelope,
    week_envelope_west: westGap == null ? null : remainingCalendarWeekEnvelope(Math.max(0, remaining - westGap), room.daysLeft, weekday).weekEnvelope,
    days_left_in_week: week.daysThroughSunday,
    projected_savings: Math.round(savings),
    goal_coverage_pct: room.goalNeed > 0 ? Math.max(0, Math.round(savings / room.goalNeed * 100)) : 100,
    goal_monthly_needed: Math.round(room.goalNeed),
  }
}
