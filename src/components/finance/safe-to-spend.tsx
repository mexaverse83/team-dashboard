'use client'

import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

interface BudgetVsActual {
  spent: number
  budget: number
}

interface SummarySlice {
  cash_flow: { monthly_income: number }
  current_month: {
    day_of_month: number
    days_in_month: number
    total_spent: number
    budget_vs_actual: BudgetVsActual[]
  }
  goal_funding: { total_monthly_needed: number }
}

// "Safe to spend today" = money not yet claimed by the plan, spread over the
// days left in the month:
//   income − spent so far − unspent budget still reserved − goal contributions
// Deterministic on purpose — every input is visible in the breakdown rows.
export function SafeToSpendCard({ summary }: { summary?: SummarySlice | null }) {
  const [fetched, setFetched] = useState<SummarySlice | null>(null)
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

  const income = data.cash_flow?.monthly_income || 0
  const spent = data.current_month?.total_spent || 0
  const reservedBudgets = (data.current_month?.budget_vs_actual || [])
    .reduce((s, b) => s + Math.max(0, (b.budget || 0) - (b.spent || 0)), 0)
  const goalNeed = data.goal_funding?.total_monthly_needed || 0
  const daysLeft = Math.max(1, (data.current_month?.days_in_month || 30) - (data.current_month?.day_of_month || 1) + 1)

  const freeThisMonth = income - spent - reservedBudgets - goalNeed
  const perDay = Math.floor(freeThisMonth / daysLeft)
  const overCommitted = freeThisMonth < 0

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

      <div className="mt-3 space-y-1 border-t border-[hsl(var(--border))] pt-2">
        {[
          ['Expected income', income],
          ['Spent so far', -spent],
          ['Budgets still reserved', -reservedBudgets],
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
