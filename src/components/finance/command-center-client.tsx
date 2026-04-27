'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Wallet, TrendingUp, TrendingDown, Calendar, Target, AlertCircle,
  ArrowRight, Plus, Activity, Sparkles, ShieldAlert, ChevronDown, ChevronUp,
  HeartPulse, Scissors,
} from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { AlertCard, type AlertSeverity } from '@/components/ui/alert-card'
import { TrendBadge } from '@/components/ui/trend-badge'
import { SparklineChart } from '@/components/ui/sparkline-chart'
import { RadialProgress } from '@/components/ui/radial-progress'
import { PageTransition } from '@/components/page-transition'
import { SkeletonKPI } from '@/components/ui/skeleton-card'
import { ForecastChart } from '@/components/finance/forecast-chart'
import { BillsTimeline, type ForecastEvent } from '@/components/finance/bills-timeline'
import { WestCompactWidget } from '@/components/finance/west-tracker'
import { OwnerBar } from '@/components/finance/owner-dot'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { FinanceTransaction, FinanceCategory } from '@/lib/finance-types'
import { enrichTransactions, DEFAULT_CATEGORIES } from '@/lib/finance-utils'

// Summary endpoint response shape (subset we use)
interface Summary {
  current_month: {
    month: string
    day_of_month: number
    days_in_month: number
    month_progress_pct: number
    total_spent: number
    budget_vs_actual: Array<{
      category: string
      icon: string
      spent: number
      budget: number
      pct_used: number
      projected_month_total: number
      pace_vs_budget_pct: number
      status: 'ok' | 'warning' | 'over'
      is_non_monthly: boolean
      cycle_months: number
    }>
  }
  income: { total_monthly: number }
  spending: { total_monthly_avg: number }
  budgets: { total_budgeted: number }
  subscriptions: { total_monthly: number; total_annual: number }
  installments: { total_monthly_commitment: number }
  debts: { total_balance: number; total_minimums: number }
  emergency_fund: { current: number; target: number; months_covered: number }
  goals: { active: Array<{ name: string; target: number; current: number; pct: number; monthly_needed: number; on_track: boolean }> }
  cash_flow: { monthly_income: number; fixed_commitments: number; discretionary_available: number }
  goal_funding: { total_monthly_needed: number; discretionary_available: number; gap: number; fully_funded: boolean }
  fertility_plan: {
    name: string
    range_min: number
    range_max: number
    planning_total: number
    start_month: string
    end_month: string
    remaining_amount: number
    current_month_commitment: number
    total_goal_monthly_needed: number
    monthly_free_cash: number
    discretionary_after_treatment: number
    monthly_gap_to_keep_goals: number
    fully_funded_with_goals: boolean
    deferred_catch_up_monthly: number
    current_month_event: {
      date: string
      month: string
      amount: number
      minAmount: number
      maxAmount: number
      label: string
    } | null
    monthly_events: Array<{
      date: string
      month: string
      amount: number
      minAmount: number
      maxAmount: number
      label: string
    }>
    remaining_events: Array<{
      date: string
      month: string
      amount: number
      minAmount: number
      maxAmount: number
      label: string
    }>
    recommended_cuts: Array<{
      category: string
      icon: string
      current_budget: number
      recommended_cap: number
      cut_amount: number
    }>
  }
  msi_timeline: Array<{ name: string; merchant: string; monthly_payment: number; payments_remaining: number; end_date: string }>
  crypto: null | {
    total_value_mxn: number
    pnl_mxn: number
    pnl_pct: number
    risks: { concentration: { symbol: string; pct: number } | null; large_loss: { pnl_pct: number } | null }
  }
}

interface Forecast {
  period: { start: string; end: string; days: number }
  series: Array<{
    date: string
    inflow: number
    outflow: number
    net: number
    running_balance: number
  }>
  events: ForecastEvent[]
  summary: {
    total_inflow: number
    total_outflow: number
    net_delta: number
    ending_balance: number
    min_balance: { date: string; balance: number }
    max_balance: { date: string; balance: number }
    next_7_days: { events: number; net: number }
    next_30_days: { events: number; net: number }
  }
}

