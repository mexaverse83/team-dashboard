import { describe, expect, it } from 'vitest'
import {
  parseLocalDateKey, parseEntryAmount, localDateKey, prioritizeCategories, recentMerchantSuggestions, relativeLocalDateKey,
  rankMerchantSuggestions, suggestsBabyTag, categoryMonthlyMedian, looksLikeOneOff, spreadCoverage,
} from '@/lib/transaction-entry'
import { groupByDay, dayLabel, dayTotals } from '@/components/finance/transactions/day-groups'
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
  it('keeps a first-of-month goal deadline in its local calendar month', () => {
    expect(parseLocalDateKey('2027-09-01').getMonth()).toBe(8)
    expect(parseLocalDateKey('2027-09-01').getDate()).toBe(1)
  })

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

describe('phone amount entry', () => {
  it.each([['12,50', 12.5], ['1,250.50', 1250.5], ['1.250,50', 1250.5], ['1250', 1250], ['.50', 0.5]])('parses %s without losing cents', (input, expected) => {
    expect(parseEntryAmount(input)).toBe(expected)
  })
  it.each(['12oops', '1,2,3', '', 'Infinity', '1e5', '-4', '12.3456'])('rejects malformed %s', input => {
    expect(Number.isNaN(parseEntryAmount(input))).toBe(true)
  })
})

describe('quick-add helpers', () => {
  const now = new Date(2026, 9, 28, 21, 30)
  const row = (merchant: string, date: string, amount: number, category = 'groceries') =>
    ({ merchant, category_id: category, type: 'expense', transaction_date: date, amount_mxn: amount }) as FinanceTransaction

  it('ranks merchants by frequency × recency over 60 days with typical amounts', () => {
    const tx = [
      row('Monita', '2026-10-27', 120, 'dining'),
      row('Heb', '2026-10-20', 1300), row('Heb', '2026-10-10', 1250), row('HEB', '2026-09-30', 1400), row('Heb', '2026-09-15', 1100),
      row('Gasolina', '2026-10-25', 900, 'transport'), row('Gasolina', '2026-10-05', 950, 'transport'),
      row('Old favourite', '2026-06-01', 500),
    ]
    const ranked = rankMerchantSuggestions(tx, 'expense', { now, limit: 4 })
    expect(ranked.map(r => r.merchant)).toEqual(['Heb', 'Gasolina', 'Monita', 'Old favourite'])
    expect(ranked[0]).toMatchObject({ categoryId: 'groceries', typicalAmount: 1275, count: 4 })
    expect(ranked[3]).toMatchObject({ typicalAmount: null, count: 0 })
  })

  it('suggests the Baby tag for prenatal merchants and notes only', () => {
    expect(suggestsBabyTag('Cita gine')).toBe(true)
    expect(suggestsBabyTag('Eco bebe')).toBe(true)
    expect(suggestsBabyTag('Farmacia', 'vitaminas prenatales')).toBe(true)
    expect(suggestsBabyTag('Pañales Costco')).toBe(true)
    expect(suggestsBabyTag('Gasolina', 'engine oil')).toBe(false)
    expect(suggestsBabyTag('Heb', null)).toBe(false)
  })

  it('flags an amount over 3× the category monthly median as a one-off', () => {
    const tx = [row('Gym', '2026-07-03', 800, 'other'), row('Misc', '2026-08-03', 1200, 'other'), row('Misc', '2026-09-03', 1000, 'other'), row('Now', '2026-10-03', 9000, 'other')]
    const median = categoryMonthlyMedian(tx, 'other', { now })
    expect(median).toBe(1000)
    expect(looksLikeOneOff(11100, median)).toBe(true)
    expect(looksLikeOneOff(2500, median)).toBe(false)
    expect(looksLikeOneOff(11100, 0)).toBe(false)
  })

  it('spreads a charge over 12 months starting with its own month', () => {
    expect(spreadCoverage('2026-10-28')).toEqual({ start: '2026-10-01', end: '2027-09-30' })
    expect(spreadCoverage('2026-01-31', 2)).toEqual({ start: '2026-01-01', end: '2026-02-28' })
  })
})

describe('day groups', () => {
  // 21:30 in Mexico City is already the next day in UTC; headers must stay local.
  const now = new Date(2026, 9, 28, 21, 30)

  it("labels '2026-10-28' as Today on the local calendar", () => {
    expect(dayLabel('2026-10-28', now)).toEqual({ label: 'Today', sublabel: 'Oct 28' })
    expect(dayLabel('2026-10-27', now)).toEqual({ label: 'Yesterday', sublabel: 'Oct 27' })
    expect(dayLabel('2026-10-22', now)).toEqual({ label: 'Thu, Oct 22', sublabel: '' })
    expect(dayLabel('2025-12-31', now).label).toBe('Wed, Dec 31, 2025')
  })

  it('groups consecutive rows by day with spent and received totals', () => {
    const rows = [
      { transaction_date: '2026-10-28', type: 'expense' as const, amount_mxn: 120 },
      { transaction_date: '2026-10-28', type: 'income' as const, amount_mxn: 500 },
      { transaction_date: '2026-10-28', type: 'expense' as const, amount_mxn: 80 },
      { transaction_date: '2026-10-27', type: 'expense' as const, amount_mxn: 40 },
    ]
    const groups = groupByDay(rows, now)
    expect(groups.map(g => [g.label, g.spent, g.received, g.items.length])).toEqual([['Today', 200, 500, 3], ['Yesterday', 40, 0, 1]])
  })
})

describe('dayTotals', () => {
  it('totals every row of a day, not just the visible chunk', () => {
    const rows = [
      { transaction_date: '2026-10-28', type: 'expense' as const, amount_mxn: 100 },
      { transaction_date: '2026-10-28', type: 'income' as const, amount_mxn: 50 },
      { transaction_date: '2026-10-28', type: 'expense' as const, amount_mxn: 25 },
      { transaction_date: '2026-10-27', type: 'expense' as const, amount_mxn: 10 },
    ]
    const totals = dayTotals(rows)
    expect(totals.get('2026-10-28')).toEqual({ spent: 125, received: 50 })
    // The first chunk only holds one row of the 28th, but the header uses the full-day total.
    expect(groupByDay(rows.slice(0, 1))[0].spent).toBe(100)
    expect(totals.get('2026-10-27')).toEqual({ spent: 10, received: 0 })
  })
})
