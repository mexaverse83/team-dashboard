import { describe, expect, it } from 'vitest'
import { commitmentCoverage, deriveIncomeBaseline, emergencyFundCoverage, expectedMonthIncome } from '@/lib/household-metrics'

// July 2026 payroll: all three recurring rows posted on the 1st.
const JULY_RECURRING = [
  { name: 'Nexaminds Salary', amount: 120_000, recurrence: 'monthly' },
  { name: 'Laura Salary', amount: 74_800, recurrence: 'monthly' },
  { name: 'Freelance', amount: 6_000, recurrence: 'monthly' },
]

describe('expectedMonthIncome', () => {
  // Regression: on 2026-07-25 the old max(actual, baseline) floor expected
  // $209,917 when $200,800 had posted and nothing further was scheduled,
  // projecting month-end savings ABOVE the net already banked.
  it('stops expecting income once every recurring row has posted', () => {
    const result = expectedMonthIncome({
      actualIncome: 200_800,
      recurringIncome: JULY_RECURRING,
      postedMerchants: ['Nexaminds Salary', 'Laura Salary', 'Freelance'],
      monthlyBaseline: 209_917,
    })

    expect(result.expected).toBe(200_800)
    expect(result.stillScheduled).toBe(0)
    expect(result.received).toBe(200_800)
  })

  it('still expects rows that have not posted yet', () => {
    const result = expectedMonthIncome({
      actualIncome: 120_000,
      recurringIncome: JULY_RECURRING,
      postedMerchants: ['Nexaminds Salary'],
      monthlyBaseline: 209_917,
    })

    expect(result.expected).toBe(200_800)
    expect(result.stillScheduled).toBe(80_800)
  })

  it('expects the full model at the start of the month', () => {
    const result = expectedMonthIncome({
      actualIncome: 0,
      recurringIncome: JULY_RECURRING,
      postedMerchants: [],
      monthlyBaseline: 209_917,
    })

    expect(result.expected).toBe(200_800)
    expect(result.stillScheduled).toBe(200_800)
  })

  it('matches merchant names case- and whitespace-insensitively', () => {
    const result = expectedMonthIncome({
      actualIncome: 120_000,
      recurringIncome: [{ name: 'Nexaminds Salary', amount: 120_000, recurrence: 'monthly' }],
      postedMerchants: ['  nexaminds salary  '],
      monthlyBaseline: 209_917,
    })

    expect(result.expected).toBe(120_000)
    expect(result.stillScheduled).toBe(0)
  })

  // The processor only posts `monthly` recurrence, so a bimonthly/annual row
  // is not "still coming this month" and must not inflate the forecast.
  it('ignores non-monthly recurrence rows', () => {
    const result = expectedMonthIncome({
      actualIncome: 200_800,
      recurringIncome: [...JULY_RECURRING, { name: 'Aguinaldo', amount: 37_400, recurrence: 'annual' }],
      postedMerchants: ['Nexaminds Salary', 'Laura Salary', 'Freelance'],
      monthlyBaseline: 209_917,
    })

    expect(result.expected).toBe(200_800)
  })

  // Extra income above the model (a windfall) must not be clawed back.
  it('keeps unplanned income on top of the schedule', () => {
    const result = expectedMonthIncome({
      actualIncome: 280_800,
      recurringIncome: JULY_RECURRING,
      postedMerchants: ['Nexaminds Salary', 'Laura Salary', 'Freelance', 'Unexpected income'],
      monthlyBaseline: 209_917,
    })

    expect(result.expected).toBe(280_800)
  })

  it('falls back to the baseline floor with no recurring-income model', () => {
    expect(expectedMonthIncome({
      actualIncome: 0,
      recurringIncome: [],
      postedMerchants: [],
      monthlyBaseline: 209_917,
    }).expected).toBe(209_917)

    expect(expectedMonthIncome({
      actualIncome: 220_000,
      recurringIncome: [],
      postedMerchants: [],
      monthlyBaseline: 209_917,
    }).expected).toBe(220_000)
  })
})

describe('household metrics', () => {
  it('uses median observed income when configured sources are incomplete', () => {
    const result = deriveIncomeBaseline(9_117, [
      { transaction_date: '2026-04-01', amount_mxn: 201_400 },
      { transaction_date: '2026-05-01', amount_mxn: 287_800 },
      { transaction_date: '2026-06-01', amount_mxn: 206_800 },
      { transaction_date: '2026-07-01', amount_mxn: 200_800 },
    ], '2026-07')

    expect(result.observedMonthly).toBe(206_800)
    expect(result.effectiveMonthly).toBe(206_800)
    expect(result.currentMonthActual).toBe(200_800)
  })

  it('keeps a higher configured baseline when observed income is lower', () => {
    const result = deriveIncomeBaseline(210_000, [
      { transaction_date: '2026-06-01', amount_mxn: 180_000 },
    ], '2026-07')

    expect(result.effectiveMonthly).toBe(210_000)
    expect(result.configuredMonthly).toBe(210_000)
  })

  it('measures emergency coverage against essentials instead of total recent spend', () => {
    expect(emergencyFundCoverage({ current: 390_000, target: 150_000, targetMonths: 6 })).toEqual({
      monthlyEssentials: 25_000,
      monthsCovered: 15.6,
      fundedPct: 260,
      gap: 0,
    })
  })

  it('shows the uncovered amount for monthly goals', () => {
    expect(commitmentCoverage(64_992, 103_295)).toEqual({ pct: 63, gap: 38_303, surplus: 0 })
  })
})
