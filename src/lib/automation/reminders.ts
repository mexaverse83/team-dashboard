// Deterministic reminders (OPP-01, OPP-03, OPP-04). Pure: the reminders route
// gathers the inputs, this module decides what is worth a nudge today. Every
// reminder carries a `key` that is unique per event and day, so the run
// ledger can make each one send at most once.
import { bbvaCycleToPay, summarizeCycle, type CycleTransaction } from '@/lib/payment-methods'
import { CONTROLLABLE } from '@/lib/controllable-categories'
import { addDaysKey, diffDaysKey } from '@/lib/dates'
import { formatCompact, formatMoney } from '@/lib/format'
import { OWNERS } from '@/lib/owners'

export type ReminderKind = 'card-due' | 'month-start' | 'price-change' | 'budget' | 'logging-gap' | 'digest' | 'checklist'

export interface Reminder {
  key: string
  kind: ReminderKind
  /** Canonical owner to target, or null for both phones. */
  owner: string | null
  title: string
  body: string
  url: string
}

export interface ReminderInput {
  /** Mexico City calendar day, YYYY-MM-DD. */
  today: string
  /** 0 = Sunday, Mexico City. */
  dayOfWeek: number
  cardTransactions?: CycleTransaction[]
  recurring?: Array<{ name: string; amount: number; next_due_date?: string | null; is_active?: boolean | null }>
  priceChanges?: Array<{ merchant?: string | null; description?: string | null; amount: number; transaction_date: string }>
  budgets?: Array<{ category: string; spent: number; budget: number; is_non_monthly?: boolean; is_fixed?: boolean }>
  /** created_at (ISO) of the newest transaction a person entered or imported (not auto-posted). */
  lastManualEntryAt?: string | null
  checklist?: Array<{ id: string; title: string; windowEnd: string }>
  checklistDone?: ReadonlySet<string>
  digest?: { weekTitle: string; weekDetail: string; householdTitle: string; topCategories?: Array<{ category: string; spent: number; budget: number }> } | null
}

export const BUDGET_THRESHOLDS = [100, 80] as const
export const LOGGING_GAP_DAYS = 4
export const CHECKLIST_LEAD_DAYS = [7, 1] as const

const money = (n: number) => formatMoney(n)

