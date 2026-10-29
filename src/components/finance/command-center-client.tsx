'use client'

import dynamic from 'next/dynamic'
import { ChevronDown, Landmark, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Segmented } from '@/components/ui/segmented'
import { BillsTimeline, type ForecastEvent } from '@/components/finance/bills-timeline'
import { DailySpendingPlan } from '@/components/finance/daily-spending-plan'
import { BudgetWatch } from '@/components/finance/budget-watch'
import { WolffWidget, proactiveFromChat, type InsightsPayload } from '@/components/finance/wolff-widget'
import { MonthProjectionCard } from '@/components/finance/month-projection-card'
import { InstallPrompt } from '@/components/finance/install-prompt'
import { useFinanceData } from '@/hooks/use-finance-data'
import { useRefreshReport } from './command-center/use-refresh-report'
import { fetchWestProjection } from '@/lib/west-projection-client'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { supabase } from '@/lib/supabase'
import { MX_TIME_ZONE, mexicoCityToday, monthEndKey, parseLocalDateKey } from '@/lib/dates'
import { formatCompact, formatDateShort, formatDelta, formatWeekdayShort } from '@/lib/format'
import { OWNERS, canonicalOwner, ownersEqual } from '@/lib/owners'
import { cn } from '@/lib/utils'
import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'
import type { Summary, Forecast } from './command-center/types'
import { KpiCard, SectionHeader } from './command-center/ui'
import { BabyProgressCard, EducationFundCard, WestProgressCard } from './command-center/plans'
import { resolveWestPlan } from './command-center/west-plan'
import { buildAttentionItems } from './command-center/attention'
import { NeedsAttention } from './command-center/needs-attention'
import { RecentActivity, type RecentRow } from './command-center/recent-activity'
import { useHomeScope, useViewer } from './command-center/use-viewer'

const ForecastChart = dynamic(() => import('@/components/finance/forecast-chart').then(m => m.ForecastChart), { loading: () => <div className="h-[220px] animate-pulse" aria-label="Loading forecast chart" /> })

const REQUEST_TIMEOUT_MS = 20_000

function readJson<T>(url: string) {
  return async (signal: AbortSignal): Promise<T> => {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any ? AbortSignal.any([signal, timeout]) : signal })
    if (!response.ok) throw new Error(`Request failed (${response.status})`)
    return response.json() as Promise<T>
  }
}

interface NetWorthPayload {
  snapshots?: Array<{ snapshot_date: string; net_worth: number }>
  summary?: { latest: { net_worth: number; total_assets: number; total_liabilities: number; date: string } | null; delta?: number; count?: number }
}

type MonthTx = Pick<FinanceTransaction, 'id' | 'transaction_date' | 'merchant' | 'description' | 'amount_mxn' | 'type' | 'owner' | 'category_id'>

interface MonthActivity {
  ownerSpend: Record<string, number>
  recent: RecentRow[]
}

const RECENT_ROWS = 5

// Fallback until summary carries owner_spend / recent_transactions (WS4):
// this month's rows through today, read once (perf-13 removes it).
async function readMonthActivity(): Promise<MonthActivity> {
  const today = mexicoCityToday()
  const month = today.slice(0, 7)
  const [catRes, txs] = await Promise.all([
    supabase.from('finance_categories').select('id, name, icon'),
    fetchAllRows<MonthTx>((from, to) => supabase.from('finance_transactions')
      .select('id, transaction_date, merchant, description, amount_mxn, type, owner, category_id')
      .gte('transaction_date', `${month}-01`).lte('transaction_date', today)
      .order('transaction_date', { ascending: false }).order('id').range(from, to), 1000, 20_000, true),
  ])
  const cats = new Map(((catRes.data || []) as Pick<FinanceCategory, 'id' | 'name' | 'icon'>[]).map(c => [c.id, c]))
  const ownerSpend: Record<string, number> = Object.fromEntries(OWNERS.map(o => [o, 0]))
  for (const tx of txs) {
    if (tx.type !== 'expense') continue
    const owner = OWNERS.find(o => ownersEqual(o, tx.owner))
    if (owner) ownerSpend[owner] += Number(tx.amount_mxn) || 0
  }
  const recent = txs.slice(0, 40).map(tx => {
    const cat = tx.category_id ? cats.get(tx.category_id) : undefined
    return {
      id: tx.id,
      date: tx.transaction_date,
      merchant: tx.merchant || tx.description || '',
      amount: Number(tx.amount_mxn) || 0,
      type: tx.type === 'income' ? 'income' as const : 'expense' as const,
      owner: tx.owner,
      category_name: cat?.name ?? null,
      category_icon: cat?.icon ?? null,
    }
  })
  return { ownerSpend, recent }
}

