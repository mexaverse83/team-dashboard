'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown } from 'lucide-react'
import { calculateDailyPlan } from '@/lib/daily-plan'
import { calculateSpendingRoom } from '@/lib/spending-room'
import { addDaysKey, mexicoCityDateParts, mexicoCityToday } from '@/lib/dates'
import { EMPTY_VALUE, formatCompact, formatMoney, formatWeekdayShort } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Summary } from './command-center/types'

const money = (amount: number) => formatMoney(amount)

/** "Sat Oct 31": the last day the weekly room covers (Sunday or month end). */
function fallbackThroughLabel(summary: Summary): { label: string; days: number } {
  const mx = mexicoCityDateParts()
  const today = mexicoCityToday()
  const daysLeftMonth = Math.max(1, summary.current_month.days_in_month - summary.current_month.day_of_month + 1)
  const days = Math.min(daysLeftMonth, mx.dayOfWeek === 0 ? 1 : 8 - mx.dayOfWeek)
  return { label: formatWeekdayShort(addDaysKey(today, days - 1)).replace(',', ''), days }
}

// "Can we spend?" (UX-02, VIS-03, VIS-16, W3): neutral numbers. Today is the
// primary answer; the week shows the signed room left through its last day;
// free extra is "—" when the plan (and WEST) already claims every peso.
export function DailySpendingPlan({ summary, westTarget, ownerSpent }: {
  summary: Summary
  westTarget: number | null
  /** You mode: the viewer's spend so far this month. */
  ownerSpent?: { owner: string; amount: number } | null
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const plan = calculateDailyPlan(summary, westTarget)
  const room = calculateSpendingRoom(summary)
  const variable = summary.variable
  const fallback = fallbackThroughLabel(summary)
  const weekLeft = variable ? variable.left : plan.week_envelope
  const through = variable?.through_label || fallback.label
  const weekDays = variable?.days_left ?? fallback.days
  const freeExtra = plan.safe_to_spend_day

  const items = [
    { id: 'today', label: 'Today', value: money(plan.controllable_per_day), note: 'within your budgets', primary: true, negative: false },
    { id: 'week', label: 'This week', value: money(weekLeft), note: weekLeft < 0 ? `over plan through ${through}` : `left through ${through}`, primary: false, negative: weekLeft < 0 },
    { id: 'extra', label: 'Free extra', value: freeExtra > 0 ? money(freeExtra) : EMPTY_VALUE, note: freeExtra > 0 ? 'per day, above the plan' : 'all slack goes to WEST', primary: false, negative: false },
  ]

  return (
    <section aria-labelledby="spend-heading" className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 id="spend-heading" className="text-[0.9375rem] font-semibold text-fg">Can we spend?</h2>
        {ownerSpent && <p className="text-label text-fg-tertiary">{ownerSpent.owner} spent <span className="num text-fg-secondary" data-money>{formatCompact(ownerSpent.amount)}</span> this month</p>}
      </div>
      <div className="mt-2 grid grid-cols-3 divide-x divide-border">
        {items.map(item => (
          <button key={item.id} type="button" aria-expanded={expanded === item.id} aria-controls="daily-plan-explanation"
            onClick={() => setExpanded(value => value === item.id ? null : item.id)}
            className={cn('group min-w-0 px-3 pb-4 pt-2 text-left transition-colors hover:bg-surface-2 sm:px-5', expanded === item.id && 'bg-surface-2')}>
            <span className="flex items-center justify-between gap-1">
              <span className="text-label font-medium text-fg-secondary">{item.label}</span>
              <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 text-fg-tertiary transition-transform', expanded === item.id && 'rotate-180')} />
            </span>
            <span className={cn('num-metric mt-1 block font-semibold tracking-tight', item.primary ? 'text-2xl sm:text-[1.75rem]' : 'text-xl sm:text-2xl', item.negative ? 'text-negative' : 'text-fg')} {...(item.value === EMPTY_VALUE ? {} : { 'data-money': '' })}>{item.value}</span>
            <span className="mt-1 block text-micro leading-tight text-fg-tertiary sm:text-label">{item.note}</span>
          </button>
        ))}
      </div>
      {expanded && (
        <div id="daily-plan-explanation" className="border-t border-border bg-surface-2 px-4 py-3 text-label leading-relaxed text-fg-secondary sm:px-5">
          {expanded === 'today' && <p>Your remaining everyday budgets spread over the {room.daysLeft} day{room.daysLeft === 1 ? '' : 's'} left, today included. This spending is already in the plan.</p>}
          {expanded === 'week' && <p>{weekLeft < 0
            ? `Everyday spending is ${money(-weekLeft)} past the room through ${through}. Anything more comes out of savings.`
            : `${money(weekLeft)} of everyday budget left through ${through} (${weekDays} day${weekDays === 1 ? '' : 's'}, today included). It already includes today’s amount; don’t add the two.`}</p>}
          {expanded === 'extra' && <>
            <p>{money(room.income)} expected income − {money(room.spent)} spent − {money(room.reserved)} still reserved − {money(room.goalNeed)} for goals and WEST.</p>
            <p className="mt-1">{room.overCommitted ? `${money(-room.freeMonth)} over-committed, so all slack goes to WEST this month.` : `${money(room.freeMonth)} extra across ${room.daysLeft} days.`} This is a forecast, not your bank balance.</p>
          </>}
          <Link href={`/finance/budgets?month=${summary.current_month.month}`} className="mt-2 inline-flex min-h-9 items-center gap-1 font-semibold text-fg">Review budgets <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </div>
      )}
    </section>
  )
}
