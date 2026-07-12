import type { FinanceCategory, FinanceTransaction } from './finance-types'

type TransactionHistoryItem = Pick<FinanceTransaction, 'merchant' | 'category_id' | 'type' | 'transaction_date'>

export interface MerchantSuggestion {
  merchant: string
  categoryId: string
}

/** YYYY-MM-DD in the device's local timezone (never shifted through UTC). */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function relativeLocalDateKey(days: number, date: Date = new Date()): string {
  const shifted = new Date(date)
  shifted.setDate(shifted.getDate() + days)
  return localDateKey(shifted)
}

/** Most recently used merchants, with the category from their latest entry. */
export function recentMerchantSuggestions(
  transactions: TransactionHistoryItem[],
  type: FinanceTransaction['type'],
  limit = 5,
): MerchantSuggestion[] {
  const seen = new Set<string>()
  const suggestions: MerchantSuggestion[] = []

  for (const transaction of transactions) {
    const merchant = transaction.merchant?.trim()
    const key = merchant?.toLocaleLowerCase()
    if (transaction.type !== type || !merchant || !key || seen.has(key)) continue
    seen.add(key)
    suggestions.push({ merchant, categoryId: transaction.category_id })
    if (suggestions.length === limit) break
  }

  return suggestions
}

/** Keep the full category list, but put frequently used choices first. */
export function prioritizeCategories(
  categories: FinanceCategory[],
  transactions: TransactionHistoryItem[],
  type: FinanceTransaction['type'],
): FinanceCategory[] {
  const usage = new Map<string, number>()
  transactions.slice(0, 150).forEach(transaction => {
    if (transaction.type === type) {
      usage.set(transaction.category_id, (usage.get(transaction.category_id) || 0) + 1)
    }
  })

  return categories
    .filter(category => category.type === type || category.type === 'both')
    .sort((a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0) || a.sort_order - b.sort_order)
}
