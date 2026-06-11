'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Activity, Sparkles, Target } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { AlertCard } from '@/components/ui/alert-card'
import { RadialProgress } from '@/components/ui/radial-progress'
import { PageTransition } from '@/components/page-transition'
import { SkeletonKPI } from '@/components/ui/skeleton-card'
import { ForecastChart } from '@/components/finance/forecast-chart'
import { BillsTimeline } from '@/components/finance/bills-timeline'
import { WestCompactWidget } from '@/components/finance/west-tracker'
import { WeekendBudgetCard } from '@/components/finance/weekend-budget'
import { OwnerBar } from '@/components/finance/owner-dot'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { FinanceTransaction, FinanceCategory } from '@/lib/finance-types'
import { enrichTransactions, DEFAULT_CATEGORIES, monthKey } from '@/lib/finance-utils'
import { type Summary, type Forecast, fmtMoney } from './command-center/types'
import { buildAlerts } from './command-center/alerts'
import { KpiCard, SectionHeader } from './command-center/ui'
import { BudgetPaceCard } from './command-center/budget-pace'
import { PlansSection } from './command-center/plans'

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
  const currentMonthStr = useMemo(() => monthKey(new Date()), [])
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
          <Link
            href="/finance/transactions"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 text-sm font-medium transition-colors self-start"
          >
            <Plus className="h-4 w-4" /> New transaction
          </Link>
        </div>

        {/* ── Month status strip (one line) ───────────────── */}
        {statusBanner && (
          <div
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-2.5',
              statusBanner.tone === 'success' && 'bg-emerald-500/5 border-emerald-500/20',
              statusBanner.tone === 'warning' && 'bg-amber-500/5 border-amber-500/20',
              statusBanner.tone === 'info' && 'bg-[hsl(var(--muted))]/30 border-[hsl(var(--border))]',
            )}
          >
            <Activity
              className={cn(
                'h-4 w-4 shrink-0',
                statusBanner.tone === 'success' && 'text-emerald-400',
                statusBanner.tone === 'warning' && 'text-amber-400',
                statusBanner.tone === 'info' && 'text-[hsl(var(--text-secondary))]',
              )}
            />
            <p className="text-sm font-medium">{statusBanner.msg}</p>
          </div>
        )}

        {/* ── GLANCE: KPI strip ──────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
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
              accent="brand"
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
              accent="brand"
            />
          )}

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
            accent={forecast && forecast.summary.net_delta >= 0 ? 'positive' : 'negative'}
          />
        </div>

        {/* ── NEEDS ATTENTION: merged alerts ─────────────── */}
        {alerts.length > 0 && (
          <div>
            <SectionHeader
              title="Needs attention"
              subtitle={`${alerts.length} ${alerts.length === 1 ? 'item' : 'items'} ranked by priority`}
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

        {/* ── PLANS: compact, collapsible ────────────────── */}
        <PlansSection summary={summary} />

        {/* ── SCAN + DETAIL: forecast + supporting columns ── */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Left column - 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            <GlassCard>
              <div id="forecast" className="flex items-end justify-between mb-3">
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

            <BudgetPaceCard summary={summary} />
          </div>

          {/* Right column - 1/3 */}
          <div className="space-y-4">
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

            <WeekendBudgetCard transactions={transactions} categories={categories} />

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

        {/* ── Goals & WEST ───────────────────────────────── */}
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

        {/* ── Recent activity ────────────────────────────── */}
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
