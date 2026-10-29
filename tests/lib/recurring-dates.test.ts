import { describe, expect, it } from 'vitest'
import { advanceRecurringDate, dueDateInMonth, msiPendingPeriods, pickCurrentRecurringIncome, shouldPostIncomeSource } from '@/lib/recurring-dates'

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

describe('processor schedules', () => {
  it('clamps a due day to the month', () => {
    expect(dueDateInMonth('2026-02', 31)).toBe('2026-02-28')
    expect(dueDateInMonth('2026-11', 1)).toBe('2026-11-01')
  })
  it('lists missed MSI payments across a year boundary, capped at the plan length', () => {
    expect(msiPendingPeriods({ start_date: '2026-11-30', installment_count: 3, payments_made: 0 }, '2027-02-10')).toEqual([
      { number: 1, month: '2026-11', date: '2026-11-30' },
      { number: 2, month: '2026-12', date: '2026-12-30' },
      { number: 3, month: '2027-01', date: '2027-01-30' },
    ])
    expect(msiPendingPeriods({ start_date: '2026-10-05', installment_count: 6, payments_made: 4 }, '2026-10-28')).toEqual([])
  })
  it('anchors yearly and quarterly income on pay_month', () => {
    expect(shouldPostIncomeSource('yearly', 12, 12)).toBe(true)
    expect(shouldPostIncomeSource('yearly', 1, 12)).toBe(false)
    expect(shouldPostIncomeSource('yearly', 1, null)).toBe(true)
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => shouldPostIncomeSource('quarterly', m, 2))).toEqual([2, 5, 8, 11])
    expect(shouldPostIncomeSource('monthly', 7, null)).toBe(true)
  })
  it('keeps the latest started row per income name and drops ended rows', () => {
    const rows = [
      { id: 'a', name: 'Freelance', start_date: null },
      { id: 'b', name: 'freelance ', start_date: '2026-09-01' },
      { id: 'c', name: 'Freelance', start_date: '2026-12-01' },
      { id: 'd', name: 'Medika', start_date: null, end_date: '2026-08-31' },
      { id: 'e', name: 'Salary', start_date: null, active: false },
    ]
    expect(pickCurrentRecurringIncome(rows, '2026-10-28').map(r => r.id)).toEqual(['b'])
  })
})
