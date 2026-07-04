'use client'

import Link from 'next/link'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { TrendBadge } from '@/components/ui/trend-badge'
import { SparklineChart } from '@/components/ui/sparkline-chart'
import { cn } from '@/lib/utils'

// ─── KPI Card ────────────────────────────────────────────────────────────────
// Accent is reserved for STATUS only (positive / negative). 'brand' is a neutral
// emphasis used sparingly for the headline metric (net worth). Everything else
// stays in the default foreground colour so colour keeps its meaning.
export function KpiCard({ label, value, sublabel, trend, sparkline, sparklineColor, accent, icon: Icon }: {
  label: string
  value: string
  sublabel?: React.ReactNode
  trend?: number
  sparkline?: number[]
  sparklineColor?: string
  accent?: 'positive' | 'negative' | 'neutral' | 'brand'
  icon?: LucideIcon
}) {
  const accentClass = accent === 'positive' ? 'text-emerald-600'
    : accent === 'negative' ? 'text-rose-600'
    : accent === 'brand' ? 'text-teal-700'
    : 'text-[hsl(var(--foreground))]'
  const chipClass = accent === 'positive' ? 'bg-emerald-500/10 text-emerald-700'
    : accent === 'negative' ? 'bg-rose-500/10 text-rose-700'
    : accent === 'brand' ? 'bg-teal-500/10 text-teal-700'
    : 'bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-secondary))]'
  return (
    <GlassCard>
      <div className="flex items-start justify-between mb-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">{label}</span>
        <span className="flex items-center gap-2">
          {trend !== undefined && <TrendBadge value={trend} />}
          {Icon && (
            <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg -mt-1', chipClass)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
        </span>
      </div>
      <p className={cn('num-metric text-2xl sm:text-[28px] font-bold leading-none', accentClass)}>{value}</p>
      {sublabel && <div className="mt-1.5 text-xs text-[hsl(var(--text-secondary))]">{sublabel}</div>}
      {sparkline && sparkline.length > 0 && (
        <div className="mt-3 -mx-1">
          <SparklineChart data={sparkline} color={sparklineColor || 'hsl(var(--chart-1))'} width={200} height={28} />
        </div>
      )}
    </GlassCard>
  )
}

// ─── Section header ──────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold leading-tight">
          <span className="section-tick" aria-hidden />
          {title}
        </h3>
        {subtitle && <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5 ml-3">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href} className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
          {action.label} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
