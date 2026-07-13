'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Activity, Sparkles, Landmark, Bitcoin, Receipt, LockKeyhole, ChevronDown, ChevronUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { SkeletonKPI } from '@/components/ui/skeleton-card'
import { ForecastChart } from '@/components/finance/forecast-chart'
import { BillsTimeline } from '@/components/finance/bills-timeline'
import { WolffWidget } from '@/components/finance/wolff-widget'
import { SafeToSpendCard } from '@/components/finance/safe-to-spend'
import { MonthProjectionCard } from '@/components/finance/month-projection-card'
import { InstallPrompt } from '@/components/finance/install-prompt'
import { supabase } from '@/lib/supabase'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { cn } from '@/lib/utils'
import type { FinanceTransaction, FinanceCategory } from '@/lib/finance-types'
import { enrichTransactions, DEFAULT_CATEGORIES, monthKey } from '@/lib/finance-utils'
import { type Summary, type Forecast, fmtMoney } from './command-center/types'
import { KpiCard, SectionHeader } from './command-center/ui'
import { BudgetPaceCard } from './command-center/budget-pace'

export default function CommandCenterClient() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [detailsOpen, setDetailsOpen] = useState(false)
  // Net assets snapshot — fetched with the initial batch; the KPI strip falls
  // back to the crypto-position card when unavailable
  const [netWorth, setNetWorth] = useState<{ net_worth: number; total_assets: number; total_liabilities: number; date: string } | null>(null)

  const fetchData = useCallback(async () => {
    const [sum, fc, catRes, txRes, nw] = await Promise.all([
      fetch('/api/finance/summary').then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/finance/forecast?days=60').then(r => r.ok ? r.json() : null).catch(() => null),
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }).limit(200),
      fetch('/api/finance/net-worth?days=30').then(r => r.ok ? r.json() : null).catch(() => null),
    ])
    setSummary(sum)
    setForecast(fc)
    const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
    setCategories(cats)
    setTransactions(enrichTransactions(txRes.data || [], cats))
    if (nw?.summary?.latest) {
      setNetWorth({ net_worth: nw.summary.latest.net_worth, total_assets: nw.summary.latest.total_assets, total_liabilities: nw.summary.latest.total_liabilities, date: nw.summary.latest.date })
    }
    setLoading(false)
  }, [])

  // Re-fetch on mount and whenever the tab regains focus — so edits made
  // elsewhere (e.g. tagging a transaction 'fertility') are reflected here
  // without a hard reload, matching every other finance client.
  useEffect(() => {
    fetchData()
    const h = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [fetchData])

  // Current month transactions
  const currentMonthStr = useMemo(() => monthKey(new Date()), [])
  const monthTxs = useMemo(
    () => transactions.filter(t => t.transaction_date.startsWith(currentMonthStr)),
    [transactions, currentMonthStr]
  )

  const totalSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const totalIncome = useMemo(() => monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const netSavings = totalIncome - totalSpent
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0
  const monthlyGoalNeed = summary?.goal_funding.total_monthly_needed || 0
  const projectedSavings = summary?.month_projection?.projected_savings || 0
  const goalCoveragePct = monthlyGoalNeed > 0 ? Math.max(0, Math.round(projectedSavings / monthlyGoalNeed * 100)) : 100
  // Before any income lands (typically the first of the month, until payroll
  // auto-posts) a "net savings / % rate" framing is meaningless — net is just
  // −spend and the rate is undefined. Present it neutrally instead of a red
  // negative headline. Reverts automatically the moment income posts.
  const awaitingIncome = totalIncome === 0

  const bernardoSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense' && ownersEqual(t.owner, OWNERS[0])).reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const lauraSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense' && ownersEqual(t.owner, OWNERS[1])).reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])

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

  // Status banner copy — uses this month's actuals (transactions) and projects
  // month-end by linearly scaling spend with month progress.
  const statusBanner = useMemo(() => {
    if (!summary) return null
    const m = summary.current_month
    const monthProgress = m.day_of_month / Math.max(m.days_in_month, 1)
    const enoughDaysElapsed = m.day_of_month >= 7

    const overshootCats = enoughDaysElapsed ? m.budget_vs_actual.filter(c =>
      !c.is_non_monthly && c.budget > 0 && c.projected_month_total > c.budget * 1.10 && c.pct_used > 50
    ) : []

    const projectedSpend = monthProgress > 0 ? totalSpent / monthProgress : totalSpent
    const projectedNet = totalIncome - projectedSpend
    const projectedRate = (totalIncome > 0 && enoughDaysElapsed) ? Math.round((projectedNet / totalIncome) * 100) : null

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
  }, [summary, totalIncome, totalSpent])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4"><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /></div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3"><div className="h-64 rounded-xl bg-[hsl(var(--muted))] animate-pulse lg:col-span-2" /><div className="h-64 rounded-xl bg-[hsl(var(--muted))] animate-pulse" /></div>
      </div>
    )
  }

  const today = new Date()
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <PageTransition>
      <div className="space-y-5 sm:space-y-6" data-animate>
        {/* ── Install banner (Android, only when installable) ── */}
        <InstallPrompt />

        {/* ── Hero: the monthly answer ─────────────────────
            Leads with the one number that matters (net this month) instead of
            a uniform card grid; the status banner is its subline. */}
        <div className="wealth-hero relative overflow-hidden rounded-[1.5rem] p-5 sm:p-6 lg:p-7">
          <div className="wealth-hero-orbit absolute inset-0 pointer-events-none" />
          <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--text-secondary))]">
                {greeting}, {OWNERS[0]} · {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className={cn(
                  'num-metric text-4xl sm:text-5xl font-black tracking-tight leading-none',
                  awaitingIncome ? 'text-[hsl(var(--text-secondary))]'
                    : netSavings >= 0 ? 'text-hero-gradient' : 'text-rose-600',
                )}>
                  {netSavings >= 0 ? '+' : '−'}{fmtMoney(Math.abs(netSavings), { compact: true })}
                </span>
                <span className="text-sm text-[hsl(var(--text-secondary))]">
                  {awaitingIncome ? 'spent so far' : 'net this month'}
                  {awaitingIncome ? (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold align-middle bg-amber-500/15 text-amber-700">
                      awaiting income
                    </span>
                  ) : (
                    <span className={cn(
                      'ml-2 px-2 py-0.5 rounded-full text-xs font-semibold align-middle',
                      savingsRate >= 20 ? 'bg-emerald-500/15 text-emerald-700'
                        : savingsRate >= 10 ? 'bg-amber-500/15 text-amber-700'
                        : 'bg-rose-500/15 text-rose-700',
                    )}>
                      {savingsRate}% rate
                    </span>
                  )}
                </span>
              </div>
              {statusBanner && (
                <p className={cn(
                  'mt-3 flex items-center gap-2 text-sm font-medium',
                  statusBanner.tone === 'success' && 'text-emerald-700',
                  statusBanner.tone === 'warning' && 'text-amber-700',
                  statusBanner.tone === 'info' && 'text-[hsl(var(--text-secondary))]',
                )}>
                  <Activity className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">{statusBanner.msg}</span>
                </p>
              )}
            </div>

            <div className="flex flex-col items-stretch sm:items-center lg:flex-col xl:flex-row gap-4 sm:gap-6 lg:shrink-0 w-full lg:w-auto">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:items-center sm:gap-6">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Income</p>
                  <p className="num-metric text-lg font-bold tabular-nums text-emerald-600">+{fmtMoney(totalIncome, { compact: true })}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Spent</p>
                  <p className="num-metric text-lg font-bold tabular-nums text-rose-600">−{fmtMoney(totalSpent, { compact: true })}</p>
                </div>
                {summary && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Goal coverage</p>
                    <p className={cn('num-metric text-lg font-bold tabular-nums', goalCoveragePct >= 100 ? 'text-emerald-600' : 'text-amber-500')}>
                      {goalCoveragePct}%
                    </p>
                  </div>
                )}
                {summary && (
                  <div className="sm:min-w-[110px]">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
                      Day {summary.current_month.day_of_month} of {summary.current_month.days_in_month}
                    </p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                        style={{ width: `${Math.min(100, Math.round((summary.current_month.day_of_month / Math.max(summary.current_month.days_in_month, 1)) * 100))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <Link
                href="/finance/transactions"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors shadow-lg shadow-emerald-900/30"
              >
                <Plus className="h-4 w-4" /> New transaction
              </Link>
            </div>
          </div>
        </div>

        {/* ── WOLFF: the daily decision layer comes before reporting ── */}
        <WolffWidget />

        {/* ── MONTH PLAN: one deterministic finish line ─────────────── */}
        <MonthProjectionCard projection={summary?.month_projection} />

        {/* ── FINANCIAL PULSE: three durable health metrics ─ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {netWorth ? (
            <KpiCard
              icon={Landmark}
              label="Net worth"
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
            icon={Receipt}
            label="Spent this month"
            value={fmtMoney(totalSpent, { compact: true })}
            sublabel={
              <span className="flex items-center justify-between">
                <span><span className="text-blue-600">B</span> {fmtMoney(bernardoSpent, { compact: true })} · <span className="text-pink-600">L</span> {fmtMoney(lauraSpent, { compact: true })}</span>
                <span className="text-[hsl(var(--text-tertiary))]">{fmtMoney(totalIncome, { compact: true })} in</span>
              </span>
            }
            sparkline={dailySpend}
            sparklineColor="hsl(350, 80%, 55%)"
            accent="neutral"
          />

          <KpiCard
            icon={LockKeyhole}
            label="Committed income"
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

        {/* ── SECONDARY DETAIL: available without dominating the page ─ */}
        <section className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))]/65 shadow-[var(--shadow-elevate)]">
          <button
            type="button"
            onClick={() => setDetailsOpen(open => !open)}
            aria-expanded={detailsOpen}
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
            <div className="space-y-4 border-t border-[hsl(var(--border-subtle))] p-4 sm:p-5" data-animate>
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
                    {forecast ? <BillsTimeline events={forecast.events} daysAhead={30} maxItems={7} /> : <p className="py-8 text-center text-sm text-[hsl(var(--text-tertiary))]">Loading…</p>}
                  </GlassCard>
                </div>
              </div>

              <GlassCard>
                <SectionHeader title="Recent activity" subtitle={`${monthTxs.length} transactions this month`} action={{ label: 'View all', href: '/finance/transactions' }} />
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
      </div>
    </PageTransition>
  )
}
