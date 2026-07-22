'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, HeartPulse, Home, ShieldCheck, Target } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { commitmentCoverage } from '@/lib/household-metrics'
import { cn } from '@/lib/utils'
import { fetchWestProjection } from '@/lib/west-projection-client'
import { fmtMoney, type Summary } from './command-center/types'

type WestSnapshot = {
  target: number
  delivery_date: string
  behavioral?: {
    projected_gap_at_delivery: number
    required_monthly_contribution: number
    fully_funded_month: string | null
  }
  savings_plan?: {
    months: Array<{ month: string; target: number }>
  }
}

function Progress({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'good' | 'warm' }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--bg-elevated))]">
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700',
          tone === 'good' && 'bg-emerald-500',
          tone === 'warm' && 'bg-gradient-to-r from-amber-400 to-orange-500',
          tone === 'brand' && 'bg-gradient-to-r from-emerald-500 to-teal-500',
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function PriorityCard({
  icon: Icon,
  eyebrow,
  title,
  value,
  detail,
  progress,
  progressLabel,
  href,
  tone = 'brand',
  children,
}: {
  icon: typeof Home
  eyebrow: string
  title: string
  value: string
  detail: string
  progress: number
  progressLabel: string
  href: string
  tone?: 'brand' | 'good' | 'warm'
  children?: React.ReactNode
}) {
  return (
    <div className="group flex min-w-0 flex-col bg-[hsl(var(--card))] p-3 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            tone === 'good' ? 'bg-emerald-500/10 text-emerald-700' :
              tone === 'warm' ? 'bg-amber-500/10 text-amber-700' : 'bg-[hsl(var(--brand)/0.09)] text-[hsl(var(--brand))]',
          )}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--text-tertiary))]">{eyebrow}</p>
            <h3 className="text-xs font-semibold leading-tight sm:text-sm">{title}</h3>
          </div>
        </div>
        <Link href={href} aria-label={`Open ${title}`} className="rounded-lg p-1.5 text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--accent))] hover:text-[hsl(var(--brand))]">
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <p className="num-metric mt-4 text-xl font-bold leading-none sm:text-[28px]">{value}</p>
      <p className="mt-1 hidden min-h-8 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))] sm:block">{detail}</p>
      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-end gap-3 text-[10px] text-[hsl(var(--text-tertiary))] sm:justify-between">
          <span className="hidden truncate sm:block">{progressLabel}</span>
          <span className="font-semibold tabular-nums">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} tone={tone} />
      </div>
      {children}
    </div>
  )
}

