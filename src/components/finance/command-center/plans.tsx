'use client'

import Link from 'next/link'
import { ArrowUpRight, Baby, GraduationCap, Home } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { formatCompact, formatMonthShort } from '@/lib/format'
import { parseLocalDateKey } from '@/lib/dates'
import type { Summary } from './types'
import type { HomeWestPlan } from './west-plan'

const compact = (n: number) => formatCompact(n)
const monthYear = (month: string) => formatMonthShort(parseLocalDateKey(month), { withYear: true })

function PlanCard({ href, icon: Icon, title, meta, children }: {
  href: string
  icon: typeof Home
  title: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
      <Card interactive className="h-full">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-fg">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-3 text-fg-secondary"><Icon className="h-3.5 w-3.5" aria-hidden="true" /></span>
            {title}
          </h3>
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-label text-fg-tertiary">{meta}<ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></span>
        </div>
        <div className="mt-3">{children}</div>
      </Card>
    </Link>
  )
}

// ─── WEST: funded at delivery, months to keys ────────────────────────────────
export function WestProgressCard({ plan }: { plan: HomeWestPlan | null | undefined }) {
  if (plan === undefined) {
    return <Card className="h-[148px] animate-pulse" aria-label="Loading WEST progress"><span className="sr-only">Loading WEST progress</span></Card>
  }
  if (!plan) return null
  const funded = plan.funded_pct
  return (
    <PlanCard href="/finance/investments?tab=Real%20Estate" icon={Home} title="WEST" meta={plan.months_to_delivery != null ? `${plan.months_to_delivery} mo to keys` : undefined}>
      {funded != null ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="num-metric text-2xl font-semibold text-fg" data-privacy-exempt>{funded}%</p>
            <p className="text-label text-fg-tertiary">funded at delivery</p>
          </div>
          <ProgressBar className="mt-2" value={Math.min(funded, 100)} max={100} tone={funded >= 100 ? 'positive' : 'neutral'} label="WEST funded at delivery" valueText={`${funded}% funded at delivery`} />
        </>
      ) : <p className="text-sm text-fg-secondary">Funding plan</p>}
      <p className="mt-2 text-label text-fg-secondary">
        {plan.cumulative_vs_capacity_since_jan != null
          ? <span data-money>{plan.cumulative_vs_capacity_since_jan >= 0 ? `${compact(plan.cumulative_vs_capacity_since_jan)} ahead of plan since Jan` : `${compact(-plan.cumulative_vs_capacity_since_jan)} behind plan since Jan`}</span>
          : plan.purchase_gap != null && plan.purchase_gap > 0 ? <>Purchase gap <span data-money>{compact(plan.purchase_gap)}</span> at delivery</> : 'Fully funded at delivery'}
      </p>
    </PlanCard>
  )
}

// ─── Baby: envelope burn-down and the next event ─────────────────────────────
export function BabyProgressCard({ plan }: { plan: Summary['baby_plan'] }) {
  if (!plan || !(plan.planning_total > 0)) return null
  const spent = plan.spent_to_date
  const next = plan.current_month_event ?? plan.remaining_events[0] ?? null
  return (
    <PlanCard href="/finance/family" icon={Baby} title="Baby" meta={`${plan.months_to_birth} mo to go`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="num-metric text-2xl font-semibold text-fg" data-money>{compact(spent)}</p>
        <p className="text-label text-fg-tertiary">spent of <span data-money>{compact(plan.planning_total)}</span> envelope</p>
      </div>
      <ProgressBar className="mt-2" value={spent} max={plan.planning_total} tone="neutral" label="Baby envelope spent" valueText={`${compact(spent)} of ${compact(plan.planning_total)} spent`} />
      <p className="mt-2 truncate text-label text-fg-secondary">
        {next ? <>Next: {next.label.split('(')[0].trim()} · <span data-money>{compact(next.amount)}</span> · {monthYear(next.month)}</> : `Due ${monthYear(plan.due_month)}`}
      </p>
    </PlanCard>
  )
}

// ─── Education fund 2045 (lives under "More" on home) ────────────────────────
export function EducationFundCard({ education }: { education: NonNullable<Summary['baby_plan']>['education'] }) {
  const coverage = education.coverage_pct_min
  return (
    <PlanCard href="/finance/family" icon={GraduationCap} title={education.name} meta={`from ${monthYear(education.start_month)}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="num-metric text-2xl font-semibold text-fg" data-money>{compact(education.projected_value)}</p>
        <p className="text-label text-fg-tertiary">projected at {education.target_month.slice(0, 4)}</p>
      </div>
      <ProgressBar className="mt-2" value={Math.min(coverage, 100)} max={100} tone="neutral" label="Education fund coverage of the all-in Tec cost" valueText={`${coverage}% of the all-in cost`} />
      <p className="mt-2 text-label text-fg-secondary"><span data-money>{compact(education.monthly_contribution)}</span>/mo · covers {coverage}% of all-in Tec ({education.coverage_pct_max}% of tuition)</p>
    </PlanCard>
  )
}
