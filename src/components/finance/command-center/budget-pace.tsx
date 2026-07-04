'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import { SectionHeader } from './ui'
import { type BudgetCat, type Summary, fmtMoney } from './types'

function BudgetRow({ cat }: { cat: BudgetCat }) {
  const monthly = !cat.is_non_monthly
  const projection = monthly ? cat.projected_month_total : cat.spent
  const overBy = projection - cat.budget
  const overshoot = monthly && cat.budget > 0 && projection > cat.budget
  const pct = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0
  const projectedPct = cat.budget > 0 ? (projection / cat.budget) * 100 : 0
  const barColor =
    cat.status === 'over' ? 'bg-rose-500'
    : cat.status === 'warning' ? 'bg-amber-500'
    : 'bg-emerald-500'

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">
          {cat.icon} {cat.category}
          {cat.is_non_monthly && <span className="text-blue-600 text-[10px] ml-1">({cat.cycle_months}mo cycle)</span>}
        </span>
        <span className="text-xs tabular-nums text-[hsl(var(--text-secondary))]">
          {fmtMoney(cat.spent, { compact: true })} / {fmtMoney(cat.budget, { compact: true })}
          {monthly && cat.budget > 0 && (
            <span className={cn('ml-2', overshoot ? 'text-rose-600' : 'text-emerald-600')}>
              → {fmtMoney(projection, { compact: true })}
            </span>
          )}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
        <div className={cn('absolute top-0 left-0 h-full', barColor)} style={{ width: `${Math.min(pct, 100)}%` }} />
        {monthly && projectedPct > pct && (
          <div
            className="absolute top-0 h-full bg-white/30 border-r-2 border-white/60"
            style={{ left: `${Math.min(pct, 100)}%`, width: `${Math.min(projectedPct - pct, 100 - pct)}%` }}
          />
        )}
      </div>
      {overshoot && (
        <p className="text-[10px] text-rose-600 mt-1">
          Projected overshoot: {fmtMoney(overBy, { compact: true })} ({Math.round(projectedPct - 100)}% over)
        </p>
      )}
    </div>
  )
}

type FilterMode = 'over' | 'all' | 'on_track'

export function BudgetPaceCard({ summary }: { summary: Summary | null }) {
  const [filter, setFilter] = useState<FilterMode>('over')
  const [expanded, setExpanded] = useState(false)

  if (!summary || summary.current_month.budget_vs_actual.length === 0) {
    return (
      <GlassCard>
        <SectionHeader title="Budget pace" subtitle="On-track vs projected month-end" action={{ label: 'All budgets', href: '/finance/budgets' }} />
        <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">No budgets configured</p>
      </GlassCard>
    )
  }

  const all = summary.current_month.budget_vs_actual
  const overshoot = all.filter(c =>
    !c.is_non_monthly && c.budget > 0 && c.projected_month_total > c.budget * 1.10 && c.pct_used > 50
  )
  const onTrack = all.filter(c => !overshoot.includes(c))

  const overshootSorted = [...overshoot].sort(
    (a, b) => (b.projected_month_total - b.budget) - (a.projected_month_total - a.budget)
  )
  const onTrackSorted = [...onTrack].sort((a, b) => a.pct_used - b.pct_used)

  const list =
    filter === 'over' ? overshootSorted
    : filter === 'on_track' ? onTrackSorted
    : [...overshootSorted, ...onTrackSorted]

  const collapsedLimit = 5
  const visible = expanded ? list : list.slice(0, collapsedLimit)
  const hidden = list.length - visible.length

  const overshootCount = overshoot.length
  const subtitle =
    overshootCount > 0
      ? `${overshootCount} projected to overshoot · ${onTrack.length} on track`
      : `All ${onTrack.length} budgets on track`

  return (
    <GlassCard>
      <SectionHeader title="Budget pace" subtitle={subtitle} action={{ label: 'All budgets', href: '/finance/budgets' }} />

      <div className="flex items-center gap-1 mb-4 -mt-1">
        {[
          { key: 'over', label: 'Over', count: overshootCount, color: 'text-rose-600 border-rose-500/40 bg-rose-500/5' },
          { key: 'all', label: 'All', count: all.length, color: 'text-blue-600 border-blue-500/40 bg-blue-500/5' },
          { key: 'on_track', label: 'On track', count: onTrack.length, color: 'text-emerald-600 border-emerald-500/40 bg-emerald-500/5' },
        ].map(chip => (
          <button
            key={chip.key}
            onClick={() => { setFilter(chip.key as FilterMode); setExpanded(false) }}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
              filter === chip.key
                ? chip.color
                : 'border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))]/40'
            )}
          >
            {chip.label}
            <span className={cn(
              'tabular-nums px-1 rounded text-[10px]',
              filter === chip.key ? 'bg-white/10' : 'bg-[hsl(var(--muted))]/60'
            )}>{chip.count}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">
          {filter === 'over' ? 'No budgets are projected to overshoot 🎉' : 'Nothing matches'}
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {visible.map(cat => <BudgetRow key={cat.category} cat={cat} />)}
          </div>

          {hidden > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full mt-3 inline-flex items-center justify-center gap-1 py-2 text-xs font-medium text-blue-600 hover:bg-[hsl(var(--muted))]/30 rounded-md transition-colors"
            >
              Show {hidden} more <ChevronDown className="h-3 w-3" />
            </button>
          )}
          {expanded && list.length > collapsedLimit && (
            <button
              onClick={() => setExpanded(false)}
              className="w-full mt-3 inline-flex items-center justify-center gap-1 py-2 text-xs font-medium text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))]/30 rounded-md transition-colors"
            >
              Collapse <ChevronUp className="h-3 w-3" />
            </button>
          )}
        </>
      )}
    </GlassCard>
  )
}
