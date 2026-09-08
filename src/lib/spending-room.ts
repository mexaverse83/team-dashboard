export interface SpendingRoomSummary {
  cash_flow: { monthly_income: number }
  current_month: {
    day_of_month: number
    days_in_month: number
    total_spent: number
    budget_vs_actual: Array<{ spent: number; budget: number }>
  }
  goal_funding: { total_monthly_needed: number }
  month_projection?: {
    expected_income: number
    projected_spend: number
  }
}

/** Extra spending above the existing plan, not an available bank balance.
 * Reserve at least the remaining budgets and any larger forecast commitment.
 * The forecast includes scheduled family costs and unbudgeted spending.
 */
export function calculateSpendingRoom(data: SpendingRoomSummary) {
  const income = data.month_projection?.expected_income ?? data.cash_flow.monthly_income
  const spent = data.current_month.total_spent
  const budgetRemaining = data.current_month.budget_vs_actual.reduce(
    (sum, b) => sum + Math.max(0, b.budget - b.spent), 0,
  )
  const forecastRemaining = Math.max(0, (data.month_projection?.projected_spend ?? spent) - spent)
  const reserved = Math.max(budgetRemaining, forecastRemaining)
  const goalNeed = data.goal_funding.total_monthly_needed
  const daysLeft = Math.max(1, data.current_month.days_in_month - data.current_month.day_of_month + 1)
  const freeMonth = income - spent - reserved - goalNeed
  return {
    income, spent, reserved, goalNeed, daysLeft, freeMonth,
    perDay: Math.max(0, Math.floor(freeMonth / daysLeft)),
    overCommitted: freeMonth < 0,
  }
}
