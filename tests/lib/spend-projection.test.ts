import { describe, expect, it } from 'vitest'
import {
  HISTORY_WINDOW_MONTHS,
  MIN_HISTORY_MONTHS,
  projectCategoryMonthEnd,
  summarizeCategoryHistory,
} from '@/lib/spend-projection'

// Day 26 of a 31-day month — the state that exposed the original bug.
const LATE_JULY = { dayOfMonth: 26, daysInMonth: 31 }

describe('summarizeCategoryHistory', () => {
  it('medians only the recent window, not the whole series', () => {
    // Two subscriptions were cancelled in March. A six-month median keeps the
    // dead charges alive at $893; the recent window sees the truth.
    const history = summarizeCategoryHistory([1_486, 1_790, 1_790, 300, 300, 300], 1_800)

    expect(history.median).toBe(300)
    expect(history.monthsObserved).toBe(6)
    expect(HISTORY_WINDOW_MONTHS).toBe(3)
  })

  it('counts months over budget across the full series', () => {
    // Dining Out, Feb-Jun against a $15,000 budget: only Feb and May breached.
    const history = summarizeCategoryHistory([17_837, 10_806, 11_309, 15_577, 9_537], 15_000)

    expect(history.timesOverBudget).toBe(2)
    expect(history.median).toBe(11_309)
  })

  it('handles an empty series', () => {
    const history = summarizeCategoryHistory([], 5_000)
    expect(history).toEqual({ monthTotals: [], median: 0, monthsObserved: 0, timesOverBudget: 0 })
  })
})

describe('projectCategoryMonthEnd', () => {
  it('expects nothing more from a fixed category whose history matches actuals', () => {
    // Subscriptions: $300 posted against a stale $1,800 budget. The old rule
    // added the untouched $1,500 every month.
    const result = projectCategoryMonthEnd({
      spent: 300,
      budget: 1_800,
      isFixed: true,
      isNonMonthly: false,
      ...LATE_JULY,
      history: summarizeCategoryHistory([1_486, 1_790, 1_790, 300, 300, 300], 1_800),
    })

    expect(result.projected).toBe(300)
    expect(result.expectedRemaining).toBe(0)
    expect(result.basis).toBe('history-median')
  })

  // Guard against the inverse failure: history must never talk the forecast
  // out of a scheduled charge that simply hasn't posted yet.
  it('still expects a fixed charge that has not posted', () => {
    const result = projectCategoryMonthEnd({
      spent: 0,
      budget: 45_000,
      isFixed: true,
      isNonMonthly: false,
      dayOfMonth: 3,
      daysInMonth: 31,
      history: summarizeCategoryHistory([34_170, 47_968, 45_000], 45_000),
    })

    expect(result.projected).toBe(45_000)
    expect(result.expectedRemaining).toBe(45_000)
  })

  it('never projects below money already spent', () => {
    const result = projectCategoryMonthEnd({
      spent: 45_000,
      budget: 45_000,
      isFixed: true,
      isNonMonthly: false,
      ...LATE_JULY,
      // A rent increase leaves the older months well below today's charge.
      history: summarizeCategoryHistory([34_100, 34_186, 34_170], 45_000),
    })

    expect(result.projected).toBe(45_000)
    expect(result.expectedRemaining).toBe(0)
  })

  it('counts only what posted for non-monthly billing', () => {
    const result = projectCategoryMonthEnd({
      spent: 0,
      budget: 10_000,
      isFixed: false,
      isNonMonthly: true,
      ...LATE_JULY,
      history: summarizeCategoryHistory([4_984, 4_984, 4_984], 10_000),
    })

    expect(result.projected).toBe(0)
    expect(result.basis).toBe('posted-only')
  })

  it('damps a quiet month upward and a loud month downward', () => {
    const history = summarizeCategoryHistory([11_309, 15_577, 9_537], 15_000)

    const quiet = projectCategoryMonthEnd({
      spent: 10_880, budget: 15_000, isFixed: false, isNonMonthly: false, ...LATE_JULY, history,
    })
    // Pure pace would say 10,880/26*31 = 12,972; history pulls it down.
    expect(quiet.projected).toBeLessThan(12_972)
    expect(quiet.basis).toBe('pace-blended-with-history')

    const loud = projectCategoryMonthEnd({
      spent: 20_000, budget: 15_000, isFixed: false, isNonMonthly: false, ...LATE_JULY, history,
    })
    // Pure pace would say 23,846; history pulls it down too.
    expect(loud.projected).toBeLessThan(23_846)
    expect(loud.projected).toBeGreaterThan(20_000)
  })

  it('raises the estimate when history spends more than a slow start suggests', () => {
    // Groceries: only $8,920 by day 26, but the household reliably spends ~13k.
    const result = projectCategoryMonthEnd({
      spent: 8_920, budget: 13_000, isFixed: false, isNonMonthly: false, ...LATE_JULY,
      history: summarizeCategoryHistory([13_393, 10_759, 13_488], 13_000),
    })

    expect(result.projected).toBeGreaterThan(Math.round(8_920 / 26 * 31))
  })

  it('falls back to pure pace without enough history', () => {
    const result = projectCategoryMonthEnd({
      spent: 10_880, budget: 15_000, isFixed: false, isNonMonthly: false, ...LATE_JULY,
      history: summarizeCategoryHistory([11_309, 15_577], 15_000),
    })

    // Identical to the old formula: spent / day * daysInMonth.
    expect(result.projected).toBe(Math.round(10_880 / 26 * 31))
    expect(result.basis).toBe('pace')
    expect(MIN_HISTORY_MONTHS).toBe(3)
  })

  it('anchors on history rather than the budget early in the month', () => {
    const result = projectCategoryMonthEnd({
      spent: 1_200, budget: 15_000, isFixed: false, isNonMonthly: false,
      dayOfMonth: 4, daysInMonth: 31,
      history: summarizeCategoryHistory([11_309, 15_577, 9_537], 15_000),
    })

    expect(result.projected).toBe(11_309)
    expect(result.basis).toBe('history-median')
  })

  it('uses the budget early in the month with no history', () => {
    const result = projectCategoryMonthEnd({
      spent: 1_200, budget: 15_000, isFixed: false, isNonMonthly: false,
      dayOfMonth: 4, daysInMonth: 31, history: null,
    })

    expect(result.projected).toBe(15_000)
    expect(result.basis).toBe('budget')
  })

  it('expects nothing more on the last day of the month', () => {
    const result = projectCategoryMonthEnd({
      spent: 12_000, budget: 15_000, isFixed: false, isNonMonthly: false,
      dayOfMonth: 31, daysInMonth: 31,
      history: summarizeCategoryHistory([11_309, 15_577, 9_537], 15_000),
    })

    expect(result.expectedRemaining).toBe(0)
  })
})
