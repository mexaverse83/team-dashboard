import { localDateKey, parseLocalDateKey } from '@/lib/dates'
import { formatWeekdayShort } from '@/lib/format'

export interface DayGroup<T> {
  /** 'YYYY-MM-DD' */
  date: string
  /** 'Today' · 'Yesterday' · 'Wed, Oct 22' (local calendar, never UTC). */
  label: string
  /** 'Oct 28' next to Today/Yesterday, '' otherwise. */
  sublabel: string
  spent: number
  received: number
  items: T[]
}

type Groupable = { transaction_date: string; type: 'expense' | 'income'; amount_mxn: number }

export function dayLabel(dateKey: string, now: Date = new Date()): { label: string; sublabel: string } {
  const today = localDateKey(now)
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  const yesterday = localDateKey(y)
  const d = parseLocalDateKey(dateKey)
  const short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
  if (dateKey === today) return { label: 'Today', sublabel: short }
  if (dateKey === yesterday) return { label: 'Yesterday', sublabel: short }
  if (d.getFullYear() !== now.getFullYear()) return { label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), sublabel: '' }
  return { label: formatWeekdayShort(dateKey), sublabel: '' }
}

/** Rows must already be sorted newest first; groups keep that order. */
export function groupByDay<T extends Groupable>(rows: T[], now: Date = new Date()): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  let current: DayGroup<T> | null = null
  for (const row of rows) {
    const date = row.transaction_date.slice(0, 10)
    if (!current || current.date !== date) {
      current = { date, ...dayLabel(date, now), spent: 0, received: 0, items: [] }
      groups.push(current)
    }
    current.items.push(row)
    if (row.type === 'expense') current.spent += row.amount_mxn
    else current.received += row.amount_mxn
  }
  return groups
}
