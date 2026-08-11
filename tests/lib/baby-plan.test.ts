import { describe, expect, it } from 'vitest'
import {
  BABY_CHECKLIST,
  BABY_PLAN,
  EDUCATION_FUND_PLAN,
  getActiveChecklistItems,
  getBabyEventForMonth,
  getNextBabyEvent,
  getRemainingBabyEvents,
  monthsUntilDue,
  projectEducationFund,
} from '@/lib/baby-plan'

describe('BABY_PLAN', () => {
  it('events sum to the planning total', () => {
    const sum = BABY_PLAN.events.reduce((s, e) => s + e.amount, 0)
    expect(sum).toBe(BABY_PLAN.planningTotal)
  })

  it('events are ordered and stay inside the plan window', () => {
    const months = BABY_PLAN.events.map(e => e.month)
    expect([...months].sort()).toEqual(months)
    expect(months[0] >= BABY_PLAN.startMonth).toBe(true)
    expect(months[months.length - 1] <= BABY_PLAN.endMonth).toBe(true)
  })

  it('the birth envelope lands in the due month', () => {
    const birth = BABY_PLAN.events[BABY_PLAN.events.length - 1]
    expect(birth.month).toBe(BABY_PLAN.dueMonth)
    expect(birth.amount).toBe(180000)
  })
})

describe('baby event windows', () => {
  it('keeps every event before the plan starts', () => {
    expect(getRemainingBabyEvents(new Date(2026, 7, 11))).toHaveLength(BABY_PLAN.events.length)
  })

  it('keeps a current-month event even after its date passes', () => {
    // Sep 20: the Sep 15 prenatal event is past-dated but still this month.
    const remaining = getRemainingBabyEvents(new Date(2026, 8, 20))
    expect(remaining[0].month).toBe('2026-09')
  })

  it('drops past months entirely', () => {
    const remaining = getRemainingBabyEvents(new Date(2027, 0, 2))
    expect(remaining.every(e => e.month >= '2027-01')).toBe(true)
  })

  it('returns nothing after the plan ends', () => {
    expect(getRemainingBabyEvents(new Date(2027, 5, 1))).toHaveLength(0)
    expect(getNextBabyEvent(new Date(2027, 5, 1))).toBeNull()
  })

  it('finds the event for a given month', () => {
    expect(getBabyEventForMonth('2027-04')?.amount).toBe(180000)
    expect(getBabyEventForMonth('2026-08')).toBeNull()
  })
})

describe('monthsUntilDue', () => {
  it('counts calendar months to April 2027', () => {
    expect(monthsUntilDue(new Date(2026, 7, 11))).toBe(8)
    expect(monthsUntilDue(new Date(2027, 3, 1))).toBe(0)
  })
})

describe('projectEducationFund', () => {
  it('projects ~$3.48M from $7k/mo at 8% over 219 months', () => {
    const p = projectEducationFund()
    expect(p.months).toBe(219)
    expect(p.contributed).toBe(7000 * 219)
    // FV annuity at 8%/12 over 219 months ≈ $3.46M
    expect(p.projected_value).toBeGreaterThan(3_300_000)
    expect(p.projected_value).toBeLessThan(3_600_000)
  })

  it('inflates the Tec cost band to 2045 at 6%', () => {
    const p = projectEducationFund()
    // 1.0M–1.2M × 1.06^19 ≈ 3.03M–3.63M
    expect(p.tec_cost_min).toBeGreaterThan(2_900_000)
    expect(p.tec_cost_min).toBeLessThan(3_100_000)
    expect(p.tec_cost_max).toBeGreaterThan(3_500_000)
    expect(p.tec_cost_max).toBeLessThan(3_750_000)
  })

  it('covers full tuition and most of the all-in cost', () => {
    const p = projectEducationFund()
    expect(p.coverage_pct_max).toBeGreaterThanOrEqual(100) // vs tuition-only
    expect(p.coverage_pct_min).toBeGreaterThan(80)         // vs all-in
    expect(p.coverage_pct_min).toBeLessThanOrEqual(100)
  })

  it('compounds an existing balance on top of contributions', () => {
    const base = projectEducationFund()
    const withBalance = projectEducationFund(100_000, EDUCATION_FUND_PLAN.startMonth)
    // 100k over ~18.25 years at 8% ≈ ×4.3
    const gain = withBalance.projected_value - base.projected_value
    expect(gain).toBeGreaterThan(400_000)
    expect(gain).toBeLessThan(460_000)
  })
})

describe('baby checklist windows', () => {
  it('has unique ids', () => {
    const ids = BABY_CHECKLIST.map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('surfaces the testamento and GMM items in late August 2026', () => {
    const active = getActiveChecklistItems(new Date(2026, 7, 20)).map(i => i.id)
    expect(active).toContain('baby-testamento')
    expect(active).toContain('baby-gmm-verify')
    expect(active).not.toContain('baby-gmm-newborn')
  })

  it('closes the testamento window after September 2026', () => {
    const active = getActiveChecklistItems(new Date(2026, 9, 1)).map(i => i.id)
    expect(active).not.toContain('baby-testamento')
  })

  it('opens the newborn items in the birth month', () => {
    const active = getActiveChecklistItems(new Date(2027, 3, 10)).map(i => i.id)
    expect(active).toContain('baby-gmm-newborn')
    expect(active).toContain('baby-guarderia-imss')
  })

  it('goes quiet after mid-2027 — no stale nags', () => {
    expect(getActiveChecklistItems(new Date(2027, 7, 1))).toHaveLength(0)
  })
})