export function buildReminders(input: ReminderInput): Reminder[] {
  const { today } = input
  const tomorrow = addDaysKey(today, 1)
  const month = today.slice(0, 7)
  const out: Reminder[] = []

  // 1. BBVA Infinite statement due tomorrow / today, per owner.
  const cycle = bbvaCycleToPay(today)
  const dueIn = diffDaysKey(today, cycle.due)
  if ((dueIn === 0 || dueIn === 1) && input.cardTransactions?.length) {
    const summary = summarizeCycle(input.cardTransactions, cycle)
    for (const { owner, amount } of summary.byOwner) {
      if (amount <= 0 || !OWNERS.includes(owner)) continue
      out.push({
        key: `card-due:bbva_infinite:${owner}:${cycle.due}:${dueIn === 0 ? 'today' : 'tomorrow'}`,
        kind: 'card-due',
        owner,
        title: dueIn === 0 ? 'BBVA Infinite is due today' : 'BBVA Infinite is due tomorrow',
        body: `${owner}: pay ${money(amount)} by ${dueIn === 0 ? 'today' : 'tomorrow'} to avoid interest.`,
        url: '/finance/transactions',
      })
    }
  }

  // 2. Month-start bills, the evening before the 1st.
  if (tomorrow.endsWith('-01')) {
    const bills = (input.recurring || [])
      .filter(r => r.is_active !== false && r.next_due_date === tomorrow && Number(r.amount) > 0)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
    if (bills.length) {
      const total = bills.reduce((s, b) => s + Number(b.amount), 0)
      const named = bills.slice(0, 2).map(b => `${b.name} ${formatCompact(Number(b.amount))}`)
      const rest = bills.length - named.length
      out.push({
        key: `month-start:${tomorrow}`,
        kind: 'month-start',
        owner: null,
        title: `Tomorrow: ${money(total)} in bills`,
        body: `${named.join(' + ')}${rest > 0 ? ` + ${rest} more` : ''} post on the 1st.`,
        url: '/finance/subscriptions',
      })
    }
  }

  // 3. A subscription that just changed price.
  for (const tx of input.priceChanges || []) {
    if (diffDaysKey(tx.transaction_date, today) > 1) continue
    const name = tx.merchant || 'A subscription'
    const from = /from \$([\d.,]+)/.exec(tx.description || '')?.[1]
    out.push({
      key: `price:${name}:${tx.transaction_date}`,
      kind: 'price-change',
      owner: null,
      title: `${name} changed price`,
      body: from ? `Now ${money(tx.amount)} (was $${from}).` : `Charged ${money(tx.amount)} — different from last time.`,
      url: '/finance/subscriptions',
    })
  }

  // 4. Controllable categories crossing 80% / 100% of budget, once per category-month-threshold.
  for (const row of input.budgets || []) {
    if (row.is_non_monthly || row.is_fixed || !CONTROLLABLE.has(row.category) || !(row.budget > 0)) continue
    const pct = (row.spent / row.budget) * 100
    const threshold = BUDGET_THRESHOLDS.find(t => pct >= t)
    if (!threshold) continue
    out.push({
      key: `budget:${row.category}:${month}:${threshold}`,
      kind: 'budget',
      owner: null,
      title: threshold === 100 ? `${row.category} is over budget` : `${row.category} is at ${Math.round(pct)}% of budget`,
      body: threshold === 100
        ? `${money(row.spent)} of ${money(row.budget)} — ${money(row.spent - row.budget)} over.`
        : `${money(row.budget - row.spent)} left of ${money(row.budget)} this month.`,
      url: `/finance/budgets?month=${month}`,
    })
  }

  // 5. Nothing logged for a few days — probably time to import the statement.
  if (input.lastManualEntryAt) {
    const lastDay = new Date(input.lastManualEntryAt)
    if (!Number.isNaN(lastDay.getTime())) {
      const lastKey = input.lastManualEntryAt.slice(0, 10)
      const gap = diffDaysKey(lastKey, today)
      if (gap >= LOGGING_GAP_DAYS) {
        out.push({
          key: `logging-gap:${lastKey}`,
          kind: 'logging-gap',
          owner: null,
          title: `Nothing logged for ${gap} days`,
          body: 'Add recent expenses or import the BBVA statement so the plan stays real.',
          url: '/finance/transactions?add=1',
        })
      }
    }
  }

  // 6. Sunday digest.
  if (input.dayOfWeek === 0 && input.digest) {
    const top = (input.digest.topCategories || []).slice(0, 3)
      .map(c => `${c.category} ${Math.round((c.spent / Math.max(c.budget, 1)) * 100)}%`)
    out.push({
      key: `digest:${today}`,
      kind: 'digest',
      owner: null,
      title: input.digest.weekTitle,
      body: [input.digest.weekDetail, input.digest.householdTitle, top.length ? `Top: ${top.join(', ')}` : ''].filter(Boolean).join(' · '),
      url: '/finance',
    })
  }

  // 7. Checklist windows closing in 7 days and tomorrow (never retroactively).
  for (const item of input.checklist || []) {
    if (input.checklistDone?.has(item.id)) continue
    const daysLeft = diffDaysKey(today, item.windowEnd)
    const lead = CHECKLIST_LEAD_DAYS.find(d => d === daysLeft)
    if (!lead) continue
    out.push({
      key: `checklist:${item.id}:${item.windowEnd}:${lead}d`,
      kind: 'checklist',
      owner: null,
      title: lead === 1 ? `Last day tomorrow: ${item.title}` : `One week left: ${item.title}`,
      body: 'Mark it done in Mona once it’s handled.',
      url: '/finance',
    })
  }

  return out
}
