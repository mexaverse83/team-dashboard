'use client'

import Link from 'next/link'
import { ArrowDownLeft, Baby, CalendarClock, ChevronRight, CreditCard, Home, Receipt } from 'lucide-react'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { addDaysKey, diffDaysKey, mexicoCityToday, parseLocalDateKey } from '@/lib/dates'
import { formatDateShort, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'

export type ForecastEvent = {
  date: string
  type: 'income' | 'subscription' | 'msi' | 'debt' | 'recurring_income' | 'planned_expense' | 'baby' | 'west'
  amount_mxn: number
  name: string
  owner?: string | null
}

interface BillsTimelineProps {
  events: ForecastEvent[]
  daysAhead?: number
  maxItems?: number
  /** Override "today" (YYYY-MM-DD, Mexico City) for tests. */
  today?: string
  /** Where the "+N more" link goes when maxItems cuts the list. */
  moreHref?: string
}

const TYPE_LABELS: Record<ForecastEvent['type'], string> = {
  income: 'Income',
  recurring_income: 'Income',
  subscription: 'Bill',
  msi: 'MSI',
  debt: 'Debt',
  planned_expense: 'Planned',
  baby: 'Baby plan',
  west: 'WEST',
}

const isInflow = (ev: ForecastEvent) => ev.amount_mxn > 0

// Neutral glyphs for outflows; arrows read as "open link" elsewhere in the app.
function eventIcon(ev: ForecastEvent) {
  if (isInflow(ev)) return ArrowDownLeft
  if (ev.type === 'baby') return Baby
  if (ev.type === 'west') return Home
  if (ev.type === 'msi' || ev.type === 'debt') return CreditCard
  if (ev.type === 'planned_expense') return CalendarClock
  return Receipt
}

// Outflows are neutral (an expected bill is not bad news); income is the only
// coloured amount (VIS-03). Dates are Mexico City calendar days.
export function BillsTimeline({ events, daysAhead = 30, maxItems = 12, today = mexicoCityToday(), moreHref = '/finance/subscriptions' }: BillsTimelineProps) {
  const horizon = addDaysKey(today, daysAhead)
  const inWindow = events
    .filter(e => e.date >= today && e.date <= horizon)
    .sort((a, b) => a.date.localeCompare(b.date))
  const filtered = inWindow.slice(0, maxItems)
  const hidden = inWindow.slice(maxItems)
  const hiddenOut = hidden.filter(e => !isInflow(e)).reduce((sum, e) => sum + Math.abs(e.amount_mxn), 0)

  if (filtered.length === 0) {
    return <p className="py-6 text-center text-sm text-fg-tertiary">Nothing scheduled in the next {daysAhead} days</p>
  }

  const byDate = new Map<string, ForecastEvent[]>()
  for (const ev of filtered) byDate.set(ev.date, [...(byDate.get(ev.date) || []), ev])

  return (
    <>
    <ul className="divide-y divide-border">
      {[...byDate.entries()].map(([date, items]) => {
        const days = diffDaysKey(today, date)
        const dateLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : formatDateShort(parseLocalDateKey(date))
        return (
          <li key={date} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="w-16 shrink-0 pt-1">
              <p className="text-label font-semibold text-fg">{dateLabel}</p>
              {days > 1 && <p className="text-micro text-fg-tertiary">in {days} days</p>}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {items.map((ev, i) => {
                const inflow = isInflow(ev)
                const Icon = eventIcon(ev)
                return (
                  <div key={`${date}-${i}`} className="flex items-center gap-2.5">
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', inflow ? 'bg-positive-bg text-positive' : 'bg-surface-3 text-fg-secondary')}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{ev.name}</p>
                      <p className="flex items-center gap-1.5 text-micro text-fg-tertiary">{TYPE_LABELS[ev.type]}{ev.owner && <OwnerAvatar owner={ev.owner} size={14} />}</p>
                    </div>
                    <span className={cn('num shrink-0 whitespace-nowrap text-sm font-semibold', inflow ? 'text-positive' : 'text-fg')} data-money>
                      {inflow ? '+' : ''}{formatMoney(Math.abs(ev.amount_mxn))}
                    </span>
                  </div>
                )
              })}
            </div>
          </li>
        )
      })}
    </ul>
    {hidden.length > 0 && (
      <Link href={moreHref} className="mt-2 flex min-h-11 items-center justify-between gap-2 border-t border-border pt-2 text-label font-medium text-fg-secondary hover:text-fg">
        <span>+{hidden.length} more in the next {daysAhead} days{hiddenOut > 0 && <> · <span className="num" data-money>{formatMoney(hiddenOut)}</span> out</>}</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    )}
    </>
  )
}
