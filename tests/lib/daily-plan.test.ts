import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/finance-review.json'
import { calculateDailyPlan } from '@/lib/daily-plan'

describe('shared dashboard and widget plan', () => {
  it('uses the same extra room and a Sunday-only envelope', () => {
    const plan = calculateDailyPlan(fixture.summary, 18000, 0)
    expect(plan.safe_to_spend_day).toBe(86)
    expect(plan.days_left_in_week).toBe(1)
    expect(plan.week_envelope).toBe(252)
    expect(plan.week_envelope_west).toBe(plan.week_envelope)
  })
  it('reserves the WEST gap from controllable spending without inventing a target', () => {
    expect(calculateDailyPlan(fixture.summary, 30000, 2).week_envelope_west).toBe(0)
    expect(calculateDailyPlan(fixture.summary, null, 2).week_envelope_west).toBeNull()
  })
})