function upcomingEvents(summary: Summary | undefined, forecast: Forecast | null | undefined): ForecastEvent[] | null {
  if (summary?.upcoming) {
    return summary.upcoming.map(item => ({
      date: item.date.slice(0, 10),
      name: item.label,
      type: item.kind === 'bill' ? 'subscription' : item.kind,
      amount_mxn: item.kind === 'income' ? Math.abs(item.amount) : -Math.abs(item.amount),
    }))
  }
  return forecast?.events ?? null
}

function greeting(now: Date): string {
  const hour = Number(now.toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: MX_TIME_ZONE }))
  return hour < 12 ? 'Good morning' : hour < 19 ? 'Good afternoon' : 'Good evening'
}

export default function CommandCenterClient() {
  const { owner: viewer } = useViewer()
  const [scope, setScope] = useHomeScope()
  const scopeOwner = viewer && scope === 'you' ? viewer : null

  // Every request settles on its own: the hero renders as soon as summary
  // lands, WEST and the rest fill in after (perf-03). Mona's inputs ride in
  // the same first batch and are passed down as props (perf-02, MOB-07).
  const summaryQ = useFinanceData<Summary>('home:summary', readJson('/api/finance/summary'))
  const summary = summaryQ.data
  const needsWestFetch = !summary?.west_plan
  const westQ = useFinanceData<unknown>('home:west', () => fetchWestProjection(true), { enabled: needsWestFetch })
  const forecastQ = useFinanceData<Forecast>('home:forecast', readJson('/api/finance/forecast?days=30'))
  const netWorthQ = useFinanceData<NetWorthPayload>('home:net-worth', readJson('/api/finance/net-worth?days=40'))
  const insightsQ = useFinanceData<InsightsPayload>('home:insights', readJson('/api/finance/insights'), { minIntervalMs: 30 * 60_000 })
  const chatQ = useFinanceData<unknown>('home:proactive', readJson('/api/finance/wolff-chat?latest_proactive=1'), { minIntervalMs: 5 * 60_000 })
  const needsActivity = Boolean(summary) && (!summary?.owner_spend || !summary?.recent_transactions)
  const activityQ = useFinanceData<MonthActivity>('home:activity', readMonthActivity, { enabled: needsActivity })
  useRefreshReport([summaryQ, westQ, forecastQ, netWorthQ, insightsQ, chatQ, activityQ])

  const refreshAll = () => {
    void summaryQ.refresh()
    void forecastQ.refresh()
    void netWorthQ.refresh()
    void insightsQ.refresh()
    void chatQ.refresh()
    if (needsWestFetch) void westQ.refresh()
    if (needsActivity) void activityQ.refresh()
  }

  const now = new Date()
  const today = mexicoCityToday(now)
  const month = summary?.current_month.month || today.slice(0, 7)

  const westPlan = summary?.west_plan
    ? resolveWestPlan(summary.west_plan, null, month)
    : westQ.loading || (westQ.data === undefined && !westQ.error) ? undefined : resolveWestPlan(null, westQ.data, month)

  const ownerSpend = summary?.owner_spend ?? activityQ.data?.ownerSpend ?? null
  const allRecent: RecentRow[] | undefined = summary?.recent_transactions
    ? summary.recent_transactions.map(r => ({ ...r, type: (r as { type?: 'expense' | 'income' }).type }))
    : activityQ.data?.recent ?? (activityQ.error ? [] : undefined)
  const recentRows = allRecent && (scopeOwner ? allRecent.filter(r => ownersEqual(r.owner, scopeOwner)) : allRecent).slice(0, RECENT_ROWS)

  const attention = summary ? buildAttentionItems(summary, today) : []
  const attentionCategories = attention.flatMap(item => item.category ? [item.category] : [])
  const events = upcomingEvents(summary, forecastQ.data)
  const proactive = chatQ.data === undefined ? (chatQ.error ? null : undefined) : proactiveFromChat(chatQ.data)

  if (summaryQ.loading && !summary) {
    return (
      <div className="mx-auto w-full max-w-[1200px] space-y-5" aria-busy="true" aria-label="Loading your finances">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-56 animate-pulse rounded-2xl bg-surface-2" />
        <div className="grid gap-4 lg:grid-cols-2"><div className="h-36 animate-pulse rounded-xl bg-surface-2" /><div className="h-36 animate-pulse rounded-xl bg-surface-2" /></div>
      </div>
    )
  }

  if (!summary?.current_month) {
    return (
      <Card className="mx-auto max-w-xl">
        <h1 className="text-xl font-semibold text-fg">Your finances are unavailable</h1>
        <ErrorState compact className="mt-2" title="Could not load this month" body="Check your connection and try again." onRetry={() => void summaryQ.refresh()} retryLabel={summaryQ.refreshing ? 'Retrying…' : 'Try again'} />
      </Card>
    )
  }

  const cm = summary.current_month
  const dateLine = formatWeekdayShort(today)
  const daysLeft = cm.days_in_month - cm.day_of_month + 1
  const monthName = parseLocalDateKey(`${month}-01`).toLocaleDateString('en-US', { month: 'long' })
  const refreshing = summaryQ.refreshing
  const updatedAt = summaryQ.updatedAt ? new Date(summaryQ.updatedAt) : null
  const nw = netWorthQ.data?.summary?.latest ?? null
  const nwDelta = (netWorthQ.data?.summary?.count ?? 0) >= 2 ? netWorthQ.data?.summary?.delta ?? null : null
  const nwSince = netWorthQ.data?.snapshots?.[0]?.snapshot_date
  const ef = summary.emergency_fund as Summary['emergency_fund'] & { essentials_basis?: 'derived' | 'manual' }
  const plannedPct = summary.cash_flow.monthly_income > 0 ? Math.round(summary.cash_flow.fixed_commitments / summary.cash_flow.monthly_income * 100) : null
  const baby = summary.baby_plan && summary.baby_plan.planning_total > 0 ? summary.baby_plan : null
  const education = baby && (baby.education?.monthly_contribution ?? 0) > 0 ? baby.education : null
  const scopedSpend = scopeOwner && ownerSpend ? { owner: scopeOwner, amount: Object.entries(ownerSpend).find(([k]) => canonicalOwner(k) === scopeOwner)?.[1] ?? 0 } : null

  return (
    <div className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col gap-5 sm:gap-6">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label font-medium text-fg-tertiary">Home · {dateLine} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left in {monthName}</p>
          <h1 className="mt-1 text-[1.75rem] font-semibold leading-[2.125rem] tracking-[-0.02em] text-fg">{greeting(now)}{viewer ? `, ${viewer}` : ''}</h1>
          <p role="status" className="mt-1 text-label text-fg-tertiary">{refreshing ? 'Refreshing your finances…' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}</p>
        </div>
        <div className="flex shrink-0 flex-col-reverse items-end gap-2 sm:flex-row sm:items-center">
          {viewer && (
            <Segmented ariaLabel="Whose view" size="sm" value={scope} onChange={setScope}
              options={[{ value: 'you', label: 'You' }, { value: 'together', label: 'Together' }]} />
          )}
          <button type="button" aria-label="Refresh" title="Refresh" onClick={refreshAll} disabled={refreshing}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-fg-secondary hover:bg-surface-2 hover:text-fg disabled:opacity-50">
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>
      </header>

      {summaryQ.error && <p role="alert" className="rounded-xl border border-warning/30 bg-warning-bg p-3 text-sm text-fg">Could not refresh your finances. Showing the last successful update{updatedAt ? ` from ${updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}.</p>}

      <MonthProjectionCard
        projection={summary.month_projection}
        westPlan={westPlan}
        monthLabel={monthName}
        monthEndLabel={formatDateShort(parseLocalDateKey(monthEndKey(month)))}
        dayOfMonth={cm.day_of_month}
        daysInMonth={cm.days_in_month}
        ownerSpend={ownerSpend}
        highlightOwner={scopeOwner}
      />

      {/* Mobile: one column in priority order; desktop: two columns. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-1"><DailySpendingPlan summary={summary} westTarget={westPlan?.month_target ?? null} ownerSpent={scopedSpend} /></div>
          <div className="order-2"><NeedsAttention items={attention} /></div>
          <div className="order-3">
            <WolffWidget insights={insightsQ.error ? null : insightsQ.data} proactive={proactive} summary={summary} loading={insightsQ.loading} overBudgetShown={attentionCategories.length > 0} />
          </div>
          <div className="order-7"><RecentActivity rows={recentRows} scopeOwner={scopeOwner} /></div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <WestProgressCard plan={westPlan} />
            <BabyProgressCard plan={baby ?? undefined} />
          </div>
          <div className="order-5"><BudgetWatch summary={summary} exclude={attentionCategories} /></div>
          <div className="order-6">
            <Card>
              <SectionHeader title="Next 14 days" subtitle="Bills, income and plan events" action={{ label: 'Manage', href: '/finance/subscriptions' }} />
              {events ? <BillsTimeline events={events} daysAhead={14} maxItems={6} today={today} /> : forecastQ.error ? <p className="py-4 text-sm text-fg-tertiary">Upcoming bills unavailable. Refresh to retry.</p> : <div className="h-24 animate-pulse rounded-lg bg-surface-2" aria-label="Loading upcoming bills" />}
            </Card>
          </div>
        </div>
      </div>

      <details className="group rounded-xl border border-border bg-surface">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="block text-[0.9375rem] font-semibold text-fg">More</span>
            <span className="block text-label text-fg-tertiary">Net worth, emergency runway, planned spend, cash-flow forecast, education fund</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-fg-tertiary transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-4 border-t border-border p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {nw ? (
              <KpiCard icon={Landmark} label="Net worth" href="/finance/investments" value={formatCompact(nw.net_worth)}
                sublabel={<>
                  <span data-money>Assets {formatCompact(nw.total_assets)} · Debts {formatCompact(nw.total_liabilities)}</span>
                  {nwDelta != null && nwDelta !== 0 && <span className={cn('mt-0.5 block', nwDelta > 0 ? 'text-positive' : 'text-negative')} data-money>{formatDelta(nwDelta)} since {nwSince ? formatDateShort(parseLocalDateKey(nwSince)) : 'last month'}</span>}
                </>} />
            ) : (
              <KpiCard icon={Landmark} label="Net worth" href="/finance/investments" value="—" money={false} sublabel={netWorthQ.loading ? 'Loading…' : 'No snapshot yet'} />
            )}
            <KpiCard icon={ShieldCheck} label="Emergency runway" href="/finance/emergency-fund" money={false}
              value={`${ef.months_covered.toFixed(1)} mo`}
              sublabel={<span><span data-money>{formatCompact(ef.current)}</span> reserve · {ef.essentials_basis === 'manual' ? 'manual essentials' : 'of essentials'}</span>} />
            <KpiCard icon={LockKeyhole} label="Planned spend" href="/finance/budget-builder" money={false}
              value={plannedPct != null ? `${plannedPct}%` : '—'}
              sublabel={<span>of income · <span data-money>{formatCompact(summary.cash_flow.fixed_commitments)}</span> budgeted</span>} />
          </div>
          <Card>
            <SectionHeader title="Scheduled cash flow" subtitle="Known income, subscriptions, MSI and debt — next 30 days" />
            {forecastQ.data ? <ForecastChart data={forecastQ.data.series} height={220} /> : <p className="py-8 text-center text-sm text-fg-tertiary">{forecastQ.error ? 'Forecast unavailable' : 'Loading forecast…'}</p>}
          </Card>
          {education && <div className="grid gap-4 lg:grid-cols-2"><EducationFundCard education={education} /></div>}
        </div>
      </details>

      <InstallPrompt />
    </div>
  )
}
