'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { fetchWestProjection, westMonthTarget } from '@/lib/west-projection-client'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { mexicoCityDateParts } from '@/lib/insights-prompt.mjs'
import { Plus, Activity, Sparkles, Landmark, Bitcoin, ShieldCheck, LockKeyhole, ChevronDown, ChevronUp, RefreshCw, ArrowUpRight } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { SkeletonKPI } from '@/components/ui/skeleton-card'
import { BillsTimeline } from '@/components/finance/bills-timeline'
import { DailySpendingPlan } from '@/components/finance/daily-spending-plan'
import { BudgetWatch } from '@/components/finance/budget-watch'
import { WolffWidget } from '@/components/finance/wolff-widget'
import { SafeToSpendCard } from '@/components/finance/safe-to-spend'
import { MonthProjectionCard } from '@/components/finance/month-projection-card'
import { InstallPrompt } from '@/components/finance/install-prompt'
import { supabase } from '@/lib/supabase'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { cn } from '@/lib/utils'
import type { FinanceTransaction } from '@/lib/finance-types'
import { enrichTransactions, DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import { type Summary, type Forecast, fmtMoney } from './command-center/types'
import { KpiCard, SectionHeader } from './command-center/ui'
import { BudgetPaceCard } from './command-center/budget-pace'
import { BabyPlanCard, EducationFundCard } from './command-center/plans'

const ForecastChart = dynamic(() => import('@/components/finance/forecast-chart').then(m => m.ForecastChart), { loading: () => <div className="h-[220px] animate-pulse" aria-label="Loading forecast chart" /> })

export default function CommandCenterClient() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [westTarget, setWestTarget] = useState<number | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  // Net assets snapshot — fetched with the initial batch; the KPI strip falls
  // back to the crypto-position card when unavailable
  const [netWorth, setNetWorth] = useState<{ net_worth: number; total_assets: number; total_liabilities: number; date: string } | null>(null)

  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const [currentMonthStr, setCurrentMonthStr] = useState('')

  const fetchData = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    const mx = mexicoCityDateParts()
    const month = `${mx.year}-${String(mx.month).padStart(2, '0')}`
    const today = `${month}-${String(mx.day).padStart(2, '0')}`
    const signal = AbortSignal.timeout(20000)
    const read = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', signal })
      if (!response.ok) throw new Error('Request failed')
      return response.json()
    }
    try {
      const [sum, fc, catRes, txs, nw, west] = await Promise.all([
        read('/api/finance/summary'),
        read('/api/finance/forecast?days=60').catch(() => null),
        supabase.from('finance_categories').select('*').order('sort_order').abortSignal(signal),
        fetchAllRows<FinanceTransaction>((from, to) => supabase.from('finance_transactions')
          .select('*').gte('transaction_date', `${month}-01`).lte('transaction_date', today)
          .order('transaction_date', { ascending: false }).order('id').range(from, to).abortSignal(signal), 1000, 20000, true),
        read('/api/finance/net-worth?days=30').catch(() => null),
        fetchWestProjection(true),
      ])
      if (!sum?.current_month || catRes.error) throw new Error('Incomplete dashboard data')
      if (!mounted.current) return
      const cats = catRes.data?.length ? catRes.data : DEFAULT_CATEGORIES
      setSummary(sum)
      setForecast(fc)
      setWestTarget(westMonthTarget(west, month))
      setTransactions(enrichTransactions(txs, cats))
      setCurrentMonthStr(month)
      setNetWorth(nw?.summary?.latest ?? null)
      setUpdatedAt(new Date())
      setError(fc && nw ? null : 'Some supporting data is unavailable. Refresh to retry.')
    } catch {
      if (mounted.current) setError('Could not refresh your finances. Check your connection and try again.')
    } finally {
      inFlight.current = false
      if (mounted.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const initial = window.setTimeout(() => void fetchData(), 0)
    const refresh = () => { if (document.visibilityState === 'visible') void fetchData() }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    return () => {
      mounted.current = false
      window.clearTimeout(initial)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [fetchData])

  const monthTxs = useMemo(
    () => transactions.filter(t => t.transaction_date.startsWith(currentMonthStr)),
    [transactions, currentMonthStr]
  )

  const totalSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const totalIncome = useMemo(() => monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const netSavings = totalIncome - totalSpent
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0
  const monthlyGoalNeed = summary?.goal_funding.total_monthly_needed || 0
  // Before any income lands (typically the first of the month, until payroll
  // auto-posts) a "net savings / % rate" framing is meaningless — net is just
  // −spend and the rate is undefined. Present it neutrally instead of a red
  // negative headline. Reverts automatically the moment income posts.
  const awaitingIncome = totalIncome === 0

  const bernardoSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense' && ownersEqual(t.owner, OWNERS[0])).reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const lauraSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense' && ownersEqual(t.owner, OWNERS[1])).reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])

  // Status banner copy — quotes the summary endpoint's budget-aware projection
  // (fixed categories capped at budget, variable at pace, scheduled treatment
  // included) so the banner and the projection card can't disagree. Linear
  // spend/progress scaling over-projects: rent and other fixed charges land
  // early-month and aren't a daily rate.
  const statusBanner = useMemo(() => {
    if (!summary) return null
    const m = summary.current_month
    const enoughDaysElapsed = m.day_of_month >= 7

    const overshootCats = enoughDaysElapsed ? m.budget_vs_actual.filter(c =>
      !c.is_non_monthly && c.budget > 0 && c.projected_month_total > c.budget * 1.10 && c.pct_used > 50
    ) : []

    const p = summary.month_projection
    const projectedRate = (p && p.expected_income > 0 && enoughDaysElapsed)
      ? Math.round((p.projected_savings / p.expected_income) * 100)
      : null

    if (totalIncome === 0) {
      return { tone: 'info' as const, msg: `Day ${m.day_of_month} of ${m.days_in_month}. No income recorded yet — process recurring or add transactions.` }
    }
    if (!enoughDaysElapsed) {
      return { tone: 'info' as const, msg: `Day ${m.day_of_month} of ${m.days_in_month} — recurring bills just landed. Pace projections stabilize after day 7.` }
    }
    if (overshootCats.length === 0 && projectedRate !== null && projectedRate >= 20) {
      return { tone: 'success' as const, msg: `On pace for a ${projectedRate}% savings rate this month — every budget is on track.` }
    }
    if (overshootCats.length > 0) {
      const rateText = projectedRate !== null ? `Projected savings rate ${projectedRate}%.` : ''
      return { tone: 'warning' as const, msg: `${overshootCats.length} budget${overshootCats.length > 1 ? 's' : ''} projected to overshoot. ${rateText}` }
    }
    return { tone: 'info' as const, msg: `Projected savings rate ${projectedRate ?? 0}% this month. Day ${m.day_of_month} of ${m.days_in_month}.` }
  }, [summary, totalIncome])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4"><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /></div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><div className="h-64 rounded-xl bg-[hsl(var(--muted))] animate-pulse lg:col-span-2" /><div className="h-64 rounded-xl bg-[hsl(var(--muted))] animate-pulse" /></div>
      </div>
    )
  }

  if (!summary) {
    return <GlassCard><h1 className="text-xl font-semibold">Your finances are unavailable</h1>
      <p role="alert" className="mt-2 text-sm text-[hsl(var(--text-secondary))]">{error}</p>
      <button type="button" onClick={() => void fetchData()} disabled={refreshing} className="mt-4 min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{refreshing ? 'Retrying…' : 'Try again'}</button>
    </GlassCard>
  }

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <PageTransition>
      <div className="space-y-5 sm:space-y-6" data-animate>
        <header className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-[hsl(var(--text-secondary))]">{greeting}, {OWNERS[0]}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{today.toLocaleDateString('en-US', { month: 'long', timeZone: 'America/Mexico_City' })} overview</h1>
            <p role="status" className="mt-1.5 text-[11px] text-[hsl(var(--text-tertiary))]">{refreshing ? 'Refreshing your finances…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · MXN` : 'MXN'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" aria-label="Refresh" title="Refresh balances" onClick={() => void fetchData()} disabled={refreshing} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:bg-white/5 disabled:opacity-50"><RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" /></button>
            <Link href="/finance/transactions?add=1" aria-label="New transaction" className="overview-primary-action hidden h-11 sm:inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold sm:px-4"><Plus className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">New transaction</span></Link>
          </div>
        </header>
        {error && <p role="alert" className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-700">{error} {updatedAt && 'Showing the last successful update where available.'}</p>}

        <div className="overview-summary-grid grid gap-4 xl:grid-cols-2">
          <section className="overview-balance-card relative flex flex-col overflow-hidden rounded-2xl p-5 sm:p-6" aria-label="Month to date">
            <div className="relative flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-[hsl(var(--text-secondary))]">{awaitingIncome ? 'Spent so far' : netSavings < 0 ? 'Month so far' : 'Saved so far'}</p>
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-[hsl(var(--text-secondary))]">Day {summary.current_month.day_of_month} of {summary.current_month.days_in_month}</span>
            </div>
            <div className="relative mt-3 flex flex-wrap items-end gap-x-3 gap-y-2">
              <p className={cn('num-metric text-[2.75rem] font-semibold leading-none tracking-tight sm:text-5xl', awaitingIncome ? 'text-[hsl(var(--text-secondary))]' : netSavings >= 0 ? 'text-white' : 'text-rose-300')}>
                {netSavings >= 0 ? '+' : '−'}{fmtMoney(Math.abs(netSavings), { compact: true })}
              </p>
              <span className="pb-1 text-xs text-[hsl(var(--text-secondary))]">{awaitingIncome ? 'awaiting income' : 'net this month'}</span>
            </div>
            <div className="relative mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.08] pt-4">
              <div><p className="text-[11px] text-[hsl(var(--text-secondary))]">Income received</p><p className="num-metric mt-1 text-xl font-medium text-emerald-300">{fmtMoney(totalIncome, { compact: true })}</p></div>
              <div><p className="text-[11px] text-[hsl(var(--text-secondary))]">Spent</p><p className="num-metric mt-1 text-xl font-medium text-[hsl(var(--foreground))]">{fmtMoney(totalSpent, { compact: true })}</p></div>
            </div>
            <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[hsl(var(--text-secondary))]">
              <span>{awaitingIncome ? 'Income will complete the picture' : `${savingsRate}% of received income retained`}</span>
              <Link href="/finance/transactions" className="inline-flex min-h-8 items-center gap-1 font-medium text-sky-300">Transactions <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
          </section>
          <MonthProjectionCard projection={summary.month_projection} goalMonthlyNeeded={monthlyGoalNeed} westTarget={westTarget} compact />
        </div>

        <DailySpendingPlan summary={summary} westTarget={westTarget} />

        {statusBanner && <div className={cn('flex items-start gap-2 rounded-xl px-1 text-xs leading-relaxed', statusBanner.tone === 'warning' ? 'text-amber-300' : 'text-[hsl(var(--text-secondary))]')}><Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><p>{statusBanner.msg}</p></div>}

        <div className="grid items-start gap-4 lg:grid-cols-[1.2fr_1fr]">
          <WolffWidget />
          <BudgetWatch summary={summary} />
        </div>

        {/* ── FINANCIAL PULSE: three durable health metrics ─ */}
        <section aria-label="Household snapshot">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Household snapshot</h2><Link href="/finance/reports" className="inline-flex min-h-9 items-center gap-1 text-xs text-[hsl(var(--text-secondary))]">Reports <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
          {netWorth ? (
            <KpiCard
              icon={Landmark}
              label="Net worth"
              href="/finance/investments"
              value={fmtMoney(netWorth.net_worth, { compact: true })}
              sublabel={
                <span className="flex items-center justify-between">
                  <span className="text-emerald-600">+{fmtMoney(netWorth.total_assets, { compact: true })}</span>
                  <span className="text-rose-600">−{fmtMoney(netWorth.total_liabilities, { compact: true })}</span>
                </span>
              }
              accent="brand"
            />
          ) : (
            <KpiCard
              icon={Bitcoin}
              label="Crypto position"
              href="/finance/crypto"
              value={fmtMoney(summary?.crypto?.total_value_mxn || 0, { compact: true })}
              sublabel={
                summary?.crypto ? (
                  <span className="flex items-center justify-between">
                    <span className={cn('font-medium', summary.crypto.pnl_pct >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                      {summary.crypto.pnl_pct >= 0 ? '+' : ''}{summary.crypto.pnl_pct}% P&amp;L
                    </span>
                    <span className="text-[hsl(var(--text-tertiary))]">{fmtMoney(summary.crypto.pnl_mxn, { compact: true })}</span>
                  </span>
                ) : <span className="text-[hsl(var(--text-tertiary))]">No holdings</span>
              }
              accent="brand"
            />
          )}

          <KpiCard
            icon={ShieldCheck}
            label="Cash buffer"
            href="/finance/emergency-fund"
            value={`${summary.emergency_fund.months_covered.toFixed(1)} mo`}
            sublabel={<span>{fmtMoney(summary.emergency_fund.current, { compact: true })} emergency fund</span>}
            accent={summary.emergency_fund.months_covered >= 3 ? 'positive' : 'neutral'}
          />

          <KpiCard
            icon={LockKeyhole}
            label="Committed income"
            href="/finance/budget-builder"
            value={summary && summary.cash_flow.monthly_income > 0
              ? `${Math.round(summary.cash_flow.fixed_commitments / summary.cash_flow.monthly_income * 100)}%`
              : '—'}
            sublabel={
              summary ? (
                <span className="flex items-center justify-between">
                  <span>{fmtMoney(summary.cash_flow.fixed_commitments, { compact: true })} fixed</span>
                  <span className="text-emerald-600">{fmtMoney(summary.cash_flow.discretionary_available, { compact: true })} free</span>
                </span>
              ) : '—'
            }
            accent={summary && summary.cash_flow.fixed_commitments / Math.max(summary.cash_flow.monthly_income, 1) <= 0.6 ? 'positive' : 'negative'}
          />
        </div>

        </section>
                {/* ── BABY PLAN: envelope to April 2027 + the 2045 education fund ── */}
        {summary?.baby_plan && summary.baby_plan.planning_total > 0 && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BabyPlanCard plan={summary.baby_plan} />
            <EducationFundCard education={summary.baby_plan.education} />
          </div>
        )}


        {/* ── SECONDARY DETAIL: available without dominating the page ─ */}
        <section className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))]/65 shadow-[var(--shadow-elevate)]">
          <button
            type="button"
            onClick={() => setDetailsOpen(open => !open)}
            aria-expanded={detailsOpen}
            aria-controls="cash-flow-details"
            className="flex w-full flex-col gap-3 px-4 py-4 text-left hover:bg-[hsl(var(--brand)/0.025)] sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div>
              <p className="text-sm font-semibold">Cash flow &amp; activity</p>
              <p className="text-[11px] text-[hsl(var(--text-secondary))]">Forecast, budget exceptions, upcoming bills, and recent transactions</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-rose-500/8 px-2.5 py-1 text-[10px] font-semibold text-rose-700">
                {summary?.current_month.budget_vs_actual.filter(cat => !cat.is_non_monthly && cat.projected_month_total > cat.budget * 1.1 && cat.pct_used > 50).length || 0} budget alert
              </span>
              <span className="rounded-full bg-[hsl(var(--accent))] px-2.5 py-1 text-[10px] font-semibold text-[hsl(var(--text-secondary))]">
                {forecast?.summary.next_7_days.events || 0} events this week
              </span>
              {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>

          {detailsOpen && (
            <div id="cash-flow-details" className="space-y-4 border-t border-[hsl(var(--border-subtle))] p-4 sm:p-5" data-animate>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <GlassCard>
                    <div id="forecast" className="mb-3 flex items-end justify-between gap-4">
                      <div>
                        <h3 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="h-4 w-4 text-blue-600" /> Scheduled cash flow</h3>
                        <p className="mt-0.5 text-xs text-[hsl(var(--text-secondary))]">Known income, subscriptions, MSI, debt, and treatment events</p>
                      </div>
                      {forecast && <p className={cn('text-lg font-bold tabular-nums', forecast.summary.net_delta >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{forecast.summary.net_delta >= 0 ? '+' : ''}{fmtMoney(forecast.summary.net_delta, { compact: true })}</p>}
                    </div>
                    {forecast ? <ForecastChart data={forecast.series} height={220} /> : <p className="py-10 text-center text-sm text-[hsl(var(--text-tertiary))]">Forecast unavailable</p>}
                  </GlassCard>
                  <BudgetPaceCard summary={summary} />
                </div>
                <div className="space-y-4">
                  <SafeToSpendCard summary={summary} />
                  <GlassCard>
                    <SectionHeader title="Next 30 days" subtitle="Scheduled bills & income" action={{ label: 'Manage', href: '/finance/subscriptions' }} />
                    {forecast ? <BillsTimeline events={forecast.events} daysAhead={30} maxItems={7} /> : <p className="py-8 text-center text-sm text-[hsl(var(--text-tertiary))]">Upcoming bills unavailable. Refresh to retry.</p>}
                  </GlassCard>
                </div>
              </div>

              <GlassCard>
                <SectionHeader title="Recent activity" subtitle={`${monthTxs.length} transactions this month`} action={{ label: 'View all', href: '/finance/transactions' }} />
                <p className="mb-3 text-xs text-[hsl(var(--text-secondary))]">{OWNERS[0]} spent {fmtMoney(bernardoSpent, { compact: true })} · {OWNERS[1]} spent {fmtMoney(lauraSpent, { compact: true })}</p>
                <div className="grid gap-x-6 sm:grid-cols-2">
                  {monthTxs.slice(0, 4).map(tx => (
                    <div key={tx.id} className="flex items-center gap-3 border-b border-[hsl(var(--border-subtle))] px-1 py-2.5 last:border-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm" style={{ background: `${tx.category?.color || '#6B7280'}20` }}>{tx.category?.icon || '📦'}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{tx.merchant || tx.description || '—'}</p><p className="text-[10px] text-[hsl(var(--text-tertiary))]">{tx.category?.name || 'Uncategorized'} · {tx.transaction_date.slice(5)}</p></div>
                      <span className={cn('text-xs font-semibold tabular-nums', tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600')}>{tx.type === 'income' ? '+' : '−'}{fmtMoney(tx.amount_mxn, { compact: true })}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>
          )}
        </section>
        <InstallPrompt />
      </div>
    </PageTransition>
  )
}
