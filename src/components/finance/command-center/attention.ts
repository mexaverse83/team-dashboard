import { getBudgetTone, type Tone } from '@/lib/budget-tone'
import { addDaysKey, diffDaysKey, parseLocalDateKey } from '@/lib/dates'
import { formatCompact, formatDateShort, formatMoney } from '@/lib/format'
import { bbvaCycleToPay } from '@/lib/payment-methods'

// "Needs attention": at most three deterministic, actionable rows. This is the
// home page's only alert surface (UX-15) — it replaces the status line, the
// "N budget alert" chip and Budget watch's warnings.
export interface AttentionItem {
  id: string
  tone: Tone
  title: string
  /** Amount inside `title` that privacy mode must blur; rendered as its own span. */
  titleMoney?: string
  detail?: string
  href: string
  cta: string
  /** Budget category this row is about, so other home cards can skip it (UX-15). */
  category?: string
}

/** The summary subset the rows read; v2 fields are optional. */
export interface AttentionSummary {
  current_month?: {
    month?: string
    budget_vs_actual: Array<{ category: string; spent: number; budget: number; projected_month_total: number; is_non_monthly: boolean; is_fixed?: boolean; category_id?: string; status?: string }>
  } | null
  baby_plan?: {
    checklist?: Array<{ id: string; title: string; window_end: string }>
    untagged_candidates?: number
  } | null
  goal_funding?: { overdue_goals?: Array<{ name: string }> } | null
}

export const MAX_ATTENTION_ITEMS = 3
const CARD_DUE_WINDOW_DAYS = 5
const CHECKLIST_WINDOW_DAYS = 14

export function buildAttentionItems(summary: AttentionSummary, todayKey: string): AttentionItem[] {
  const items: AttentionItem[] = []
  const month = summary.current_month?.month || todayKey.slice(0, 7)

  // 1. Monthly, non-fixed budgets already past their limit.
  const rows = summary.current_month?.budget_vs_actual || []
  const over = rows
    .filter(b => !b.is_non_monthly && !b.is_fixed && b.budget > 0
      && getBudgetTone({ actual: b.spent, budget: b.budget, projected: b.projected_month_total }) === 'negative')
    .sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget))
  if (over[0]) {
    const top = over[0]
    // "N more" counts every over-budget row Budgets and the Brief list
    // (bimonthly/fixed bills too), not just the everyday ones that can lead.
    const more = rows.filter(b => b !== top && (over.includes(b) || b.status === 'over')).length
    const overBy = formatCompact(top.spent - top.budget)
    items.push({
      id: `over-${top.category}`,
      category: top.category,
      tone: 'negative',
      title: `${top.category} is ${overBy} over budget`,
      titleMoney: overBy,
      detail: `${formatMoney(top.spent)} of ${formatMoney(top.budget)}${more > 0 ? ` · ${more} more categor${more === 1 ? 'y' : 'ies'} over` : ''}`,
      href: top.category_id ? `/finance/transactions?category=${top.category_id}&month=${month}` : `/finance/budgets?month=${month}`,
      cta: 'Review',
    })
  }

  // 2. Card statement due soon (BBVA Infinite: corte 9, pago 29).
  const cycle = bbvaCycleToPay(todayKey)
  const daysToDue = diffDaysKey(todayKey, cycle.due)
  if (todayKey > cycle.cut && daysToDue >= 0 && daysToDue <= CARD_DUE_WINDOW_DAYS) {
    items.push({
      id: 'card-bbva',
      tone: 'warning',
      title: `BBVA Infinite: pay by ${formatDateShort(parseLocalDateKey(cycle.due))}`,
      detail: daysToDue === 0 ? 'Due today' : daysToDue === 1 ? 'Due tomorrow' : `Due in ${daysToDue} days`,
      href: '/finance/transactions',
      cta: 'Statement',
    })
  }

  // 3. A baby checklist item whose window closes soon.
  const horizon = addDaysKey(todayKey, CHECKLIST_WINDOW_DAYS)
  const closing = (summary.baby_plan?.checklist || [])
    .filter(item => item.window_end >= todayKey && item.window_end <= horizon)
    .sort((a, b) => a.window_end.localeCompare(b.window_end))[0]
  if (closing) {
    items.push({
      id: `checklist-${closing.id}`,
      tone: 'warning',
      title: closing.title,
      detail: `Window closes ${formatDateShort(parseLocalDateKey(closing.window_end))}`,
      href: '/finance/family',
      cta: 'Open',
    })
  }

  // 4. Prenatal spend missing the baby tag (count from the summary).
  const untagged = Number(summary.baby_plan?.untagged_candidates) || 0
  if (untagged > 0) {
    items.push({
      id: 'baby-untagged',
      tone: 'neutral',
      title: `${untagged} likely baby expense${untagged === 1 ? '' : 's'} not tagged`,
      detail: 'Tag them so the baby envelope stays accurate',
      href: '/finance/family#baby-review',
      cta: 'Tag',
    })
  }

  // 5. Goals past their target date.
  const overdue = summary.goal_funding?.overdue_goals || []
  if (overdue.length > 0) {
    items.push({
      id: 'goals-overdue',
      tone: 'warning',
      title: `${overdue.length === 1 ? overdue[0].name : `${overdue.length} goals`} past the target date`,
      detail: 'Set a new date or close the goal',
      href: '/finance/goals',
      cta: 'Update',
    })
  }

  return items.slice(0, MAX_ATTENTION_ITEMS)
}
