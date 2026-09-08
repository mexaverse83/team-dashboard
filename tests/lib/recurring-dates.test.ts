import { describe, expect, it } from 'vitest'
import { advanceRecurringDate } from '@/lib/recurring-dates'

describe('recurring calendar dates', () => {
  it('clamps month ends and preserves the original day during catch-up', () => {
    expect(advanceRecurringDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(advanceRecurringDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31')
    expect(advanceRecurringDate('2024-01-31', 'monthly')).toBe('2024-02-29')
  })
  it('handles quarter, year and weekly boundaries', () => {
    expect(advanceRecurringDate('2026-11-30', 'quarterly')).toBe('2027-02-28')
    expect(advanceRecurringDate('2024-02-29', 'yearly')).toBe('2025-02-28')
    expect(advanceRecurringDate('2026-12-28', 'weekly')).toBe('2027-01-04')
    expect(advanceRecurringDate('2026-12-28', 'biweekly')).toBe('2027-01-11')
  })
  it('rejects dates and frequencies that cannot advance safely', () => {
    expect(() => advanceRecurringDate('2026-02-31', 'monthly')).toThrow()
    expect(() => advanceRecurringDate('2026-01-01', 'unknown')).toThrow('Unsupported')
  })
})
