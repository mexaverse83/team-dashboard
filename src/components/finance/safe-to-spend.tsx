'use client'

import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

import { calculateSpendingRoom, type SpendingRoomSummary } from '@/lib/spending-room'

// "Safe to spend today" = money not yet claimed by the plan, spread over the
// days left in the month:
//   income − spent so far − unspent budget still reserved − goal contributions
// Deterministic on purpose — every input is visible in the breakdown rows.
export function SafeToSpendCard({ summary }: { summary?: SpendingRoomSummary | null }) {
  const [fetched, setFetched] = useState<SpendingRoomSummary | null>(null)
  const [failed, setFailed] = useState(false)

  // Standalone use fetches its own data; pages that already hold the summary
  // (command center) pass it as a prop instead.
  useEffect(() => {
    if (summary !== undefined) return
    fetch('/api/finance/summary?months=1', {
      headers: { 'x-api-key': process.env.NEXT_PUBLIC_FINANCE_API_KEY || '' },
    })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(setFetched)
      .catch(() => setFailed(true))
  }, [summary])

  const data = summary !== undefined ? summary : fetched

  if (summary === null) return null

  if (failed) return null

  if (!data) {
    return (
      <GlassCard>
        <div className="h-3 w-32 rounded bg-[hsl(var(--bg-elevated))] animate-pulse mb-3" />
        <div className="h-8 w-40 rounded bg-[hsl(var(--bg-elevated))] animate-pulse" />
      </GlassCard>
    )
  }

  const { income, spent, reserved: reservedBudgets, goalNeed, daysLeft,
    freeMonth: freeThisMonth, perDay, overCommitted } = calculateSpendingRoom(data)

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Safe to Spend Today</span>
        <Coins className={cn('h-4 w-4', overCommitted ? 'text-rose-600' : 'text-emerald-600')} />
      </div>

      {overCommitted ? (
        <>
          <p className="num-metric text-2xl sm:text-3xl font-bold text-rose-600">$0</p>
          <p className="text-xs text-rose-600/90 mt-1">
            Over-committed by ${Math.abs(freeThisMonth).toLocaleString()} this month — extra spending comes out of savings.
          </p>
        </>
      ) : (
        <>
          <p className={cn('num-metric text-2xl sm:text-3xl font-bold', perDay > 500 ? 'text-emerald-600' : 'text-amber-600')}>
            ${perDay.toLocaleString()}<span className="text-sm font-medium text-[hsl(var(--text-tertiary))]"> /day</span>
          </p>
          <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">
            ${Math.max(0, freeThisMonth).toLocaleString()} unclaimed over {daysLeft} day{daysLeft === 1 ? '' : 's'} left
          </p>
        </>
      )}

      <p className="mt-2 text-[11px] text-[hsl(var(--text-secondary))]">Extra room after planned spending and goals. Based on expected income; check your account before spending.</p>
      <div className="mt-3 space-y-1 border-t border-[hsl(var(--border))] pt-2">
        {[
          ['Expected income', income],
          ['Spent so far', -spent],
          ['Spending still reserved', -reservedBudgets],
          ['Goal contributions', -goalNeed],
        ].map(([label, val]) => (
          <div key={label as string} className="flex items-center justify-between text-[11px]">
            <span className="text-[hsl(var(--text-tertiary))]">{label}</span>
            <span className={cn('font-medium', (val as number) < 0 ? 'text-[hsl(var(--text-secondary))]' : 'text-emerald-600')}>
              {(val as number) < 0 ? '−' : ''}${Math.abs(val as number).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
