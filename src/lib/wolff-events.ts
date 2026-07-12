export interface TransactionSignalInput {
  amount: number
  isRecurring?: boolean
  merchant?: string | null
  categoryName?: string | null
  categoryMonthSpend?: number
  categoryBudget?: number
  recentCategoryAmounts?: number[]
  merchantSeenBefore?: boolean
}

export interface TransactionAssessment {
  unexpected: boolean
  severity: 'normal' | 'attention' | 'high'
  reasons: string[]
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

export function assessUnexpectedTransaction(input: TransactionSignalInput): TransactionAssessment {
  if (input.isRecurring || !Number.isFinite(input.amount) || input.amount <= 0) {
    return { unexpected: false, severity: 'normal', reasons: [] }
  }

  const reasons: string[] = []
  const typical = median((input.recentCategoryAmounts || []).filter(value => value > 0))
  const budget = Math.max(0, input.categoryBudget || 0)
  const monthSpend = Math.max(0, input.categoryMonthSpend || 0)

  if (input.amount >= 5_000) reasons.push('large one-time expense')
  if (typical > 0 && input.amount >= Math.max(1_500, typical * 2)) reasons.push('well above the usual category transaction')
  if (input.merchant && input.merchantSeenBefore === false && input.amount >= 1_500) reasons.push('new merchant with a meaningful amount')
  if (budget > 0 && monthSpend > budget) reasons.push('pushes the category over its monthly budget')
  if (budget === 0 && input.amount >= 1_500) reasons.push('meaningful expense without a category budget')

  const unexpected = reasons.length > 0
  const severity = !unexpected ? 'normal' : input.amount >= 5_000 || (budget > 0 && monthSpend > budget * 1.1) ? 'high' : 'attention'
  return { unexpected, severity, reasons }
}
