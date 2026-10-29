'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowRight, Building2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { useFinanceData } from '@/hooks/use-finance-data'
import { PageTransition } from '@/components/page-transition'
import { Page, PageHeader } from '@/components/ui/page'
import { Card, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import { Segmented } from '@/components/ui/segmented'
import { StatusPill } from '@/components/ui/status-pill'
import { CategoryIcon } from '@/components/ui/category-icon'
import { ErrorState } from '@/components/ui/error-state'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { ChartFigure, ChartGrid, ChartLegend } from '@/components/ui/finance-chart'
import { OwnerBar } from '@/components/finance/owner-dot'
import {
  CHART, chartAnimationProps, chartTooltipProps, chartXAxisMonthProps, chartYAxisMoneyProps,
  describeSeries, moneyTooltipFormatter, monthTick, trimLeadingSparse,
} from '@/lib/chart-theme'
import { categoryColor } from '@/lib/category-icons'
import { addMonthsKey, localDateKey, monthKey, parseLocalDateKey } from '@/lib/dates'
import { fetchLatestNetWorth, netWorthRows, type NetWorthSnapshotRow } from '@/lib/net-worth-rows'
import { formatCompact, formatDateShort, formatMoney, formatMonthLong, formatMonthShort, formatPct } from '@/lib/format'
import { ownerColor } from '@/lib/owners'
import type { Tone } from '@/lib/budget-tone'
import type { FinanceCategory } from '@/lib/finance-types'
import { DEFAULT_CATEGORIES } from '@/lib/finance-utils'

// Reports (UX-10, VIS-14, F15, perf-08): every number answers "for which
// period?". Default is the last full month; the trend charts show the 12
// months leading up to it (or the whole selected range).

type ReportTx = {
  id: string
  type: 'expense' | 'income'
  amount_mxn: number
  category_id: string
  merchant: string | null
  transaction_date: string
  owner: string | null
}

type PeriodMode = 'month' | '6m' | 'ytd' | 'all'

interface InvestmentAudit {
  score: number
  score_label: string
  net_worth: { total: number; by_class: Record<string, number> }
  findings: Array<{ severity: string; title: string; detail: string }>
}

interface WestSnapshot {
  target: number
  months_to_delivery: number
  projected_at_delivery?: { total_projected: number; gap: number }
}

const TX_COLUMNS = 'id,type,amount_mxn,category_id,merchant,transaction_date,owner'

const PERIOD_OPTIONS = [
  { value: 'month' as const, label: 'Month' },
  { value: '6m' as const, label: '6 mo', ariaLabel: 'Last 6 months' },
  { value: 'ytd' as const, label: 'YTD', ariaLabel: 'Year to date' },
  { value: 'all' as const, label: 'All', ariaLabel: 'All time' },
]


async function loadReportData(): Promise<{ categories: FinanceCategory[]; transactions: ReportTx[] }> {
  const [catRes, transactions] = await Promise.all([
    supabase.from('finance_categories').select('*').order('sort_order'),
    fetchAllRows<ReportTx>(
      (from, to) => supabase.from('finance_transactions').select(TX_COLUMNS)
        .order('transaction_date', { ascending: true }).order('id', { ascending: true }).range(from, to),
      1000, 20000, true,
    ),
  ])
  const categories = catRes.data && catRes.data.length > 0 ? (catRes.data as FinanceCategory[]) : DEFAULT_CATEGORIES
  return { categories, transactions }
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json() as Promise<T>
}

/** One-line failure for a secondary card: says what's missing, offers Retry, takes little room. */
function InlineLoadError({ title, onRetry, className }: { title: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 ${className ?? ''}`}>
      <span className="flex min-w-0 items-center gap-2 text-sm text-fg-secondary">
        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
        <span>{title}</span>
      </span>
      <Button size="sm" variant="secondary" onClick={onRetry}><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />Retry</Button>
    </div>
  )
}

function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  for (let m = from; m <= to && months.length < 600; m = addMonthsKey(m, 1)) months.push(m)
  return months
}

function sumBy(rows: ReportTx[], type: ReportTx['type']): number {
  return rows.reduce((s, t) => (t.type === type ? s + (Number(t.amount_mxn) || 0) : s), 0)
}

export default function ReportsClient() {
  const currentMonth = monthKey(new Date())
  const lastFullMonth = addMonthsKey(currentMonth, -1)
  const [mode, setMode] = useState<PeriodMode>('month')
  const [selectedMonth, setSelectedMonth] = useState(lastFullMonth)

  const { data, error, loading, refresh } = useFinanceData('reports:transactions', loadReportData)
  const { data: investmentAudit, error: auditError } = useFinanceData<InvestmentAudit>(
    'reports:investment-audit', signal => getJson<InvestmentAudit>('/api/finance/audit/investments', signal),
  )
  // The statement reads the same snapshot as Home, so its rows add up to the total.
  const { data: nwSnap, error: nwError, refresh: refreshNetWorth } = useFinanceData<NetWorthSnapshotRow | null>(
    'reports:net-worth', signal => fetchLatestNetWorth(signal),
  )
  const { data: west, error: westError, refresh: refreshWest } = useFinanceData<WestSnapshot>(
    'reports:west', signal => getJson<WestSnapshot>('/api/finance/investments/west-projection', signal),
  )

  const transactions = useMemo(() => data?.transactions ?? [], [data])
  const categories = useMemo(() => data?.categories ?? [], [data])
  const firstMonth = transactions.length > 0 ? transactions[0].transaction_date.slice(0, 7) : currentMonth

  // ── Period ──────────────────────────────────────────────────────────
  const period = useMemo(() => {
    const yearStart = `${currentMonth.slice(0, 4)}-01`
    switch (mode) {
      case 'month': {
        const partial = selectedMonth === currentMonth
        return {
          from: selectedMonth, to: selectedMonth,
          label: `${formatMonthLong(selectedMonth)}${partial ? ' (so far)' : ''}`,
          short: formatMonthLong(selectedMonth, { short: true }),
        }
      }
      case '6m': {
        const from = addMonthsKey(currentMonth, -6)
        const label = `${formatMonthLong(from, { short: true })} – ${formatMonthLong(lastFullMonth, { short: true })}`
        return { from, to: lastFullMonth, label, short: 'Last 6 mo' }
      }
      case 'ytd':
        return { from: yearStart, to: currentMonth, label: `${currentMonth.slice(0, 4)} to date`, short: `${currentMonth.slice(0, 4)} YTD` }
      case 'all':
        return { from: firstMonth, to: currentMonth, label: `All time · since ${formatMonthLong(firstMonth, { short: true })}`, short: 'All time' }
    }
  }, [mode, selectedMonth, currentMonth, lastFullMonth, firstMonth])

  const inPeriod = useCallback(
    (t: ReportTx) => { const m = t.transaction_date.slice(0, 7); return m >= period.from && m <= period.to },
    [period],
  )
  const periodTx = useMemo(() => transactions.filter(inPeriod), [transactions, inPeriod])
  const periodMonths = Math.max(1, monthRange(period.from, period.to).length)

  // ── KPIs ────────────────────────────────────────────────────────────
  const income = sumBy(periodTx, 'income')
  const spending = sumBy(periodTx, 'expense')
  const net = income - spending
  const savingsRate = income > 0 ? (net / income) * 100 : null

  // A month in progress is compared with the same days of the previous month,
  // not the whole of it — otherwise spending always looks "down".
  const partialMonth = mode === 'month' && selectedMonth === currentMonth
  const asOfDay = partialMonth ? Number(localDateKey().slice(8, 10)) : null
  const previous = useMemo(() => {
    if (mode !== 'month') return null
    const prev = addMonthsKey(selectedMonth, -1)
    if (prev < firstMonth) return null
    const rows = transactions.filter(t => t.transaction_date.startsWith(prev) && (asOfDay == null || Number(t.transaction_date.slice(8, 10)) <= asOfDay))
    return { month: prev, income: sumBy(rows, 'income'), spending: sumBy(rows, 'expense') }
  }, [mode, selectedMonth, transactions, firstMonth, asOfDay])

  const deltaTone = (delta: number, goodWhenUp: boolean): Tone =>
    Math.abs(delta) < 1 ? 'neutral' : (delta > 0) === goodWhenUp ? 'positive' : 'negative'

  // ── Trend window: 12 months up to the selected month, or the whole range ──
  const trendMonths = useMemo(() => {
    const to = mode === 'month' ? selectedMonth : period.to
    const from = mode === 'month' ? addMonthsKey(selectedMonth, -11) : period.from
    return monthRange(from < firstMonth ? firstMonth : from, to)
  }, [mode, selectedMonth, period, firstMonth])

  const monthlyData = useMemo(() => {
    const map = new Map(trendMonths.map(m => [m, { month: m, income: 0, spending: 0 }]))
    for (const t of transactions) {
      const row = map.get(t.transaction_date.slice(0, 7))
      if (!row) continue
      if (t.type === 'income') row.income += Number(t.amount_mxn) || 0
      else row.spending += Number(t.amount_mxn) || 0
    }
    return trimLeadingSparse(Array.from(map.values()), ['income', 'spending'])
  }, [transactions, trendMonths])
  // One month axis for every trend chart, so they start together.
  const chartMonths = useMemo(() => monthlyData.map(r => r.month), [monthlyData])

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
  const sortIndex = useMemo(() => new Map(categories.map((c, i) => [c.id, i])), [categories])

  const trend = useMemo(() => {
    const window = new Set(chartMonths)
    const totals = new Map<string, number>()
    for (const t of transactions) {
      if (t.type !== 'expense' || !window.has(t.transaction_date.slice(0, 7))) continue
      totals.set(t.category_id, (totals.get(t.category_id) || 0) + (Number(t.amount_mxn) || 0))
    }
    // Top 6 by spend, then drawn in category sort order so colours stay put.
    const top = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id)
      .sort((a, b) => (sortIndex.get(a) ?? 99) - (sortIndex.get(b) ?? 99))
    const series = top.map((id, i) => ({ id, key: `c${i}`, name: catById.get(id)?.name || 'Other', color: categoryColor(i) }))
    const keyOf = new Map(series.map(s => [s.id, s.key]))
    const rows = new Map(chartMonths.map(m => [m, Object.fromEntries([['month', m], ...series.map(s => [s.key, 0])]) as Record<string, number | string>]))
    for (const t of transactions) {
      const key = keyOf.get(t.category_id)
      const row = key && t.type === 'expense' ? rows.get(t.transaction_date.slice(0, 7)) : undefined
      if (row && key) row[key] = (row[key] as number) + (Number(t.amount_mxn) || 0)
    }
    return { series, rows: series.length ? Array.from(rows.values()) : [] }
  }, [transactions, chartMonths, catById, sortIndex])

  const topMerchants = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>()
    for (const t of periodTx) {
      if (t.type !== 'expense' || !t.merchant) continue
      const cur = map.get(t.merchant) || { total: 0, count: 0 }
      cur.total += Number(t.amount_mxn) || 0
      cur.count++
      map.set(t.merchant, cur)
    }
    return Array.from(map.entries()).map(([merchant, d]) => ({ merchant, ...d })).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [periodTx])

  const ownerMonthly = useMemo(() => {
    const months = chartMonths.slice(-6)
    const map = new Map(months.map(m => [m, { month: m, a: 0, b: 0 }]))
    for (const t of transactions) {
      const row = t.type === 'expense' ? map.get(t.transaction_date.slice(0, 7)) : undefined
      if (!row) continue
      if (ownersEqual(t.owner, OWNERS[0])) row.a += Number(t.amount_mxn) || 0
      else if (ownersEqual(t.owner, OWNERS[1])) row.b += Number(t.amount_mxn) || 0
    }
    return Array.from(map.values()).some(r => r.a + r.b > 0) ? Array.from(map.values()) : []
  }, [transactions, chartMonths])

  const ownerByCategory = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon: string; a: number; b: number }>()
    for (const t of periodTx) {
      if (t.type !== 'expense') continue
      const cat = catById.get(t.category_id)
      const cur = map.get(t.category_id) || { id: t.category_id, name: cat?.name || 'Other', icon: cat?.icon || '', a: 0, b: 0 }
      if (ownersEqual(t.owner, OWNERS[0])) cur.a += Number(t.amount_mxn) || 0
      else if (ownersEqual(t.owner, OWNERS[1])) cur.b += Number(t.amount_mxn) || 0
      map.set(t.category_id, cur)
    }
    return Array.from(map.values()).filter(c => c.a + c.b > 0).sort((x, y) => (y.a + y.b) - (x.a + x.b)).slice(0, 8)
  }, [periodTx, catById])

  const animation = chartAnimationProps()

  if (loading) {
    return (
      <Page aria-busy="true">
        <div className="h-9 w-40 rounded-lg skeleton" />
        <div className="h-28 rounded-xl skeleton" />
        <div className="h-72 rounded-xl skeleton" />
      </Page>
    )
  }

  const picker = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented ariaLabel="Report period" size="sm" options={PERIOD_OPTIONS} value={mode} onChange={setMode} />
      {mode === 'month' && (
        <div className="flex items-center gap-1" role="group" aria-label="Month">
          <button
            type="button"
            aria-label="Previous month"
            disabled={selectedMonth <= firstMonth}
            onClick={() => setSelectedMonth(m => addMonthsKey(m, -1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <span className="min-w-[5.5rem] text-center text-sm font-medium text-fg" aria-live="polite">{period.short}</span>
          <button
            type="button"
            aria-label="Next month"
            disabled={selectedMonth >= currentMonth}
            onClick={() => setSelectedMonth(m => addMonthsKey(m, 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-2 hover:text-fg disabled:opacity-40"
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )

  const perMonthHint = (n: number) => (periodMonths > 1 ? `avg ${formatCompact(n / periodMonths)}/mo` : period.short)
  const prevLabel = previous ? `${formatMonthShort(previous.month, { withYear: false })}${asOfDay != null ? ` 1–${asOfDay}` : ''}` : ''
  // One precision per KPI row: always compact, always signed.
  const delta = (n: number) => formatCompact(n, { sign: 'always' })
  const tone = (n: number, goodWhenUp: boolean): Tone => (previous ? deltaTone(n, goodWhenUp) : 'neutral')
  const nwTotal = nwSnap?.net_worth ?? 0
  const findings = investmentAudit?.findings.filter(f => f.severity !== 'green').slice(0, 3) ?? []
  const westProjected = west?.projected_at_delivery?.total_projected
  // Non-breaking spaces keep "Nov '25" from wrapping apart at phone width.
  const nb = (m: string) => formatMonthShort(m, { withYear: true }).replace(/ /g, '\u00a0')
  const trendLabel = monthlyData.length > 0 ? `${nb(monthlyData[0].month)}\u00a0–\u00a0${nb(monthlyData[monthlyData.length - 1].month)}` : ''

  return (
    <PageTransition>
      <Page>
        <PageHeader
          title="Reports"
          description="Financial trends and analytics"
          meta={<span data-testid="report-period">{period.label}</span>}
          actions={picker}
        />

        {error && !data ? (
          <Card><ErrorState title="Couldn't load your transactions" body="Reports need the full ledger. Nothing is shown rather than partial totals." onRetry={() => { void refresh() }} /></Card>
        ) : (
          <>
            {/* KPIs: neutral values, colour only on the comparison */}
            <Card>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4 lg:divide-x lg:divide-border [&>*]:lg:pl-5 [&>*:first-child]:lg:pl-0">
                <Stat
                  label="Income"
                  money
                  value={formatMoney(income)}
                  delta={previous ? delta(income - previous.income) : undefined}
                  tone={tone(income - (previous?.income ?? 0), true)}
                  hint={previous ? `vs ${prevLabel}` : perMonthHint(income)}
                />
                <Stat
                  label="Spending"
                  money
                  value={formatMoney(spending)}
                  delta={previous ? delta(spending - previous.spending) : undefined}
                  tone={tone(spending - (previous?.spending ?? 0), false)}
                  hint={previous ? `vs ${prevLabel}` : perMonthHint(spending)}
                />
                <Stat
                  label="Net saved"
                  money
                  value={formatMoney(net)}
                  hint={net < 0 ? 'Spent more than earned' : period.short}
                  tone={net < 0 ? 'negative' : 'neutral'}
                />
                <Stat
                  label="Savings rate"
                  value={savingsRate == null ? '—' : formatPct(savingsRate)}
                  hint={savingsRate == null ? 'No income recorded' : period.short}
                />
              </div>
            </Card>

            {/* Income vs Spending */}
            <Card>
              <CardHeader
                title="Income vs Spending"
                description={trendLabel ? `Monthly · ${trendLabel}` : 'Monthly'}
                action={<ChartLegend items={[{ label: 'Income', color: CHART.series.income }, { label: 'Expenses', color: CHART.series.spend }]} />}
              />
              {monthlyData.length === 0 ? (
                <ErrorState variant="empty" compact title="No transactions in this range" body="Pick another period to see the trend." />
              ) : (
                <ChartFigure
                  summary={`${describeSeries('Income', monthlyData.map(r => ({ x: r.month, y: r.income })))}. ${describeSeries('Spending', monthlyData.map(r => ({ x: r.month, y: r.spending })))}.`}
                  table={{ columns: ['Month', 'Income', 'Spending'], rows: monthlyData.map(r => [formatMonthLong(r.month, { short: true }), formatMoney(r.income), formatMoney(r.spending)]) }}
                >
                  <div className="h-56 sm:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <ChartGrid />
                        <XAxis dataKey="month" {...chartXAxisMonthProps} interval="preserveStartEnd" minTickGap={16} />
                        <YAxis {...chartYAxisMoneyProps} />
                        <Tooltip {...chartTooltipProps} labelFormatter={l => formatMonthLong(String(l))} formatter={moneyTooltipFormatter} />
                        <Line type="linear" dataKey="income" name="Income" stroke={CHART.series.income} strokeWidth={CHART.strokeWidth} dot={monthlyData.length <= 2} {...animation} />
                        <Line type="linear" dataKey="spending" name="Spending" stroke={CHART.series.spend} strokeWidth={CHART.strokeWidth} dot={monthlyData.length <= 2} {...animation} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ChartFigure>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Category Trends */}
              <Card>
                <CardHeader title="Category Trends" description={`Top ${trend.series.length || ''} spending categories by month`.replace('Top  ', 'Top ')} />
                {trend.rows.length === 0 ? (
                  <ErrorState variant="empty" compact title="No spending in this range" body="Category trends appear once expenses are recorded." />
                ) : (
                  <>
                    <ChartLegend className="mb-2 justify-start" items={trend.series.map(s => ({ label: s.name, color: s.color, kind: 'area' as const }))} />
                    <ChartFigure summary={`Stacked monthly spending for ${trend.series.map(s => s.name).join(', ')}`}>
                      <div className="h-56 sm:h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={trend.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <ChartGrid />
                            <XAxis dataKey="month" {...chartXAxisMonthProps} interval="preserveStartEnd" minTickGap={16} />
                            <YAxis {...chartYAxisMoneyProps} />
                            <Tooltip {...chartTooltipProps} labelFormatter={l => formatMonthLong(String(l))} formatter={moneyTooltipFormatter} />
                            {trend.series.map(s => (
                              <Area key={s.key} type="linear" dataKey={s.key} name={s.name} stackId="1" stroke={s.color} fill={s.color} fillOpacity={0.22} strokeWidth={1.5} {...animation} />
                            ))}
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </ChartFigure>
                  </>
                )}
              </Card>

              {/* Top merchants for the period */}
              <Card>
                <CardHeader title="Top Merchants" description={period.label} />
                {topMerchants.length === 0 ? (
                  <ErrorState variant="empty" compact title="No merchant spending" body="Nothing recorded with a merchant in this period." />
                ) : (
                  <ol className="space-y-3">
                    {topMerchants.map((m, i) => (
                      <li key={m.merchant} className="flex items-center gap-3">
                        <span className="w-5 shrink-0 text-right text-label font-medium text-fg-tertiary tabular-nums">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate text-sm font-medium text-fg">{m.merchant}</p>
                            <span className="num shrink-0 text-sm font-semibold text-fg" data-money>{formatMoney(m.total)}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-3">
                            <div className="h-1.5 flex-1 rounded-full bg-surface-3" aria-hidden="true">
                              <div className="h-1.5 rounded-full bg-fg-tertiary" style={{ width: `${(m.total / topMerchants[0].total) * 100}%` }} />
                            </div>
                            <span className="w-14 shrink-0 text-right text-label text-fg-tertiary">{m.count} {m.count === 1 ? 'txn' : 'txns'}</span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>

            {/* By owner */}
            <section aria-labelledby="by-owner" className="flex flex-col gap-4">
              <h2 id="by-owner" className="text-lg font-semibold text-fg">By Owner</h2>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
                <Card>
                  <CardHeader
                    title="Monthly Spending Comparison"
                    description={ownerMonthly.length ? `${nb(ownerMonthly[0].month)} – ${nb(ownerMonthly[ownerMonthly.length - 1].month)}` : 'Last 6 months'}
                    action={<ChartLegend items={[{ label: OWNERS[0], color: ownerColor(OWNERS[0]), kind: 'bar' }, { label: OWNERS[1], color: ownerColor(OWNERS[1]), kind: 'bar' }]} />}
                  />
                  {ownerMonthly.length === 0 ? (
                    <ErrorState variant="empty" compact title="No owner-tagged spending" body="Spending tagged to a person shows here." />
                  ) : (
                    <ChartFigure summary={`${describeSeries(OWNERS[0], ownerMonthly.map(r => ({ x: r.month, y: r.a })))}. ${describeSeries(OWNERS[1], ownerMonthly.map(r => ({ x: r.month, y: r.b })))}.`}>
                      <div className="h-52 sm:h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={ownerMonthly} barCategoryGap={CHART.bar.categoryGap} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <ChartGrid />
                            <XAxis dataKey="month" {...chartXAxisMonthProps} tickFormatter={monthTick} />
                            <YAxis {...chartYAxisMoneyProps} />
                            <Tooltip {...chartTooltipProps} cursor={{ fill: 'hsl(var(--surface-2))' }} labelFormatter={l => formatMonthLong(String(l))} formatter={moneyTooltipFormatter} />
                            <Bar dataKey="a" name={OWNERS[0]} fill={ownerColor(OWNERS[0])} radius={CHART.bar.radius} maxBarSize={CHART.bar.maxBarSize} {...animation} />
                            <Bar dataKey="b" name={OWNERS[1]} fill={ownerColor(OWNERS[1])} radius={CHART.bar.radius} maxBarSize={CHART.bar.maxBarSize} {...animation} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </ChartFigure>
                  )}
                </Card>

                <Card>
                  <CardHeader title="Category Breakdown by Person" description={period.label} />
                  {ownerByCategory.length === 0 ? (
                    <ErrorState variant="empty" compact title="No owner-tagged spending" body="Spending tagged to a person shows here." />
                  ) : (
                    <ul className="space-y-3.5">
                      {ownerByCategory.map(cat => (
                        <li key={cat.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <CategoryIcon name={cat.name} emoji={cat.icon} colorIndex={sortIndex.get(cat.id) ?? 0} size={24} />
                              <span className="truncate text-fg">{cat.name}</span>
                            </span>
                            <span className="num shrink-0 font-medium text-fg" data-money>{formatMoney(cat.a + cat.b)}</span>
                          </div>
                          <OwnerBar bernardo={cat.a} laura={cat.b} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </section>

            {/* Investments & net worth (live, from the audit + WEST endpoints — each card stands alone) */}
            {(nwSnap || investmentAudit || west || nwError || auditError || westError) && (
              <section aria-labelledby="investments" className="flex flex-col gap-4">
                <h2 id="investments" className="text-lg font-semibold text-fg">Investments & Net Worth</h2>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
                  {nwSnap ? (
                    <Card>
                      <CardHeader title="Net Worth Statement" description={`Snapshot ${formatDateShort(parseLocalDateKey(nwSnap.snapshot_date))} · the same figure as Home`} />
                      <ul className="space-y-2.5 text-sm">
                        {netWorthRows(nwSnap).map(item => (
                          <li key={item.key} className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2 text-fg-secondary">
                              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
                              <span className="min-w-0">
                                <span className="block truncate">{item.label}</span>
                                {item.note && <span className="block text-label text-fg-tertiary">{item.note}</span>}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="num block font-medium text-fg" data-money>{formatMoney(item.value)}</span>
                              <span className="num block text-label text-fg-tertiary">{(nwSnap.total_assets ?? 0) > 0 ? `${formatPct((item.value / nwSnap.total_assets!) * 100, { decimals: 1 })} of assets` : '—'}</span>
                            </span>
                          </li>
                        ))}
                        {(nwSnap.total_liabilities ?? 0) > 0 && (
                          <li className="flex items-center justify-between gap-3 text-fg-secondary">
                            <span className="pl-4">Debts & MSI owed</span>
                            <span className="num font-medium text-fg" data-money>−{formatMoney(nwSnap.total_liabilities ?? 0)}</span>
                          </li>
                        )}
                        <li className="flex justify-between gap-3 border-t border-border pt-2.5 font-semibold text-fg">
                          <span>Total net worth</span>
                          <span className="num" data-money>{formatMoney(nwTotal)}</span>
                        </li>
                      </ul>
                    </Card>
                  ) : nwError && westError ? (
                    <InlineLoadError className="lg:col-span-2" title="Couldn't load net worth or the WEST projection" onRetry={() => { void refreshNetWorth(); void refreshWest() }} />
                  ) : nwError ? (
                    <InlineLoadError title="Couldn't load net worth" onRetry={() => { void refreshNetWorth() }} />
                  ) : null}

                  <div className="flex flex-col gap-4">
                    {west && westProjected != null && west.target > 0 ? (
                      <Card data-testid="west-card">
                        <CardHeader
                          title={<span className="inline-flex items-center gap-2"><Building2 aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />WEST apartment</span>}
                          description={`Delivery in ${west.months_to_delivery} months`}
                          action={<StatusPill tone={westProjected >= west.target ? 'positive' : 'warning'}>{formatPct((westProjected / west.target) * 100)} at delivery</StatusPill>}
                        />
                        <ProgressBar value={westProjected} max={west.target} tone={westProjected >= west.target ? 'positive' : 'warning'} label="WEST funding projected at delivery" />
                        <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-label text-fg-secondary">
                          <span>Projected <span className="num font-medium text-fg" data-money>{formatCompact(westProjected)}</span> of <span className="num" data-money>{formatCompact(west.target)}</span></span>
                          {(west.projected_at_delivery?.gap ?? 0) > 0 && <span>Gap <span className="num font-medium text-fg" data-money>{formatCompact(west.projected_at_delivery!.gap)}</span></span>}
                        </div>
                        <Link href="/finance/investments?tab=Real%20Estate" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-info hover:underline sm:min-h-0">
                          Open the WEST plan <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                        </Link>
                      </Card>
                    ) : westError && !nwError ? (
                      <InlineLoadError title="Couldn't load the WEST projection" onRetry={() => { void refreshWest() }} />
                    ) : null}
                    {findings.length > 0 && (
                      <Card>
                        <CardHeader
                          title="Top Audit Findings"
                          action={<Link href="/finance/audit" className="inline-flex min-h-11 items-center text-sm font-medium text-info hover:underline sm:min-h-0">View all</Link>}
                        />
                        <ul className="space-y-3">
                          {findings.map((f, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <StatusPill tone={f.severity === 'red' ? 'negative' : 'warning'} className="mt-0.5">{f.severity === 'red' ? 'Act' : 'Watch'}</StatusPill>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight text-fg">{f.title}</p>
                                <p className="mt-0.5 line-clamp-2 text-label text-fg-secondary">{f.detail}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </Card>
                    )}
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </Page>
    </PageTransition>
  )
}
