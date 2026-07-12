import { describe, expect, it } from 'vitest'
import { assessUnexpectedTransaction } from '@/lib/wolff-events'

describe('Wolff transaction monitoring', () => {
  it('ignores routine recurring expenses', () => {
    expect(assessUnexpectedTransaction({ amount: 8_000, isRecurring: true }).unexpected).toBe(false)
  })

  it('flags a large one-time expense', () => {
    const result = assessUnexpectedTransaction({ amount: 5_500, recentCategoryAmounts: [600, 900, 1_100] })
    expect(result.unexpected).toBe(true)
    expect(result.severity).toBe('high')
    expect(result.reasons).toContain('large one-time expense')
  })

  it('flags a new meaningful merchant and unusual category amount', () => {
    const result = assessUnexpectedTransaction({
      amount: 2_400,
      merchant: 'New Place',
      merchantSeenBefore: false,
      recentCategoryAmounts: [500, 700, 900],
    })
    expect(result.unexpected).toBe(true)
    expect(result.reasons).toContain('new merchant with a meaningful amount')
    expect(result.reasons).toContain('well above the usual category transaction')
  })

  it('flags a transaction that pushes its category over budget', () => {
    const result = assessUnexpectedTransaction({ amount: 900, categoryBudget: 5_000, categoryMonthSpend: 5_200 })
    expect(result.unexpected).toBe(true)
    expect(result.reasons).toContain('pushes the category over its monthly budget')
  })

  it('leaves a normal planned purchase alone', () => {
    const result = assessUnexpectedTransaction({
      amount: 700,
      merchant: 'Regular Store',
      merchantSeenBefore: true,
      categoryBudget: 10_000,
      categoryMonthSpend: 3_000,
      recentCategoryAmounts: [500, 650, 800],
    })
    expect(result).toEqual({ unexpected: false, severity: 'normal', reasons: [] })
  })
})
