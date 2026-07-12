import { describe, expect, it } from 'vitest'
import { localDateKey, prioritizeCategories, recentMerchantSuggestions, relativeLocalDateKey } from '@/lib/transaction-entry'
import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'

const history = [
  { merchant: 'Walmart', category_id: 'groceries', type: 'expense', transaction_date: '2026-07-12' },
  { merchant: 'Uber', category_id: 'transport', type: 'expense', transaction_date: '2026-07-11' },
  { merchant: 'walmart', category_id: 'groceries', type: 'expense', transaction_date: '2026-07-10' },
  { merchant: 'Salary', category_id: 'salary', type: 'income', transaction_date: '2026-07-01' },
] as FinanceTransaction[]

const categories = [
  { id: 'other', name: 'Other', icon: '📦', color: '#fff', type: 'expense', sort_order: 1 },
  { id: 'transport', name: 'Transport', icon: '🚗', color: '#fff', type: 'expense', sort_order: 2 },
  { id: 'groceries', name: 'Groceries', icon: '🛒', color: '#fff', type: 'expense', sort_order: 3 },
  { id: 'salary', name: 'Salary', icon: '💰', color: '#fff', type: 'income', sort_order: 1 },
] as FinanceCategory[]

describe('transaction entry helpers', () => {
  it('formats local dates without UTC rollover', () => {
    const lateLocalTime = new Date(2026, 6, 12, 23, 45)
    expect(localDateKey(lateLocalTime)).toBe('2026-07-12')
    expect(relativeLocalDateKey(-1, lateLocalTime)).toBe('2026-07-11')
  })

  it('returns unique recent merchants with their latest category', () => {
    expect(recentMerchantSuggestions(history, 'expense')).toEqual([
      { merchant: 'Walmart', categoryId: 'groceries' },
      { merchant: 'Uber', categoryId: 'transport' },
    ])
  })

  it('puts frequently used categories first without removing unused choices', () => {
    expect(prioritizeCategories(categories, history, 'expense').map(category => category.id))
      .toEqual(['groceries', 'transport', 'other'])
  })
})
