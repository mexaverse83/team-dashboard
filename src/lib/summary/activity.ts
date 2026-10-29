import { CONTROLLABLE } from '@/lib/controllable-categories'
import { getBudgetTone } from '@/lib/budget-tone'
import { addDaysKey } from '@/lib/dates'
import { formatWeekdayShort } from '@/lib/format'
import { OWNERS, ownersEqual, canonicalOwner } from '@/lib/owners'
import { txAmount, type TxRow } from '@/lib/summary/history'
import type { BudgetVsActualRow, SummaryRecentTransaction, SummaryVariable } from '@/lib/summary/types'
import type { CategoryRow } from '@/lib/summary/budgets'

/** "Sat Oct 31" — the contract label (no comma). */
export function throughLabel(dateKey: string): string {
  return formatWeekdayShort(dateKey).replace(',', '')
}

/**
 * Everyday (controllable, monthly) budgets as ONE signed number. Summing
 * max(0, budget − spent) per category hid $5.5k of overspend behind "$6.7k
 * left". `days_left` counts today; the week window runs through Sunday or
 * month end, whichever comes first, and `through_label` names its real last day.
 */
export function buildVariable(budgetVsActual: BudgetVsActualRow[], { today, dayOfWeek, daysInMonth, dayOfMonth }: {
  today: string
  dayOfWeek: number
  daysInMonth: number
  dayOfMonth: number
}): SummaryVariable & { week_days_left: number; week_left: number; categories: number } {
  const rows = budgetVsActual.filter(b => CONTROLLABLE.has(b.category) && !b.is_non_monthly)
  const budget = rows.reduce((s, b) => s + (b.budget || 0), 0)
  const spent = rows.reduce((s, b) => s + (b.spent || 0), 0)
  const left = Math.round(budget - spent)
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1)
  const weekDays = Math.min(daysLeft, dayOfWeek === 0 ? 1 : 8 - dayOfWeek)
  const tone = getBudgetTone({ actual: spent, budget })
  return {
    budget: Math.round(budget),
    spent: Math.round(spent),
    left,
    days_left: daysLeft,
    through_label: throughLabel(addDaysKey(today, weekDays - 1)),
    through_date: addDaysKey(today, weekDays - 1),
    status: left < 0 || tone === 'negative' ? 'over' : tone === 'warning' ? 'tight' : 'ok',
    week_days_left: weekDays,
    week_left: left > 0 ? Math.round((left / daysLeft) * weekDays) : left,
    categories: rows.length,
  }
}

/** Spend per owner through today (Mexico City), case-insensitive on owner. */
export function buildOwnerSpend(currentMonthTxs: TxRow[], today: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const owner of OWNERS) {
    out[owner] = Math.round(currentMonthTxs
      .filter(t => (t.type ?? 'expense') === 'expense' && t.transaction_date <= today && ownersEqual(t.owner, owner))
      .reduce((s, t) => s + txAmount(t), 0))
  }
  return out
}

/** The newest rows dated today or earlier, both directions of money. */
export function buildRecentTransactions(rows: TxRow[], catMap: Map<string, CategoryRow>, today: string, limit = 5): Array<SummaryRecentTransaction & { type: string }> {
  return rows
    .filter(t => t.transaction_date <= today && (t.type === 'expense' || t.type === 'income'))
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, limit)
    .map(t => {
      const cat = t.category_id ? catMap.get(t.category_id) : undefined
      return {
        id: String(t.id ?? ''),
        date: t.transaction_date,
        merchant: t.merchant || cat?.name || 'Transaction',
        amount: Math.round(txAmount(t) * 100) / 100,
        owner: canonicalOwner(t.owner),
        category_name: cat?.name ?? null,
        category_icon: cat?.icon ?? null,
        type: t.type as string,
      }
    })
}
