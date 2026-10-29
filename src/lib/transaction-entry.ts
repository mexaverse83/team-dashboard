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

// ── Quick-add helpers (MOB-15, UX-16, MOB-03, UX-06) ─────────────────────────

type RankableHistoryItem = Pick<FinanceTransaction, 'merchant' | 'category_id' | 'type' | 'transaction_date' | 'amount_mxn'>

export interface RankedMerchantSuggestion extends MerchantSuggestion {
  /** Median amount over the window, rounded to the peso; null if unknown. */
  typicalAmount: number | null
  /** Entries in the window. */
  count: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function daysBetweenKeys(from: string, to: string): number {
  const a = parseLocalDateKey(from.slice(0, 10)).getTime()
  const b = parseLocalDateKey(to.slice(0, 10)).getTime()
  return Math.round((b - a) / 86_400_000)
}

/**
 * Frequent merchants first: score = uses in the last `windowDays` × a
 * recency boost (1 → 2 as the last use approaches today). Each suggestion
 * carries the merchant's most common category and typical amount. Slots the
 * window doesn't fill fall back to the most recent merchants.
 */
export function rankMerchantSuggestions(
  transactions: RankableHistoryItem[],
  type: FinanceTransaction['type'],
  { now = new Date(), windowDays = 60, limit = 6 }: { now?: Date; windowDays?: number; limit?: number } = {},
): RankedMerchantSuggestion[] {
  const today = localDateKey(now)
  const stats = new Map<string, { merchant: string; latest: string; amounts: number[]; categories: Map<string, number>; latestCategory: string }>()
  for (const tx of transactions) {
    const merchant = tx.merchant?.trim()
    if (tx.type !== type || !merchant) continue
    const age = daysBetweenKeys(tx.transaction_date, today)
    if (age < 0 || age > windowDays) continue
    const key = merchant.toLocaleLowerCase()
    let entry = stats.get(key)
    if (!entry) {
      entry = { merchant, latest: tx.transaction_date, amounts: [], categories: new Map(), latestCategory: tx.category_id }
      stats.set(key, entry)
    }
    if (tx.transaction_date > entry.latest) { entry.latest = tx.transaction_date; entry.merchant = merchant; entry.latestCategory = tx.category_id }
    if (Number.isFinite(tx.amount_mxn)) entry.amounts.push(tx.amount_mxn)
    if (tx.category_id) entry.categories.set(tx.category_id, (entry.categories.get(tx.category_id) || 0) + 1)
  }

  const ranked = Array.from(stats.values())
    .map(entry => {
      const recency = Math.max(0, 1 - daysBetweenKeys(entry.latest, today) / windowDays)
      const topCategory = Array.from(entry.categories.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? entry.latestCategory
      return {
        merchant: entry.merchant,
        categoryId: topCategory,
        typicalAmount: entry.amounts.length ? Math.round(median(entry.amounts)) : null,
        count: entry.amounts.length,
        score: entry.amounts.length * (1 + recency),
        latest: entry.latest,
      }
    })
    .sort((a, b) => b.score - a.score || b.latest.localeCompare(a.latest))
    .slice(0, limit)
    .map(({ merchant, categoryId, typicalAmount, count }) => ({ merchant, categoryId, typicalAmount, count }))

  if (ranked.length < limit) {
    const seen = new Set(ranked.map(r => r.merchant.toLocaleLowerCase()))
    for (const recent of recentMerchantSuggestions(transactions, type, limit * 2)) {
      if (ranked.length >= limit) break
      if (seen.has(recent.merchant.toLocaleLowerCase())) continue
      seen.add(recent.merchant.toLocaleLowerCase())
      ranked.push({ ...recent, typicalAmount: null, count: 0 })
    }
  }
  return ranked
}

/** Prenatal / baby purchases that should feed the Baby envelope (UX-04, MOB-03). */
export const BABY_SUGGEST_PATTERN = /beb[eé]|\bbaby\b|prenatal|pa[ñn]al|carriola|\bgine\b|ginec|obstetr|ultrasonido|pediatr|maternidad/i

export function suggestsBabyTag(...texts: Array<string | null | undefined>): boolean {
  return texts.some(text => !!text && BABY_SUGGEST_PATTERN.test(text))
}

/**
 * Median of the category's monthly spend over the last `months` full months
 * (months with no spend are skipped, so a rarely used category isn't 0).
 */
export function categoryMonthlyMedian(
  transactions: Array<Pick<FinanceTransaction, 'category_id' | 'type' | 'transaction_date' | 'amount_mxn'>>,
  categoryId: string,
  { now = new Date(), months = 6 }: { now?: Date; months?: number } = {},
): number {
  if (!categoryId) return 0
  const current = localDateKey(now).slice(0, 7)
  const totals = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' || tx.category_id !== categoryId) continue
    const month = tx.transaction_date.slice(0, 7)
    if (month >= current) continue
    totals.set(month, (totals.get(month) || 0) + tx.amount_mxn)
  }
  const recent = Array.from(totals.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, months).map(([, total]) => total)
  return median(recent.filter(total => total > 0))
}

export const ONE_OFF_MULTIPLIER = 3

/** True when an amount is more than 3× the category's usual month (UX-06 #2). */
export function looksLikeOneOff(amount: number, monthlyMedian: number): boolean {
  return monthlyMedian > 0 && Number.isFinite(amount) && amount > monthlyMedian * ONE_OFF_MULTIPLIER
}

/** Coverage window that spreads a charge over `months` months starting with its own month. */
export function spreadCoverage(dateKey: string, months = 12): { start: string; end: string } {
  const [y, m] = dateKey.split('-').map(Number)
  const end = new Date(y, m - 1 + months, 0)
  return { start: `${dateKey.slice(0, 7)}-01`, end: localDateKey(end) }
}

const LAST_METHOD_KEY = 'mona:last-method:'

/** Last payment method used by an owner on this device (MOB-15). */
export function readLastPaymentMethod(owner: string | null | undefined): string {
  if (!owner) return ''
  try {
    return window.localStorage.getItem(LAST_METHOD_KEY + owner.toLowerCase()) || ''
  } catch {
    return ''
  }
}

export function writeLastPaymentMethod(owner: string | null | undefined, method: string | null | undefined): void {
  if (!owner || !method) return
  try {
    window.localStorage.setItem(LAST_METHOD_KEY + owner.toLowerCase(), method)
  } catch {
    // Private mode / blocked storage: remembering is a convenience only.
  }
}
