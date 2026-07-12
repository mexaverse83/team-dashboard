import { describe, expect, it } from 'vitest'
import { commitmentCoverage, deriveIncomeBaseline, emergencyFundCoverage } from '@/lib/household-metrics'

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
