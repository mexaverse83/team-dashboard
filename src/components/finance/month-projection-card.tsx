'use client'

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { monthKey } from '@/lib/finance-utils'
import { fetchWestProjection, westMonthTarget } from '@/lib/west-projection-client'

interface MonthProjection {
  expected_income: number
  spent_so_far: number
  projected_spend: number
  known_upcoming_treatment: number
  projected_savings: number
  method: string
}

interface Props {
  projection?: MonthProjection | null
}

// "How much will we save this month?" — the system's headline metric.
// Full-width feature band under the hero: deterministic projection
// (recomputed every load), the WEST monthly target as a finish line, and
// Mona's daily commentary from the brief.
export function MonthProjectionCard({ projection }: Props) {
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
  const vsTarget = westTarget != null ? p.projected_savings - westTarget : null
  const onTrack = (vsTarget ?? 0) >= 0
  const pctOfTarget = westTarget ? Math.max(0, p.projected_savings / westTarget) : null

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
        </div>

        {/* The finish line */}
        {westTarget != null ? (
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-[hsl(var(--text-tertiary))]">WEST target ${westTarget.toLocaleString()}</span>
              <span className={cn('text-sm font-bold', onTrack ? 'text-emerald-600' : 'text-amber-600')}>
                {onTrack ? `+$${(vsTarget ?? 0).toLocaleString()} ahead` : `$${Math.abs(vsTarget ?? 0).toLocaleString()} short`}
              </span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', onTrack ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-amber-400 to-amber-600')}
                style={{ width: `${Math.min(100, Math.round((pctOfTarget ?? 0) * 100))}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-[hsl(var(--text-tertiary))]">
              {onTrack ? '✓ this month’s WEST transfer is covered' : 'projection below the monthly WEST transfer'}
            </p>
          </div>
        ) : <div className="hidden md:block" />}
      </div>
    </div>
  )
}
