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

/** Accept decimal keyboards and unambiguous grouped amounts; never truncate input. */
export function parseEntryAmount(value: string): number {
  const input = value.trim()
  let normalized = input
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(input)) normalized = input.replaceAll(',', '')
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(input)) normalized = input.replaceAll('.', '').replace(',', '.')
  else if (/^\d+,\d{1,2}$/.test(input)) normalized = input.replace(',', '.')
  if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(normalized)) return NaN
  const amount = Number(normalized)
  return Number.isFinite(amount) && Number.isSafeInteger(Math.round(amount * 100)) ? amount : NaN
}

/** Date-only database values represent a local calendar day, not UTC midnight. */
export function parseLocalDateKey(value: string): Date {
  return new Date(`${value}T12:00:00`)
}
