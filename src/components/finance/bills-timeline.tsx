'use client'

import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ForecastEvent = {
  date: string
  type: 'income' | 'subscription' | 'msi' | 'debt' | 'recurring_income' | 'planned_expense'
  amount_mxn: number
  name: string
  owner?: string | null
}

interface BillsTimelineProps {
  events: ForecastEvent[]
  daysAhead?: number
  maxItems?: number
}

const TYPE_LABELS: Record<ForecastEvent['type'], string> = {
  income: 'Income',
  recurring_income: 'Income',
  subscription: 'Subscription',
  msi: 'MSI',
  debt: 'Debt',
  planned_expense: 'Planned expense',
}

const TYPE_COLOR: Record<ForecastEvent['type'], string> = {
  income: 'hsl(142, 71%, 45%)',
  recurring_income: 'hsl(142, 71%, 45%)',
  subscription: 'hsl(263, 70%, 58%)',
  msi: 'hsl(38, 92%, 50%)',
  debt: 'hsl(0, 84%, 60%)',
  planned_expense: 'hsl(186, 70%, 42%)',
}

function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function daysFromToday(s: string): number {
  const d = new Date(s + 'T00:00:00Z')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

export function BillsTimeline({ events, daysAhead = 30, maxItems = 12 }: BillsTimelineProps) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const horizon = new Date(today)
  horizon.setUTCDate(horizon.getUTCDate() + daysAhead)
  const horizonStr = horizon.toISOString().slice(0, 10)

  const filtered = events
    .filter(e => e.date <= horizonStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, maxItems)

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">
        No scheduled bills or income in the next {daysAhead} days
      </p>
    )
  }

  // Group by date for cleaner timeline
  const byDate: Record<string, ForecastEvent[]> = {}
  for (const ev of filtered) {
    if (!byDate[ev.date]) byDate[ev.date] = []
    byDate[ev.date].push(ev)
  }

  return (
    <div className="space-y-3">
      {Object.entries(byDate).map(([date, items]) => {
        const days = daysFromToday(date)
        const dateLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : fmtDate(date)
        const inDays = days > 1 && days <= 7 ? ` · in ${days}d` : ''
        return (
          <div key={date} className="flex gap-3">
            <div className="w-16 shrink-0 text-right">
              <p className="text-xs font-semibold">{dateLabel}</p>
              <p className="text-[10px] text-[hsl(var(--text-tertiary))]">{inDays || (days > 7 ? `in ${days}d` : '')}</p>
            </div>
            <div className="flex-1 space-y-1.5">
              {items.map((ev, i) => {
                const isInflow = ev.amount_mxn > 0
                const Icon = isInflow ? ArrowDownLeft : ArrowUpRight
                return (
                  <div
                    key={`${date}-${i}`}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-[hsl(var(--muted))/0.4] transition-colors"
                  >
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: `${TYPE_COLOR[ev.type]}20` }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: TYPE_COLOR[ev.type] }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ev.name}</p>
                      <p className="text-[10px] text-[hsl(var(--text-tertiary))]">
                        {TYPE_LABELS[ev.type]}{ev.owner ? ` · ${ev.owner}` : ''}
                      </p>
                    </div>
                    <span className={cn('text-sm font-semibold tabular-nums', isInflow ? 'text-emerald-400' : 'text-rose-400')}>
                      {isInflow ? '+' : '-'}${Math.abs(Math.round(ev.amount_mxn)).toLocaleString()}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
