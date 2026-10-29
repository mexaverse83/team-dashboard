'use client'

import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// ─── KPI Card ────────────────────────────────────────────────────────────────
// Values stay neutral (VIS-03); only a delta or hint carries tone. No chart
// dependency, so recharts stays out of home's first load (perf-10).
export function KpiCard({ label, value, sublabel, icon: Icon, href, money = true }: {
  href?: string
  label: string
  value: string
  sublabel?: React.ReactNode
  icon?: LucideIcon
  /** Blur the value in privacy mode (false for months, percentages). */
  money?: boolean
}) {
  const card = (
    <Card interactive={Boolean(href)} className="h-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-label font-medium text-fg-secondary">{label}</span>
        {Icon && <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-3 text-fg-secondary"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>}
      </div>
      <p className="num-metric text-2xl font-semibold leading-none text-fg" {...(money ? { 'data-money': '' } : { 'data-privacy-exempt': '' })}>{value}</p>
      {sublabel && <div className="mt-2 text-label text-fg-secondary">{sublabel}</div>}
    </Card>
  )
  return href ? <Link href={href} className="block rounded-xl">{card}</Link> : card
}

// ─── Section header ──────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, action, className }: { title: string; subtitle?: string; action?: { label: string; href: string }; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold leading-5 text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-label text-fg-tertiary">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href} className="inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap text-label font-medium text-fg-secondary hover:text-fg">
          {action.label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
