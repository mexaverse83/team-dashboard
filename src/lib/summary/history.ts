// Row shapes and month-level history shared by the summary builders and the
// WEST engine. Pure: callers fetch, these only fold rows.
import { median } from '@/lib/household-metrics'
import { lumpThreshold } from '@/lib/spend-projection'

export interface TxRow {
  id?: string
  transaction_date: string
  type?: string | null
  amount_mxn?: number | null
  amount?: number | null
  category_id?: string | null
  merchant?: string | null
  tags?: string[] | null
  owner?: string | null
  coverage_start?: string | null
  coverage_end?: string | null
  created_at?: string | null
}

export const WINDFALL_TAG = 'windfall'

export function txAmount(t: { amount_mxn?: number | null; amount?: number | null }): number {
  return Number(t.amount_mxn || t.amount || 0)
}

export function hasTag(t: { tags?: string[] | null }, ...tags: string[]): boolean {
  return Array.isArray(t.tags) && t.tags.some(tag => tags.includes(tag))
}

/** The developer's monthly WEST payment posts as an expense with merchant 'WEST'. */
export function isWestPayment(t: { merchant?: string | null }): boolean {
  return (t.merchant || '').trim().toLowerCase() === 'west'
}

export interface MonthNet {
  month: string
  income: number
  expenses: number
  net: number
  /** Windfall-tagged income left out of `income`. */
  windfall_excluded: number
  /** One-off expense lumps left out of `expenses`. */
  lumps_excluded: number
}

/**
 * Complete-month income, spend and net, cleaned of what doesn't repeat:
 * windfall-tagged income (May's $80k insurance refund) and one-off expense
 * lumps (a single charge ≥ half a typical month, e.g. a $92k clinic payment).
 * Months with no income predate tracking and are dropped.
 */
export function monthlyNetHistory(
  rows: TxRow[],
  { beforeMonth, fromMonth = '0000-00' }: { beforeMonth: string; fromMonth?: string },
): MonthNet[] {
  const byMonth = new Map<string, { income: number; windfall: number; expenses: number[] }>()
  for (const t of rows) {
    const month = (t.transaction_date || '').slice(0, 7)
    if (!month || month >= beforeMonth || month < fromMonth) continue
    const bucket = byMonth.get(month) ?? { income: 0, windfall: 0, expenses: [] }
    if (t.type === 'income') {
      if (hasTag(t, WINDFALL_TAG)) bucket.windfall += txAmount(t)
      else bucket.income += txAmount(t)
    } else if (t.type === 'expense') {
      bucket.expenses.push(txAmount(t))
    }
    byMonth.set(month, bucket)
  }
  const months = [...byMonth.entries()].filter(([, v]) => v.income > 0).sort(([a], [b]) => a.localeCompare(b))
  const typical = median(months.map(([, v]) => v.expenses.reduce((s, x) => s + x, 0)))
  const threshold = lumpThreshold(typical)
  return months.map(([month, v]) => {
    const total = v.expenses.reduce((s, x) => s + x, 0)
    const lumps = typical > 0 ? v.expenses.filter(x => x >= threshold).reduce((s, x) => s + x, 0) : 0
    const expenses = total - lumps
    return {
      month,
      income: Math.round(v.income),
      expenses: Math.round(expenses),
      net: Math.round(v.income - expenses),
      windfall_excluded: Math.round(v.windfall),
      lumps_excluded: Math.round(lumps),
    }
  })
}

/** Median net of the most recent `n` complete months — the household's run rate. */
export function recentNetRunRate(history: MonthNet[], n = 3): number {
  return Math.round(median(history.slice(-n).map(m => m.net)))
}
