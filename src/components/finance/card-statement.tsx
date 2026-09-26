'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CreditCard } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { getOwnerColor } from '@/lib/owners'
import { localDateKey } from '@/lib/transaction-entry'
import { bbvaCycleToPay, shiftCycle, summarizeCycle, type CycleTransaction } from '@/lib/payment-methods'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

/** BBVA Infinite statement: what each owner owes for a cycle (corte 9, pago 29). */
export function BbvaStatementCard({ transactions }: { transactions: CycleTransaction[] }) {
  const todayKey = localDateKey()
  const [offset, setOffset] = useState(0)
  const cycle = useMemo(() => shiftCycle(bbvaCycleToPay(todayKey), offset), [todayKey, offset])
  const summary = useMemo(() => summarizeCycle(transactions, cycle), [transactions, cycle])

  const isOpen = todayKey <= cycle.cut
  const daysToDue = daysBetween(todayKey, cycle.due)
  const status = isOpen
    ? `Open · closes ${shortDate(cycle.cut)}`
    : daysToDue > 0 ? `Closed · due in ${daysToDue} day${daysToDue === 1 ? '' : 's'}`
    : daysToDue === 0 ? 'Closed · due today'
    : 'Past statement'

  return (
    <GlassCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-tertiary))]">
            <CreditCard className="h-3.5 w-3.5" aria-hidden /> BBVA Infinite
          </p>
          <p className="mt-1 text-sm font-semibold">
            Pay by {shortDate(cycle.due)}
            <span className={cn('ml-2 text-xs font-medium', !isOpen && daysToDue >= 0 && daysToDue <= 5 ? 'text-amber-400' : 'text-[hsl(var(--text-secondary))]')}>{status}</span>
          </p>
          <p className="text-xs text-[hsl(var(--text-tertiary))]">Purchases {shortDate(cycle.start)} – {shortDate(cycle.cut)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => setOffset(o => o - 1)} aria-label="Previous statement"
            className="rounded-lg p-1.5 text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--bg-elevated))]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setOffset(o => o + 1)} aria-label="Next statement" disabled={isOpen}
            className="rounded-lg p-1.5 text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--bg-elevated))] disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] overflow-hidden rounded-xl border border-[hsl(var(--border))]">
        {summary.byOwner.map(({ owner, amount }, index) => (
          <div key={owner} className={cn('min-w-0 px-3 py-2.5', index > 0 && 'border-l border-[hsl(var(--border))]')}>
            <p className="flex items-center gap-1.5 truncate text-xs text-[hsl(var(--text-secondary))]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: getOwnerColor(owner) }} />{owner}
            </p>
            <p className="mt-0.5 truncate text-base font-bold tabular-nums">{money(amount)}</p>
          </div>
        ))}
        <div className="min-w-0 border-l border-[hsl(var(--border))] bg-[hsl(var(--bg-elevated))]/40 px-3 py-2.5">
          <p className="truncate text-xs text-[hsl(var(--text-secondary))]">Total</p>
          <p className="mt-0.5 truncate text-base font-bold tabular-nums text-rose-500">{money(summary.total)}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-[hsl(var(--text-tertiary))]">
        {summary.count} charge{summary.count === 1 ? '' : 's'} on this statement{isOpen ? ' so far' : ''}
      </p>
    </GlassCard>
  )
}
