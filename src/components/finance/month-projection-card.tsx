'use client'

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { monthKey } from '@/lib/finance-utils'
import { fetchWestProjection, westMonthTarget } from '@/lib/west-projection-client'

interface MonthProjection {
  expected_income: number
  income_received?: number
  income_still_scheduled?: number
  spent_so_far: number
  projected_spend: number
  known_upcoming_treatment: number
  projected_savings: number
  method: string
}

interface Props {
  projection?: MonthProjection | null
  /** summary.goal_funding.total_monthly_needed — the 2026 GBM goals' monthly ask. */
  goalMonthlyNeeded?: number
}

// One month's savings measured against two different bars. The WEST monthly
// transfer and the combined 2026 goals both draw on the same GBM pot (the
// projection counts the whole GBM balance as WEST funding, and both goals'
// investment_vehicle IS that fund), so they are alternative readings of one
// number — never additive, and never a bare ✓ on WEST while goals are short.
function TargetBar({ label, target, savings, note }: { label: string; target: number; savings: number; note?: string }) {
  const vsTarget = savings - target
  const onTrack = vsTarget >= 0
  const pct = Math.min(100, Math.round(Math.max(0, savings / target) * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-[hsl(var(--text-tertiary))]">{label} ${target.toLocaleString()}</span>
        <span className={cn('text-xs font-bold', onTrack ? 'text-emerald-600' : 'text-amber-600')}>
          {onTrack ? `+$${vsTarget.toLocaleString()} ahead` : `$${Math.abs(vsTarget).toLocaleString()} short · ${pct}%`}
        </span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', onTrack ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-amber-400 to-amber-600')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {note && <p className="mt-1 text-[10px] text-[hsl(var(--text-tertiary))]">{note}</p>}
    </div>
  )
}

// "How much will we save this month?" — the system's headline metric.
// Full-width feature band under the hero: deterministic projection
// (recomputed every load), both monthly finish lines, and Mona's daily
// commentary from the brief.
export function MonthProjectionCard({ projection, goalMonthlyNeeded }: Props) {
  const [westTarget, setWestTarget] = useState<number | null>(null)

  useEffect(() => {
    fetchWestProjection()
      .then(d => {
        const target = westMonthTarget(d, monthKey(new Date()))
        if (target) setWestTarget(target)
      })
      .catch(() => {})
  }, [])

  if (!projection) return null
  const p = projection
  const positive = p.projected_savings >= 0
  const goalNeed = goalMonthlyNeeded && goalMonthlyNeeded > 0 ? goalMonthlyNeeded : null
  const showOverlapNote = westTarget != null && goalNeed != null

  return (
    <div className={cn(
      'relative overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-[var(--shadow-elevate)]',
      positive
        ? 'border-emerald-400/20 bg-gradient-to-br from-emerald-500/[0.09] via-[hsl(var(--card))] to-blue-500/[0.07]'
        : 'border-rose-400/30 bg-gradient-to-br from-rose-500/[0.10] via-[hsl(var(--card))] to-orange-500/[0.06]'
    )}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(45% 90% at 95% 0%, hsl(211 90% 60% / 0.10), transparent 60%)' }}
      />
      <div className="relative grid gap-4 md:grid-cols-[1.1fr_1fr] md:items-center">
        {/* The number */}
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
            <TrendingUp className="h-3.5 w-3.5" /> Projected savings · {new Date().toLocaleDateString('en-US', { month: 'long' })}
          </p>
          <p className={cn('num-metric mt-1 text-3xl sm:text-4xl font-black tracking-tight', positive ? 'text-emerald-400' : 'text-rose-400')}>
            {positive ? '' : '−'}${Math.abs(p.projected_savings).toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-[hsl(var(--text-secondary))]">
            ${p.expected_income.toLocaleString()} income − ${p.projected_spend.toLocaleString()} projected spend
            {p.known_upcoming_treatment > 0 && <> · incl. ${p.known_upcoming_treatment.toLocaleString()} treatment</>}
          </p>
          {/* The hero shows income actually received and spend to date; this is
              a month-end forecast. Naming both gaps makes a forecast that sits
              above today's banked net self-explanatory rather than impossible. */}
          <p className="mt-0.5 text-[11px] text-[hsl(var(--text-tertiary))]">
            {(p.income_still_scheduled ?? 0) > 0 && (
              <>${(p.income_received ?? 0).toLocaleString()} received · ${(p.income_still_scheduled ?? 0).toLocaleString()} still scheduled · </>
            )}
            ${p.spent_so_far.toLocaleString()} spent · ${Math.max(0, p.projected_spend - p.spent_so_far).toLocaleString()} more expected
          </p>
        </div>

        {/* The finish lines — labelled, because they measure different asks */}
        {westTarget != null || goalNeed != null ? (
          <div className="space-y-2.5">
            {westTarget != null && (
              <TargetBar label="WEST transfer" target={westTarget} savings={p.projected_savings} />
            )}
            {goalNeed != null && (
              <TargetBar label="All 2026 goals" target={goalNeed} savings={p.projected_savings} />
            )}
            {showOverlapNote && (
              <p className="text-[10px] leading-snug text-[hsl(var(--text-tertiary))]">
                Both draw on the same GBM pot — don’t add these targets.
              </p>
            )}
          </div>
        ) : <div className="hidden md:block" />}
      </div>
    </div>
  )
}
