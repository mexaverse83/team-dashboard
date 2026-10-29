import { addDaysKey, addMonthsKey, daysInMonth } from '@/lib/dates'
import { advanceRecurringDate } from '@/lib/recurring-dates'
import type { PlanEvent, SummaryUpcomingItem } from '@/lib/summary/types'

export const UPCOMING_WINDOW_DAYS = 14

export interface UpcomingInputs {
  today: string
  recurring: Array<{ name: string; amount: number; frequency: string; next_due_date?: string | null }>
  installments: Array<{ name: string; installment_amount: number; installment_count: number; payments_made?: number | null; start_date?: string | null }>
  recurringIncome: Array<{ name: string; amount: number; recurrence?: string | null; day_of_month?: number | null; start_date?: string | null }>
  postedIncomeMerchants: string[]
  babyEvents: PlanEvent[]
  westLump?: { date: string; amount: number } | null
  windowDays?: number
}

function dayInMonth(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(Math.min(Math.max(1, day), daysInMonth(y, m))).padStart(2, '0')}`
}

/**
 * Next installment of an MSI plan: start date + payments already made, not
 * its end date (a 12-payment plan's end_date is the LAST payment). Never
 * before today — a late-posting processor shouldn't hide the next charge.
 */
export function nextInstallmentDate(plan: UpcomingInputs['installments'][number], today: string): string | null {
  if (!plan.start_date) return null
  const made = plan.payments_made || 0
  if (made >= plan.installment_count) return null
  const day = Number(plan.start_date.slice(8, 10)) || 1
  let k = made
  let date = dayInMonth(addMonthsKey(plan.start_date, k), day)
  while (date < today && k < plan.installment_count - 1) {
    k++
    date = dayInMonth(addMonthsKey(plan.start_date, k), day)
  }
  return date < today ? null : date
}

/**
 * Money moving in the next 14 days: bills (subscriptions' next charge), MSI
 * installments, scheduled income, baby-plan events and the WEST balloon.
 * Bills sharing a day collapse into one row ("Rent + 6 more").
 */
export function buildUpcoming(input: UpcomingInputs): Array<SummaryUpcomingItem & { count?: number; items?: string[] }> {
  const { today } = input
  const end = addDaysKey(today, input.windowDays ?? UPCOMING_WINDOW_DAYS)
  const inWindow = (d: string | null | undefined): d is string => !!d && d >= today && d <= end
  const raw: SummaryUpcomingItem[] = []

  for (const sub of input.recurring) {
    if (!sub.next_due_date) continue
    let due = sub.next_due_date.slice(0, 10)
    const anchor = Number(due.slice(8, 10))
    for (let guard = 0; due < today && guard < 60; guard++) due = advanceRecurringDate(due, sub.frequency, anchor)
    for (let guard = 0; inWindow(due) && guard < 31; guard++) {
      raw.push({ date: due, label: sub.name, amount: Math.abs(sub.amount), kind: 'bill' })
      const next = advanceRecurringDate(due, sub.frequency, anchor)
      if (next <= due) break
      due = next
    }
  }

  for (const plan of input.installments) {
    const date = nextInstallmentDate(plan, today)
    if (inWindow(date)) raw.push({ date, label: plan.name, amount: Math.abs(plan.installment_amount), kind: 'msi' })
  }

  const posted = new Set(input.postedIncomeMerchants.map(m => m.trim().toLowerCase()))
  for (const income of input.recurringIncome) {
    if ((income.recurrence || 'monthly') !== 'monthly') continue
    const day = income.day_of_month || 1
    for (const month of [today.slice(0, 7), addMonthsKey(today, 1)]) {
      const date = dayInMonth(month, day)
      if (!inWindow(date)) continue
      if (income.start_date && date < income.start_date) continue
      if (month === today.slice(0, 7) && posted.has(income.name.trim().toLowerCase())) continue
      raw.push({ date, label: income.name, amount: Math.abs(income.amount), kind: 'income' })
    }
  }

  for (const event of input.babyEvents) {
    const date = String(event.date || `${event.month}-15`)
    if (inWindow(date)) raw.push({ date, label: event.label || 'Baby plan', amount: event.amount, kind: 'baby' })
  }

  if (input.westLump && inWindow(input.westLump.date)) {
    raw.push({ date: input.westLump.date, label: 'WEST balloon payment', amount: input.westLump.amount, kind: 'west' })
  }

  const grouped: Array<SummaryUpcomingItem & { count?: number; items?: string[] }> = []
  const bills = new Map<string, SummaryUpcomingItem[]>()
  for (const item of raw) {
    if (item.kind !== 'bill') { grouped.push(item); continue }
    bills.set(item.date, [...(bills.get(item.date) ?? []), item])
  }
  for (const [date, items] of bills) {
    items.sort((a, b) => b.amount - a.amount)
    grouped.push(items.length === 1 ? items[0] : {
      date,
      label: `${items[0].label} + ${items.length - 1} more`,
      amount: Math.round(items.reduce((s, i) => s + i.amount, 0)),
      kind: 'bill',
      count: items.length,
      items: items.map(i => i.label),
    })
  }
  return grouped.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
}
