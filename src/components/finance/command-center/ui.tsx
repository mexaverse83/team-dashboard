'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { TrendBadge } from '@/components/ui/trend-badge'
import { SparklineChart } from '@/components/ui/sparkline-chart'
import { cn } from '@/lib/utils'

// ─── KPI Card ────────────────────────────────────────────────────────────────
// Accent is reserved for STATUS only (positive / negative). 'brand' is a neutral
// emphasis used sparingly for the headline metric (net worth). Everything else
// stays in the default foreground colour so colour keeps its meaning.
export function KpiCard({ label, value, sublabel, trend, sparkline, sparklineColor, accent }: {
  label: string
  value: string
  sublabel?: React.ReactNode
  trend?: number
  sparkline?: number[]
  sparklineColor?: string
  accent?: 'positive' | 'negative' | 'neutral' | 'brand'
}) {
  const accentClass = accent === 'positive' ? 'text-emerald-400'
    : accent === 'negative' ? 'text-rose-400'
    : accent === 'brand' ? 'text-blue-400'
    : 'text-[hsl(var(--foreground))]'
  return (
    <GlassCard>
      <div className="flex items-start justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">{label}</span>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
      <p className={cn('text-2xl sm:text-[28px] font-bold tabular-nums leading-none', accentClass)}>{value}</p>
      {sublabel && <div className="mt-1.5 text-xs text-[hsl(var(--text-secondary))]">{sublabel}</div>}
      {sparkline && sparkline.length > 0 && (
        <div className="mt-3 -mx-1">
          <SparklineChart data={sparkline} color={sparklineColor || 'hsl(217, 91%, 60%)'} width={200} height={28} />
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
        <Link href={action.href} className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1">
          {action.label} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}