export function HouseholdPriorities({ summary }: { summary: Summary }) {
  const [west, setWest] = useState<WestSnapshot | null>(null)

  useEffect(() => {
    fetchWestProjection<WestSnapshot>()
      .then(setWest)
      .catch(() => setWest(null))
  }, [])

  const goalNeed = summary.goal_funding.total_monthly_needed
  const projectedSavings = summary.month_projection?.projected_savings || 0
  const coverage = commitmentCoverage(projectedSavings, goalNeed)
  const currentMonth = summary.current_month.month
  const westMonthTarget = west?.savings_plan?.months.find(month => month.month === currentMonth)?.target || 0
  const westContributionPct = westMonthTarget > 0 ? (projectedSavings / westMonthTarget) * 100 : 0

  const fertility = summary.fertility_plan
  const fertilityPaid = Math.max(0, fertility.planning_total - fertility.remaining_amount)
  const fertilityPct = fertility.planning_total > 0 ? (fertilityPaid / fertility.planning_total) * 100 : 0
  const nextTreatment = fertility.current_month_event || fertility.remaining_events[0]

  const emergency = summary.emergency_fund
  const emergencyPct = emergency.funded_pct ?? (emergency.target > 0 ? emergency.current / emergency.target * 100 : 0)

  const combinedGoals = useMemo(() => {
    const moneyGoals = summary.goals.active.filter(goal => goal.target >= 100)
    const target = moneyGoals.reduce((sum, goal) => sum + goal.target, 0)
    const current = moneyGoals.reduce((sum, goal) => sum + goal.current, 0)
    return { target, current, pct: target > 0 ? current / target * 100 : 0, goals: moneyGoals }
  }, [summary.goals.active])

  const attention = coverage.gap > 0

  return (
    <section aria-labelledby="household-plan-title">
      <GlassCard className="household-plan overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-[hsl(var(--border-subtle))] bg-[hsl(var(--brand)/0.045)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="section-tick" aria-hidden />
              <h2 id="household-plan-title" className="text-base font-semibold">Household priorities</h2>
              <span className={cn(
                'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                attention ? 'bg-amber-500/12 text-amber-700' : 'bg-emerald-500/12 text-emerald-700',
              )}>
                {attention ? 'Action needed' : 'Fully covered'}
              </span>
            </div>
            <p className="mt-1 text-xs text-[hsl(var(--text-secondary))]">
              {attention
                ? `${fmtMoney(projectedSavings, { compact: true })} projected savings covers ${coverage.pct}% of this month’s ${fmtMoney(goalNeed, { compact: true })} goal pace.`
                : `This month’s goal pace is covered with ${fmtMoney(coverage.surplus, { compact: true })} left after commitments.`}
            </p>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--text-tertiary))]">Combined goal gap</p>
            <p className={cn('num-metric text-2xl font-bold leading-none', attention ? 'text-amber-700' : 'text-emerald-700')}>
              {attention ? fmtMoney(coverage.gap, { compact: true }) : '$0'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-[hsl(var(--border-subtle))] xl:grid-cols-4">
          <PriorityCard
            icon={Home}
            eyebrow="Home · Dec 2027"
            title="WEST funding"
            value={west?.behavioral ? `${fmtMoney(west.behavioral.required_monthly_contribution, { compact: true })}/mo` : 'Loading…'}
            detail={west?.behavioral
              ? `${fmtMoney(Math.max(0, west.behavioral.projected_gap_at_delivery), { compact: true })} projected delivery gap at current behavior.`
              : 'Calculating the live delivery projection.'}
            progress={westContributionPct}
            progressLabel={westMonthTarget ? `${fmtMoney(projectedSavings, { compact: true })} of ${fmtMoney(westMonthTarget, { compact: true })} July target` : 'Loading monthly target'}
            href="/finance/investments"
            tone={westContributionPct >= 100 ? 'good' : 'warm'}
          />

          <PriorityCard
            icon={HeartPulse}
            eyebrow="Family · Final stretch"
            title="Fertility treatment"
            value={fmtMoney(fertility.remaining_amount, { compact: true })}
            detail={nextTreatment
              ? `Next ${fmtMoney(nextTreatment.amount, { compact: true })} payment on ${new Date(`${nextTreatment.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`
              : 'Treatment plan fully paid.'}
            progress={fertilityPct}
            progressLabel={`${fmtMoney(fertilityPaid, { compact: true })} of ${fmtMoney(fertility.planning_total, { compact: true })} paid`}
            href="/finance/goals"
            tone="good"
          />

          <PriorityCard
            icon={ShieldCheck}
            eyebrow="Safety · Liquid reserve"
            title="Emergency fund"
            value={`${emergency.months_covered.toFixed(1)} months`}
            detail={`${fmtMoney(emergency.current, { compact: true })} available against a ${fmtMoney(emergency.target, { compact: true })} target.`}
            progress={emergencyPct}
            progressLabel={`${Math.round(emergencyPct)}% funded`}
            href="/finance/emergency-fund"
            tone="good"
          />

          <PriorityCard
            icon={Target}
            eyebrow="2026 · Bernardo + Laura"
            title="Combined savings"
            value={fmtMoney(combinedGoals.current, { compact: true })}
            detail={`${fmtMoney(combinedGoals.target - combinedGoals.current, { compact: true })} remains across ${combinedGoals.goals.length} household savings goals.`}
            progress={combinedGoals.pct}
            progressLabel={`${fmtMoney(combinedGoals.current, { compact: true })} of ${fmtMoney(combinedGoals.target, { compact: true })}`}
            href="/finance/goals"
            tone={combinedGoals.pct >= 50 ? 'good' : 'brand'}
          />
        </div>
      </GlassCard>
    </section>
  )
}