function fmtMoney(n: number, opts: { decimals?: number; compact?: boolean } = {}) {
  const { compact = false } = opts
  if (compact && Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (compact && Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n).toLocaleString()}`
}

// ─── Build top alerts from summary + forecast data ───────────────────────────
type Alert = {
  id: string
  severity: AlertSeverity
  title: string
  description: string
  action?: { label: string; href: string }
  weight: number // higher = more important
}

function buildAlerts(summary: Summary | null, forecast: Forecast | null, recentTx: FinanceTransaction[]): Alert[] {
  if (!summary) return []
  const alerts: Alert[] = []

  // 1. Budget categories projected to overshoot
  for (const cat of summary.current_month.budget_vs_actual) {
    if (cat.is_non_monthly) continue
    if (cat.budget <= 0) continue
    if (cat.projected_month_total > cat.budget * 1.1) {
      const overshoot = cat.projected_month_total - cat.budget
      alerts.push({
        id: `budget-${cat.category}`,
        severity: cat.status === 'over' ? 'danger' : 'warning',
        title: `${cat.icon} ${cat.category} — projected ${fmtMoney(overshoot, { compact: true })} over budget`,
        description: `On pace for ${fmtMoney(cat.projected_month_total)} vs ${fmtMoney(cat.budget)} budget · ${cat.pct_used}% used · day ${summary.current_month.day_of_month}/${summary.current_month.days_in_month}`,
        action: { label: 'Adjust budget', href: '/finance/budgets' },
        weight: cat.status === 'over' ? 90 : 70,
      })
    }
  }

  // 2. Goal funding gap
  if (summary.goal_funding.gap > 0) {
    alerts.push({
      id: 'goal-gap',
      severity: 'warning',
      title: `Goal funding gap of ${fmtMoney(summary.goal_funding.gap, { compact: true })}/mo`,
      description: `Discretionary cash flow falls short of goal monthly contributions. Trim a budget or increase income to close it.`,
      action: { label: 'Review goals', href: '/finance/goals' },
      weight: 60,
    })
  }

  // 2b. Fertility treatment stress plan
  if (summary.fertility_plan?.monthly_gap_to_keep_goals > 0) {
    alerts.push({
      id: 'fertility-plan-gap',
      severity: 'danger',
      title: `Treatment shortfall: ${fmtMoney(summary.fertility_plan.monthly_gap_to_keep_goals, { compact: true })} for the next payment month`,
      description: `Free cash minus treatment payment minus goal funding. Use the plan card to decide what to cut, delay, or cover from savings.`,
      action: { label: 'Review plan', href: '#fertility-plan' },
      weight: 98,
    })
  } else if (summary.fertility_plan?.current_month_commitment > 0) {
    alerts.push({
      id: 'fertility-plan-covered',
      severity: 'info',
      title: `Fertility treatment planned: ${fmtMoney(summary.fertility_plan.current_month_commitment, { compact: true })} next`,
      description: `This commitment is included in the forecast and goal funding check.`,
      action: { label: 'Review plan', href: '#fertility-plan' },
      weight: 45,
    })
  }

  // 3. Cash flow forecast — projected to go negative or low
  if (forecast && forecast.summary.min_balance.balance < -20000) {
    alerts.push({
      id: 'cashflow-low',
      severity: 'danger',
      title: `Cash flow tight on ${forecast.summary.min_balance.date}`,
      description: `Net flows over next ${forecast.period.days}d project a low point of ${fmtMoney(forecast.summary.min_balance.balance, { compact: true })}. Consider deferring non-critical spend.`,
      action: { label: 'See forecast', href: '#forecast' },
      weight: 95,
    })
  } else if (forecast && forecast.summary.net_delta > 0) {
    alerts.push({
      id: 'cashflow-positive',
      severity: 'success',
      title: `Forecast: +${fmtMoney(forecast.summary.net_delta, { compact: true })} net over ${forecast.period.days}d`,
      description: `Inflow ${fmtMoney(forecast.summary.total_inflow, { compact: true })} vs outflow ${fmtMoney(forecast.summary.total_outflow, { compact: true })}. Spare capacity for goal acceleration.`,
      action: { label: 'Top up a goal', href: '/finance/goals' },
      weight: 30,
    })
  }

  // 4. Crypto risk flags
  if (summary.crypto?.risks?.concentration) {
    const c = summary.crypto.risks.concentration
    alerts.push({
      id: 'crypto-concentration',
      severity: 'warning',
      title: `Crypto concentration: ${c.pct}% in ${c.symbol}`,
      description: `Single-asset risk. Consider diversifying or trimming on rallies.`,
      action: { label: 'View portfolio', href: '/finance/investments?tab=Crypto' },
      weight: 50,
    })
  }
  if (summary.crypto?.risks?.large_loss) {
    alerts.push({
      id: 'crypto-loss',
      severity: 'danger',
      title: `Crypto P&L: ${summary.crypto.risks.large_loss.pnl_pct}%`,
      description: `Holdings down materially vs cost basis. Tax-loss harvest opportunity if planning a rebalance.`,
      action: { label: 'View positions', href: '/finance/investments?tab=Crypto' },
      weight: 65,
    })
  }

  // 5. Emergency fund coverage
  if (summary.emergency_fund.target > 0 && summary.emergency_fund.months_covered < 3) {
    alerts.push({
      id: 'ef-low',
      severity: 'warning',
      title: `Emergency fund: ${summary.emergency_fund.months_covered.toFixed(1)} months covered`,
      description: `Recommended minimum is 3 months of expenses. Currently ${fmtMoney(summary.emergency_fund.current, { compact: true })} of ${fmtMoney(summary.emergency_fund.target, { compact: true })} target.`,
      action: { label: 'Top up', href: '/finance/emergency-fund' },
      weight: 75,
    })
  }

  // 6. Anomaly detection — recent transactions >2σ above merchant baseline
  if (recentTx.length > 0) {
    const last7 = recentTx.filter(t => {
      const d = new Date(t.transaction_date)
      const week = new Date()
      week.setDate(week.getDate() - 7)
      return d >= week
    })
    const merchantHistory: Record<string, number[]> = {}
    for (const t of recentTx) {
      if (!t.merchant) continue
      if (!merchantHistory[t.merchant]) merchantHistory[t.merchant] = []
      merchantHistory[t.merchant].push(t.amount_mxn)
    }
    for (const t of last7) {
      if (!t.merchant) continue
      const hist = merchantHistory[t.merchant] || []
      if (hist.length < 4) continue
      const mean = hist.reduce((s, x) => s + x, 0) / hist.length
      const variance = hist.reduce((s, x) => s + (x - mean) ** 2, 0) / hist.length
      const std = Math.sqrt(variance)
      if (std > 0 && t.amount_mxn > mean + 2 * std && t.amount_mxn > mean * 1.5) {
        alerts.push({
          id: `anomaly-${t.id}`,
          severity: 'warning',
          title: `Unusual ${t.merchant} charge: ${fmtMoney(t.amount_mxn, { compact: true })}`,
          description: `Average ${fmtMoney(mean, { compact: true })} across ${hist.length} prior charges. ${t.transaction_date}.`,
          action: { label: 'Review', href: '/finance/transactions' },
          weight: 55,
        })
        break // one anomaly call-out at most
      }
    }
  }

  // 7. Upcoming large bill in next 7 days
  if (forecast) {
    const next7 = forecast.events
      .filter(e => {
        const d = new Date(e.date)
        const week = new Date()
        week.setDate(week.getDate() + 7)
        return d <= week && e.amount_mxn < 0
      })
      .sort((a, b) => a.amount_mxn - b.amount_mxn)
    const biggest = next7[0]
    if (biggest && Math.abs(biggest.amount_mxn) > 5000) {
      alerts.push({
        id: `bill-${biggest.name}`,
        severity: 'info',
        title: `${biggest.name} due ${biggest.date} — ${fmtMoney(Math.abs(biggest.amount_mxn), { compact: true })}`,
        description: `Largest scheduled charge in the next 7 days.`,
        weight: 25,
      })
    }
  }

  return alerts.sort((a, b) => b.weight - a.weight).slice(0, 5)
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sublabel, trend, sparkline, sparklineColor, accent }: {
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
function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div>
        <h3 className="text-base font-semibold leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href} className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1">
          {action.label} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

// ─── Budget pace card ───────────────────────────────────────────────────────
type BudgetCat = Summary['current_month']['budget_vs_actual'][number]

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
          {cat.is_non_monthly && <span className="text-blue-400 text-[10px] ml-1">({cat.cycle_months}mo cycle)</span>}
        </span>
        <span className="text-xs tabular-nums text-[hsl(var(--text-secondary))]">
          {fmtMoney(cat.spent, { compact: true })} / {fmtMoney(cat.budget, { compact: true })}
          {monthly && cat.budget > 0 && (
            <span className={cn('ml-2', overshoot ? 'text-rose-400' : 'text-emerald-400')}>
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
        <p className="text-[10px] text-rose-400 mt-1">
          Projected overshoot: {fmtMoney(overBy, { compact: true })} ({Math.round(projectedPct - 100)}% over)
        </p>
      )}
    </div>
  )
}

type FilterMode = 'over' | 'all' | 'on_track'

function fmtMonth(month: string) {
  const d = new Date(`${month}-01T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
}

