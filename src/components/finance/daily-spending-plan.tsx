'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown, Coins, ShoppingBag, CalendarDays } from 'lucide-react'
import { calculateDailyPlan } from '@/lib/daily-plan'
import { calculateSpendingRoom } from '@/lib/spending-room'
import { cn } from '@/lib/utils'
import type { Summary } from './command-center/types'

const money = (amount: number) => `$${Math.round(amount).toLocaleString('en-US')}`

export function DailySpendingPlan({ summary, westTarget }: { summary: Summary; westTarget: number | null }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const plan = calculateDailyPlan(summary, westTarget)
  const room = calculateSpendingRoom(summary)
  const items = [
    { id: 'extra', label: 'Extra today', amount: plan.safe_to_spend_day, note: 'Above your plan', icon: Coins, color: room.overCommitted ? 'text-amber-300' : 'text-emerald-300' },
    { id: 'planned', label: 'Planned today', amount: plan.controllable_per_day, note: 'Within your budgets', icon: ShoppingBag, color: 'text-sky-300' },
    { id: 'week', label: 'Through Sunday', amount: plan.week_envelope, note: `${plan.days_left_in_week} day${plan.days_left_in_week === 1 ? '' : 's'}, including today`, icon: CalendarDays, color: 'text-violet-300' },
  ]

  return (
    <section aria-label="Your daily spending plan" className="overview-daily-plan overflow-hidden rounded-2xl border border-[hsl(var(--border))]">
      <div className="grid grid-cols-3 divide-x divide-[hsl(var(--border))]">
        {items.map(item => (
          <button key={item.id} type="button" aria-expanded={expanded === item.id} aria-controls="daily-plan-explanation"
            onClick={() => setExpanded(value => value === item.id ? null : item.id)}
            className={cn('group min-w-0 p-3 text-left transition-colors hover:bg-white/[0.04] sm:px-5 sm:py-4', expanded === item.id && 'bg-white/[0.04]')}>
            <span className="mb-2 flex items-center justify-between gap-1">
              <item.icon aria-hidden="true" className={cn('h-4 w-4', item.color)} />
              <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 text-[hsl(var(--text-tertiary))] transition-transform', expanded === item.id && 'rotate-180')} />
            </span>
            <span className="block text-[11px] font-medium text-[hsl(var(--text-secondary))] sm:text-xs">{item.label}</span>
            <span className={cn('num-metric mt-1 block text-xl font-semibold tracking-tight sm:text-3xl', item.color)}>{money(item.amount)}</span>
            <span className="mt-1 hidden text-xs text-[hsl(var(--text-tertiary))] sm:block">{item.note}</span>
          </button>
        ))}
      </div>
      {expanded && (
        <div id="daily-plan-explanation" className="border-t border-[hsl(var(--border))] bg-black/10 px-4 py-3 text-xs leading-relaxed text-[hsl(var(--text-secondary))] sm:px-5">
          {expanded === 'extra' && <>
            <p>{money(room.income)} expected income − {money(room.spent)} spent − {money(room.reserved)} still reserved − {money(room.goalNeed)} for goals.</p>
            <p className="mt-1">{room.overCommitted ? `${money(-room.freeMonth)} over-committed this month. Extra purchases would reduce planned savings.` : `${money(room.freeMonth)} extra room across ${room.daysLeft} days.`} This is a forecast, not your bank balance.</p>
          </>}
          {expanded === 'planned' && <p>Your remaining everyday budgets spread over the rest of the month. This spending is already in your plan; the weekly amount is another view of the same budget.</p>}
          {expanded === 'week' && <p>Your remaining everyday budgets, spread from today through Sunday. {plan.week_envelope_west != null && plan.week_envelope_west < plan.week_envelope ? `${money(plan.week_envelope_west)} is the tighter limit that also protects your WEST target.` : 'This includes today’s planned amount; don’t add the two together.'}</p>}
          <Link href="/finance/budgets" className="mt-2 inline-flex min-h-9 items-center gap-1 font-semibold text-sky-300">Review budgets <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        </div>
      )}
    </section>
  )
}
