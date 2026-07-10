'use client'

import { useEffect, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'

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

// "How much will we save this month?" — deterministic projection from the
// summary (recomputed on every load), compared against this month's WEST
// savings target, with Wolff's daily commentary from the brief.
export function MonthProjectionCard({ projection }: Props) {
  const [westTarget, setWestTarget] = useState<number | null>(null)
  const [wolffTake, setWolffTake] = useState<{ title: string; detail: string } | null>(null)

  useEffect(() => {
    fetch('/api/finance/investments/west-projection')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const monthKey = new Date().toISOString().slice(0, 7)
        const m = d?.savings_plan?.months?.find((x: { month: string }) => x.month === monthKey)
        if (m?.target) setWestTarget(m.target)
      })
      .catch(() => {})
    fetch('/api/finance/insights', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const p = (d?.insights || []).find((i: { category?: string }) => (i.category || '').toUpperCase() === 'PROJECTION')
        if (p) setWolffTake({ title: p.title, detail: p.detail })
      })
      .catch(() => {})
  }, [])

  if (!projection) return null
  const p = projection
  const positive = p.projected_savings >= 0
  const vsTarget = westTarget != null ? p.projected_savings - westTarget : null
  const pctOfTarget = westTarget ? Math.max(0, p.projected_savings / westTarget) : null

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
          Projected savings this month
        </span>
        <TrendingUp className={cn('h-4 w-4', positive ? 'text-emerald-600' : 'text-rose-600')} />
      </div>

      <p className={cn('num-metric text-2xl sm:text-3xl font-bold', positive ? 'text-emerald-600' : 'text-rose-600')}>
        {positive ? '' : '−'}${Math.abs(p.projected_savings).toLocaleString()}
      </p>
      <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">
        ${p.expected_income.toLocaleString()} income − ${p.projected_spend.toLocaleString()} projected spend
        {p.known_upcoming_treatment > 0 && <> (incl. ${p.known_upcoming_treatment.toLocaleString()} upcoming treatment)</>}
      </p>

      {westTarget != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[hsl(var(--text-tertiary))]">vs WEST target ${westTarget.toLocaleString()}</span>
            <span className={cn('font-semibold', (vsTarget ?? 0) >= 0 ? 'text-emerald-600' : 'text-amber-600')}>
              {(vsTarget ?? 0) >= 0 ? `+$${(vsTarget ?? 0).toLocaleString()} ahead` : `$${Math.abs(vsTarget ?? 0).toLocaleString()} short`}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
            <div
              className={cn('h-full rounded-full', (pctOfTarget ?? 0) >= 1 ? 'bg-gradient-to-r from-emerald-400 to-teal-500' : 'bg-gradient-to-r from-amber-400 to-amber-600')}
              style={{ width: `${Math.min(100, Math.round((pctOfTarget ?? 0) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {wolffTake && (
        <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-2">
          <p className="text-[11px] font-semibold text-emerald-700">🐺 {wolffTake.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))]">{wolffTake.detail}</p>
        </div>
      )}
    </GlassCard>
  )
}
