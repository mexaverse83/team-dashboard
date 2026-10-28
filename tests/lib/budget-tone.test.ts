import { describe, expect, it } from 'vitest'
import { describeBudget, getBudgetTone, TONE_FILL_CLASS, TONE_TEXT_CLASS } from '@/lib/budget-tone'

describe('getBudgetTone', () => {
  it('red when actual spend is over budget', () => {
    expect(getBudgetTone({ actual: 3_390, budget: 1_000 })).toBe('negative') // "Other at 339%"
    expect(getBudgetTone({ actual: 1_001, budget: 1_000 })).toBe('negative')
  })

  it('amber at 85–100% usage', () => {
    expect(getBudgetTone({ actual: 850, budget: 1_000 })).toBe('warning')
    expect(getBudgetTone({ actual: 1_000, budget: 1_000 })).toBe('warning')
  })

  it('amber when only the projection exceeds the budget', () => {
    expect(getBudgetTone({ actual: 500, budget: 1_000, projected: 1_200 })).toBe('warning')
    expect(getBudgetTone({ actual: 500, budget: 1_000, projected: 950 })).toBe('positive')
  })

  it('green when comfortably under plan', () => {
    expect(getBudgetTone({ actual: 200, budget: 1_000 })).toBe('positive')
    expect(getBudgetTone({ actual: 0, budget: 1_000 })).toBe('positive')
  })

  it('a fixed category at exactly 100% is neutral "Paid" (Rent/Mortgage)', () => {
    expect(getBudgetTone({ actual: 45_000, budget: 45_000, isFixed: true })).toBe('neutral')
    expect(getBudgetTone({ actual: 45_100, budget: 45_000, isFixed: true })).toBe('neutral') // rounding tolerance
    expect(getBudgetTone({ actual: 46_000, budget: 45_000, isFixed: true })).toBe('negative')
    expect(getBudgetTone({ actual: 1_000, budget: 1_000, isFixed: false })).toBe('warning')
  })

  it('no budget → neutral', () => {
    expect(getBudgetTone({ actual: 500, budget: 0 })).toBe('neutral')
  })
})

describe('describeBudget', () => {
  it('labels every tone', () => {
    expect(describeBudget({ actual: 3_390, budget: 1_000 })).toEqual({ tone: 'negative', label: 'Over', pct: 339 })
    expect(describeBudget({ actual: 900, budget: 1_000 })).toEqual({ tone: 'warning', label: 'Watch', pct: 90 })
    expect(describeBudget({ actual: 45_000, budget: 45_000, isFixed: true })).toEqual({ tone: 'neutral', label: 'Paid', pct: 100 })
    expect(describeBudget({ actual: 100, budget: 1_000 })).toEqual({ tone: 'positive', label: 'On track', pct: 10 })
    expect(describeBudget({ actual: 100, budget: 0 })).toEqual({ tone: 'neutral', label: 'No budget', pct: 0 })
  })

  it('maps tones to token classes', () => {
    expect(TONE_TEXT_CLASS.negative).toBe('text-negative')
    expect(TONE_FILL_CLASS.warning).toBe('bg-warning')
  })
})