function FertilityPlanCard({ summary }: { summary: Summary | null }) {
  const plan = summary?.fertility_plan
  if (!plan) return null

  const paid = plan.planning_total - plan.remaining_amount
  const progress = plan.planning_total > 0 ? Math.round((paid / plan.planning_total) * 100) : 0
  const next = plan.current_month_event ?? plan.remaining_events[0] ?? null
  const nextPayment = next?.amount ?? plan.current_month_commitment
  const gap = plan.monthly_gap_to_keep_goals
  const hasGap = gap > 0
  const totalRecommendedCuts = plan.recommended_cuts.reduce((s, cut) => s + cut.cut_amount, 0)
  const remainingAfterCuts = Math.max(0, gap - totalRecommendedCuts)
  const formulaResult = plan.monthly_free_cash - nextPayment - plan.total_goal_monthly_needed

  return (
    <div id="fertility-plan">
      <GlassCard className={cn(
        'border-l-2',
        hasGap ? 'border-l-rose-500' : 'border-l-emerald-500'
      )}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HeartPulse className={cn('h-5 w-5', hasGap ? 'text-rose-400' : 'text-emerald-400')} />
              <h3 className="text-base font-semibold">Fertility treatment reserve</h3>
            </div>
            <p className="mt-1 text-xs text-[hsl(var(--text-secondary))]">
              May-July 2026 · planning with the high estimate {fmtMoney(plan.planning_total)} ({fmtMoney(plan.range_min)}-{fmtMoney(plan.range_max)})
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Unpaid total</p>
              <p className="text-lg font-bold tabular-nums text-rose-400">{fmtMoney(plan.remaining_amount, { compact: true })}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Next payment</p>
              <p className="text-lg font-bold tabular-nums">{next ? fmtMoney(next.amount, { compact: true }) : '-'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Monthly shortfall</p>
              <p className={cn('text-lg font-bold tabular-nums', hasGap ? 'text-rose-400' : 'text-emerald-400')}>
                {hasGap ? fmtMoney(gap, { compact: true }) : '$0'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Free after payment</p>
              <p className={cn('text-lg font-bold tabular-nums', plan.discretionary_after_treatment >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {fmtMoney(plan.discretionary_after_treatment, { compact: true })}
              </p>
            </div>
          </div>
        </div>

        <div className={cn(
          'mt-4 rounded-lg border px-3 py-2 text-xs',
          hasGap ? 'border-rose-500/25 bg-rose-500/5' : 'border-emerald-500/25 bg-emerald-500/5'
        )}>
          <p className="font-medium">
            Free cash {fmtMoney(plan.monthly_free_cash)} - next treatment payment {fmtMoney(nextPayment)} - goals {fmtMoney(plan.total_goal_monthly_needed)}
            {' = '}
            <span className={cn(formulaResult >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
              {formulaResult >= 0 ? `${fmtMoney(formulaResult)} available` : `${fmtMoney(Math.abs(formulaResult))} short`}
            </span>
          </p>
          <p className="mt-1 text-[hsl(var(--text-tertiary))]">
            This is a monthly cash-flow check, not the full treatment cost.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[hsl(var(--text-secondary))]">Payment schedule</span>
              <span className="text-xs tabular-nums text-[hsl(var(--text-tertiary))]">{progress}% paid</span>
            </div>
            <div className="h-2 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.min(progress, 100)}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {plan.monthly_events.map(event => {
                const isPast = !plan.remaining_events.some(item => item.month === event.month)
                return (
                  <div key={event.month} className={cn(
                    'rounded-lg border px-2 py-2',
                    isPast ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30'
                  )}>
                    <p className="text-xs font-medium">{fmtMonth(event.month)}</p>
                    <p className="text-sm font-bold tabular-nums">{fmtMoney(event.amount, { compact: true })}</p>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="flex items-center gap-2 mb-2">
              <Scissors className="h-4 w-4 text-amber-400" />
              <span className="text-xs font-medium text-[hsl(var(--text-secondary))]">Suggested temporary monthly cuts</span>
            </div>
            {hasGap ? (
              plan.recommended_cuts.length > 0 ? (
                <div className="space-y-2">
                  {plan.recommended_cuts.slice(0, 4).map(cut => (
                    <div key={cut.category} className="flex items-center gap-3">
                      <span className="w-7 text-center">{cut.icon || '·'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate">{cut.category}</span>
                          <span className="font-semibold tabular-nums text-emerald-400">+{fmtMoney(cut.cut_amount)}/mo</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${cut.current_budget > 0 ? Math.max(4, (cut.recommended_cap / cut.current_budget) * 100) : 0}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-[10px] text-[hsl(var(--text-tertiary))]">
                          Cap at {fmtMoney(cut.recommended_cap)} from {fmtMoney(cut.current_budget)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {plan.deferred_catch_up_monthly > 0 && (
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))] pt-1">
                      These cuts cover {fmtMoney(totalRecommendedCuts)} of the shortfall.
                      {remainingAfterCuts > 0 ? ` Remaining pressure: ${fmtMoney(remainingAfterCuts)}.` : ' Shortfall covered.'}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-[hsl(var(--text-tertiary))]">
                  Need {fmtMoney(gap)}/mo, but wants budgets are not configured enough to allocate cuts.
                </p>
              )
            ) : (
              <p className="text-sm text-emerald-400">
                Current discretionary cash flow covers treatment plus active goals.
              </p>
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

function BudgetPaceCard({ summary }: { summary: Summary | null }) {
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

  // Sort overshooters by projected $ over budget (worst first)
  const overshootSorted = [...overshoot].sort(
    (a, b) => (b.projected_month_total - b.budget) - (a.projected_month_total - a.budget)
  )
  // On-track: lowest pct_used first (the most slack)
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

      {/* Filter chips */}
      <div className="flex items-center gap-1 mb-4 -mt-1">
        {[
          { key: 'over', label: 'Over', count: overshootCount, color: 'text-rose-400 border-rose-500/40 bg-rose-500/5' },
          { key: 'all', label: 'All', count: all.length, color: 'text-blue-400 border-blue-500/40 bg-blue-500/5' },
          { key: 'on_track', label: 'On track', count: onTrack.length, color: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/5' },
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
              className="w-full mt-3 inline-flex items-center justify-center gap-1 py-2 text-xs font-medium text-blue-400 hover:bg-[hsl(var(--muted))]/30 rounded-md transition-colors"
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

export default function CommandCenterClient() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/finance/summary').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/finance/forecast?days=60').then(r => r.ok ? r.json() : null).catch(() => null),
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }).limit(200),
    ]).then(([sum, fc, catRes, txRes]) => {
      setSummary(sum)
      setForecast(fc)
      const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
      setCategories(cats)
      setTransactions(enrichTransactions(txRes.data || [], cats))
      setLoading(false)
    })
  }, [])

  // Current month transactions
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const monthTxs = useMemo(
    () => transactions.filter(t => t.transaction_date.startsWith(currentMonthStr)),
    [transactions, currentMonthStr]
  )

  const totalSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const totalIncome = useMemo(() => monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const netSavings = totalIncome - totalSpent
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0

  const bernardoSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense' && t.owner === 'Bernardo').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const lauraSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense' && t.owner === 'Laura').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])

  // Daily spend sparkline
  const dailySpend = useMemo(() => {
    const map: Record<number, number> = {}
    for (const t of monthTxs) {
      if (t.type !== 'expense') continue
      const day = parseInt(t.transaction_date.slice(8, 10))
      map[day] = (map[day] || 0) + t.amount_mxn
    }
    const today = new Date().getDate()
    return Array.from({ length: today }, (_, i) => map[i + 1] || 0)
  }, [monthTxs])

  // Net assets snapshot — fetched lazily; falls back to component-derived sum
  const [netWorth, setNetWorth] = useState<{ net_worth: number; total_assets: number; total_liabilities: number; date: string } | null>(null)
  useEffect(() => {
    fetch('/api/finance/net-worth?days=30')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.summary?.latest) {
          setNetWorth({ net_worth: d.summary.latest.net_worth, total_assets: d.summary.latest.total_assets, total_liabilities: d.summary.latest.total_liabilities, date: d.summary.latest.date })
        }
      })
      .catch(() => null)
  }, [])

  const alerts = useMemo(
    () => buildAlerts(summary, forecast, transactions).filter(a => !dismissedAlerts.has(a.id)),
    [summary, forecast, transactions, dismissedAlerts]
  )

  const dismissAlert = (id: string) => setDismissedAlerts(s => new Set([...s, id]))

  // Status banner copy — uses this month's actuals (transactions) and projects
  // month-end by linearly scaling spend with month progress. Avoids the trap
  // of dividing by an income figure that comes from sparsely-populated tables.
  const statusBanner = useMemo(() => {
    if (!summary) return null
    const m = summary.current_month
    const monthProgress = m.day_of_month / Math.max(m.days_in_month, 1)

    // Tighter overshoot detection: only flag if projected > 110% AND we're not
    // already past day 28 (avoids noise late in the month from one-off charges).
    const overshootCats = m.budget_vs_actual.filter(c =>
      !c.is_non_monthly &&
      c.budget > 0 &&
      c.projected_month_total > c.budget * 1.10 &&
      c.pct_used > 50  // ignore early-month single-tx noise
    )

    // Project month-end spend from actuals: scale linearly to full month
    const projectedSpend = monthProgress > 0 ? totalSpent / monthProgress : totalSpent
    const projectedNet = totalIncome - projectedSpend
    const projectedRate = totalIncome > 0 ? Math.round((projectedNet / totalIncome) * 100) : null

    if (totalIncome === 0) {
      return { tone: 'info' as const, msg: `Day ${m.day_of_month} of ${m.days_in_month}. No income recorded yet — process recurring or add transactions.` }
    }

    if (overshootCats.length === 0 && projectedRate !== null && projectedRate >= 20) {
      return { tone: 'success' as const, msg: `On pace for a ${projectedRate}% savings rate this month — every budget is on track.` }
    }
    if (overshootCats.length > 0) {
      const rateText = projectedRate !== null ? `Projected savings rate ${projectedRate}%.` : ''
      return { tone: 'warning' as const, msg: `${overshootCats.length} budget${overshootCats.length > 1 ? 's' : ''} projected to overshoot. ${rateText}` }
    }
    return { tone: 'info' as const, msg: `Projected savings rate ${projectedRate ?? 0}% this month. Day ${m.day_of_month} of ${m.days_in_month}.` }
  }, [summary, totalIncome, totalSpent])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4"><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /></div>
        <div className="grid gap-4 lg:grid-cols-3"><div className="h-64 rounded-xl bg-[hsl(var(--muted))] animate-pulse lg:col-span-2" /><div className="h-64 rounded-xl bg-[hsl(var(--muted))] animate-pulse" /></div>
      </div>
    )
  }

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <PageTransition>
      <div className="space-y-6" data-animate>
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting}, Bernardo</h1>
            <p className="text-sm text-[hsl(var(--text-secondary))]">
              {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/finance/transactions"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm font-medium transition-colors"
            >
              <Plus className="h-4 w-4" /> New transaction
            </Link>
          </div>
        </div>

        {/* ── Status banner ───────────────────────────────── */}
        {statusBanner && (
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3',
              statusBanner.tone === 'success' && 'bg-emerald-500/5 border-emerald-500/20',
              statusBanner.tone === 'warning' && 'bg-amber-500/5 border-amber-500/20',
              statusBanner.tone === 'info' && 'bg-blue-500/5 border-blue-500/20',
            )}
          >
            <Activity
              className={cn(
                'h-5 w-5 shrink-0',
                statusBanner.tone === 'success' && 'text-emerald-400',
                statusBanner.tone === 'warning' && 'text-amber-400',
                statusBanner.tone === 'info' && 'text-blue-400',
              )}
            />
            <p className="text-sm font-medium">{statusBanner.msg}</p>
          </div>
        )}

        <FertilityPlanCard summary={summary} />

        {/* ── KPI Strip ──────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="This month savings"
            value={fmtMoney(netSavings, { compact: true })}
            sublabel={
              <span className="flex items-center justify-between">
                <span>Rate <span className={cn('font-semibold', savingsRate >= 20 ? 'text-emerald-400' : savingsRate >= 10 ? 'text-amber-400' : 'text-rose-400')}>{savingsRate}%</span></span>
                <span className="text-[hsl(var(--text-tertiary))]">{fmtMoney(totalIncome, { compact: true })} − {fmtMoney(totalSpent, { compact: true })}</span>
              </span>
            }
            sparkline={dailySpend}
            sparklineColor={netSavings >= 0 ? 'hsl(142, 71%, 45%)' : 'hsl(0, 84%, 60%)'}
            accent={netSavings >= 0 ? 'positive' : 'negative'}
          />

          <KpiCard
            label="60-day forecast"
            value={forecast ? `${forecast.summary.net_delta >= 0 ? '+' : ''}${fmtMoney(forecast.summary.net_delta, { compact: true })}` : '—'}
            sublabel={
              forecast ? (
                <span className="flex items-center justify-between">
                  <span className="text-emerald-400">+{fmtMoney(forecast.summary.total_inflow, { compact: true })}</span>
                  <span className="text-rose-400">−{fmtMoney(forecast.summary.total_outflow, { compact: true })}</span>
                </span>
              ) : '—'
            }
            sparkline={forecast?.series.map(s => s.running_balance) || []}
            sparklineColor="hsl(217, 91%, 60%)"
            accent={forecast && forecast.summary.net_delta >= 0 ? 'brand' : 'negative'}
          />

          <KpiCard
            label="Discretionary"
            value={summary ? fmtMoney(summary.cash_flow.discretionary_available, { compact: true }) : '—'}
            sublabel={
              summary ? (
                <span>
                  After {fmtMoney(summary.cash_flow.fixed_commitments, { compact: true })} fixed.
                  {summary.goal_funding.gap > 0 && (
                    <span className="text-amber-400"> Goal gap: {fmtMoney(summary.goal_funding.gap, { compact: true })}</span>
                  )}
                </span>
              ) : '—'
            }
            accent={summary && summary.cash_flow.discretionary_available > 0 ? 'positive' : 'negative'}
          />

          {netWorth ? (
            <KpiCard
              label="Net worth"
              value={fmtMoney(netWorth.net_worth, { compact: true })}
              sublabel={
                <span className="flex items-center justify-between">
                  <span className="text-emerald-400">+{fmtMoney(netWorth.total_assets, { compact: true })}</span>
                  <span className="text-rose-400">−{fmtMoney(netWorth.total_liabilities, { compact: true })}</span>
                </span>
              }
              accent={netWorth.net_worth >= 0 ? 'brand' : 'negative'}
            />
          ) : (
            <KpiCard
              label="Crypto position"
              value={fmtMoney(summary?.crypto?.total_value_mxn || 0, { compact: true })}
              sublabel={
                summary?.crypto ? (
                  <span className="flex items-center justify-between">
                    <span className={cn('font-medium', summary.crypto.pnl_pct >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {summary.crypto.pnl_pct >= 0 ? '+' : ''}{summary.crypto.pnl_pct}% P&amp;L
                    </span>
                    <span className="text-[hsl(var(--text-tertiary))]">{fmtMoney(summary.crypto.pnl_mxn, { compact: true })}</span>
                  </span>
                ) : <span className="text-[hsl(var(--text-tertiary))]">No holdings</span>
              }
              accent={(summary?.crypto?.pnl_pct ?? 0) >= 0 ? 'brand' : 'negative'}
            />
          )}
        </div>

        {/* ── Smart Alerts ──────────────────────────────── */}
        {alerts.length > 0 && (
          <div>
            <SectionHeader
              title="Smart alerts"
              subtitle={`${alerts.length} ${alerts.length === 1 ? 'item' : 'items'} need your attention`}
            />
            <div className="grid gap-2 md:grid-cols-2">
              {alerts.map(alert => (
                <AlertCard
                  key={alert.id}
                  severity={alert.severity}
                  title={alert.title}
                  description={alert.description}
                  action={alert.action}
                  onDismiss={() => dismissAlert(alert.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Two-column main ──────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left column - 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            {/* Cash flow forecast */}
            <GlassCard>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <h3 className="text-base font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-400" /> 60-day cash flow forecast
                  </h3>
                  <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
                    Projected from recurring income, subscriptions, MSI, and debt minimums
                  </p>
                </div>
                {forecast && (
                  <div className="text-right">
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">Ending net</p>
                    <p className={cn('text-lg font-bold tabular-nums', forecast.summary.net_delta >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                      {forecast.summary.net_delta >= 0 ? '+' : ''}{fmtMoney(forecast.summary.net_delta, { compact: true })}
                    </p>
                  </div>
                )}
              </div>
              {forecast ? (
                <>
                  <ForecastChart data={forecast.series} height={240} />
                  <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[hsl(var(--border))]">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Next 7 days</p>
                      <p className={cn('text-sm font-bold tabular-nums', forecast.summary.next_7_days.net >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                        {forecast.summary.next_7_days.net >= 0 ? '+' : ''}{fmtMoney(forecast.summary.next_7_days.net, { compact: true })}
                      </p>
                      <p className="text-[10px] text-[hsl(var(--text-tertiary))]">{forecast.summary.next_7_days.events} events</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Min balance</p>
                      <p className="text-sm font-bold tabular-nums">{fmtMoney(forecast.summary.min_balance.balance, { compact: true })}</p>
                      <p className="text-[10px] text-[hsl(var(--text-tertiary))]">{forecast.summary.min_balance.date}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Max balance</p>
                      <p className="text-sm font-bold tabular-nums text-emerald-400">{fmtMoney(forecast.summary.max_balance.balance, { compact: true })}</p>
                      <p className="text-[10px] text-[hsl(var(--text-tertiary))]">{forecast.summary.max_balance.date}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-12">Forecast unavailable</p>
              )}
            </GlassCard>

            {/* Budget pace */}
            <BudgetPaceCard summary={summary} />
          </div>

          {/* Right column - 1/3 */}
          <div className="space-y-4">
            {/* Upcoming bills */}
            <GlassCard>
              <SectionHeader
                title="Next 30 days"
                subtitle="Scheduled bills & income"
                action={{ label: 'Subscriptions', href: '/finance/subscriptions' }}
              />
              {forecast ? (
                <BillsTimeline events={forecast.events} daysAhead={30} maxItems={10} />
              ) : (
                <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">Loading…</p>
              )}
            </GlassCard>

            {/* Owner split */}
            {(bernardoSpent > 0 || lauraSpent > 0) && (
              <GlassCard>
                <SectionHeader title="Spend by owner" subtitle="This month" />
                <OwnerBar bernardo={bernardoSpent} laura={lauraSpent} />
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="flex items-center gap-1.5 text-[hsl(var(--text-secondary))]">
                      <span className="h-2 w-2 rounded-full bg-blue-500" /> Bernardo
                    </span>
                    <p className="text-sm font-bold tabular-nums mt-1">{fmtMoney(bernardoSpent, { compact: true })}</p>
                  </div>
                  <div>
                    <span className="flex items-center gap-1.5 text-[hsl(var(--text-secondary))]">
                      <span className="h-2 w-2 rounded-full bg-pink-500" /> Laura
                    </span>
                    <p className="text-sm font-bold tabular-nums mt-1">{fmtMoney(lauraSpent, { compact: true })}</p>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>
        </div>

        {/* ── Goals & WEST row ──────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard className="lg:col-span-2">
            <SectionHeader
              title="Goals"
              subtitle={`${summary?.goals.active.length || 0} active · ${summary?.goal_funding.fully_funded ? 'fully funded' : `${fmtMoney(summary?.goal_funding.gap || 0, { compact: true })} gap`}`}
              action={{ label: 'Manage', href: '/finance/goals' }}
            />
            {summary && summary.goals.active.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {summary.goals.active.slice(0, 4).map(g => (
                  <div key={g.name} className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--muted))]/40 border border-[hsl(var(--border))]">
                    <RadialProgress
                      value={g.pct}
                      size={56}
                      strokeWidth={5}
                      color={g.on_track ? 'hsl(142, 71%, 45%)' : 'hsl(38, 92%, 50%)'}
                      label={`${g.pct}%`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{g.name}</p>
                      <p className="text-xs text-[hsl(var(--text-secondary))] tabular-nums">
                        {fmtMoney(g.current, { compact: true })} of {fmtMoney(g.target, { compact: true })}
                      </p>
                      {g.monthly_needed > 0 && (
                        <p className={cn('text-[10px] mt-0.5', g.on_track ? 'text-emerald-400' : 'text-amber-400')}>
                          {g.on_track ? '✓' : '!'} {fmtMoney(g.monthly_needed, { compact: true })}/mo needed
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Target className="h-10 w-10 mx-auto text-[hsl(var(--text-tertiary))] mb-2" />
                <p className="text-sm text-[hsl(var(--text-secondary))]">No active goals</p>
                <Link href="/finance/goals" className="text-xs text-blue-400 hover:underline">Create one →</Link>
              </div>
            )}
          </GlassCard>

          <WestCompactWidget />
        </div>

        {/* ── Recent activity ──────────────────────────── */}
        <GlassCard>
          <SectionHeader
            title="Recent activity"
            subtitle={`${monthTxs.length} transactions this month`}
            action={{ label: 'View all', href: '/finance/transactions' }}
          />
          {monthTxs.length > 0 ? (
            <div className="space-y-1.5">
              {monthTxs.slice(0, 8).map(tx => (
                <div key={tx.id} className="flex items-center gap-3 py-2 px-2 rounded-md hover:bg-[hsl(var(--muted))]/30 transition-colors">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center text-base shrink-0"
                    style={{ background: `${tx.category?.color || '#6B7280'}20` }}>
                    {tx.category?.icon || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.merchant || tx.description || '—'}</p>
                    <p className="text-[11px] text-[hsl(var(--text-tertiary))]">
                      {tx.category?.name || 'Uncategorized'} · {tx.transaction_date.slice(5)}
                      {tx.owner && <> · {tx.owner}</>}
                      {tx.is_recurring && <> · auto</>}
                    </p>
                  </div>
                  <span className={cn('text-sm font-semibold tabular-nums', tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400')}>
                    {tx.type === 'income' ? '+' : '-'}{fmtMoney(tx.amount_mxn, { compact: true })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">No transactions yet this month</p>
          )}
        </GlassCard>
      </div>
    </PageTransition>
  )
}
