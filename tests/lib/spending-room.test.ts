import { describe, expect, it } from 'vitest'
import { calculateSpendingRoom, type SpendingRoomSummary } from '@/lib/spending-room'

const summary: SpendingRoomSummary = {
  cash_flow: { monthly_income: 12000 },
  current_month: { day_of_month: 21, days_in_month: 30, total_spent: 2000, budget_vs_actual: [{ budget: 5000, spent: 2000 }] },
  goal_funding: { total_monthly_needed: 1000 },
  month_projection: { expected_income: 10000, projected_spend: 7000 },
}

describe('extra spending room', () => {
  it('uses expected income and reserves family and unbudgeted forecast spending', () => {
    expect(calculateSpendingRoom(summary)).toMatchObject({ income: 10000, reserved: 5000, freeMonth: 2000, perDay: 200, daysLeft: 10 })
  })
  it('does not release planned budgets when projections fall below them', () => {
    expect(calculateSpendingRoom({ ...summary, month_projection: { expected_income: 10000, projected_spend: 3000 } }).reserved).toBe(3000)
  })
  it('retains zero income and shows deficits without negative spending permission', () => {
    expect(calculateSpendingRoom({ ...summary, month_projection: { expected_income: 0, projected_spend: 7000 } })).toMatchObject({ income: 0, perDay: 0, freeMonth: -8000, overCommitted: true })
  })
  it('includes the final day of the month and supports older summaries', () => {
    expect(calculateSpendingRoom({ ...summary, month_projection: undefined, current_month: { ...summary.current_month, day_of_month: 30 } })).toMatchObject({ daysLeft: 1, perDay: 6000 })
  })
})
