'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Target, Lightbulb, Trophy, TrendingUp, Sparkles } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { cn } from '@/lib/utils'

interface Insight {
  type: 'alert' | 'recommendation' | 'win' | 'forecast' | 'pattern' | 'saving'
  icon: string
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  category?: string
  savings_amount?: number
  effort?: 'easy' | 'medium' | 'hard'
}

interface BudgetVsActual {
  category: string
  icon: string
  spent: number
  budget: number
  pct_used: number
  over_under: number
  status: 'ok' | 'warning' | 'over'
  daily_pace: number
  budget_daily_pace: number
  pace_vs_budget_pct: number
  projected_month_total: number
}

interface MsiItem {
  name: string
  merchant: string
  monthly_payment: number
  payments_remaining: number
  end_date: string
  total_remaining: number
}

interface GoalFunding {
  total_monthly_needed: number
  discretionary_available: number
  gap: number
  fully_funded: boolean
}

interface SummaryData {
  current_month?: {
    month: string
    day_of_month: number
    days_in_month: number
    month_progress_pct: number
    total_spent: number
    budget_vs_actual: BudgetVsActual[]
  }
  msi_timeline?: MsiItem[]
  goal_funding?: GoalFunding
  cash_flow?: {
    monthly_income: number
    fixed_commitments: number
    discretionary_available: number
  }
}

function formatMXN(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function EffortBadge({ effort }: { effort: string }) {
  const colors: Record<string, string> = {
    easy: 'bg-emerald-500/10 text-emerald-500',
    medium: 'bg-yellow-500/10 text-yellow-500',
    hard: 'bg-red-500/10 text-red-500',
  }
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', colors[effort] || colors.medium)}>
      {effort === 'easy' ? '🟢 Easy' : effort === 'medium' ? '🟡 Medium' : '🔴 Hard'}
    </span>
  )
}

function StatusBadge({ status, pct }: { status: string; pct: number }) {
  if (status === 'over') return <span className="text-xs font-semibold text-red-500">🔴 {pct}%</span>
  if (status === 'warning') return <span className="text-xs font-semibold text-yellow-500">⚠️ {pct}%</span>
  return <span className="text-xs font-semibold text-emerald-500">✅ {pct}%</span>
}

function PaceBadge({ pct }: { pct: number }) {
  if (pct > 20) return <span className="text-xs font-medium text-red-500">🔴 {pct}% over pace</span>
  if (pct > 0) return <span className="text-xs font-medium text-yellow-500">⚠️ {pct}% over pace</span>
  if (pct < -10) return <span className="text-xs font-medium text-emerald-500">✅ {Math.abs(pct)}% under pace</span>
  return <span className="text-xs font-medium text-[hsl(var(--text-tertiary))]">📊 On pace</span>
}

export default function InsightsClient() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  const [stale, setStale] = useState(false)
  const [showRawData, setShowRawData] = useState(true)

  const fetchAll = async (refresh = false) => {
    if (refresh) setGenerating(true)
    else setLoading(true)
    setError(null)
    try {
      const [insightsRes, summaryRes] = await Promise.all([
        fetch(`/api/finance/insights${refresh ? '?refresh=true' : ''}`),
        fetch('/api/finance/summary?months=3'),
      ])

      if (!insightsRes.ok) {
        const data = await insightsRes.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${insightsRes.status}`)
      }

      const insightsData = await insightsRes.json()
      setInsights(insightsData.insights || [])
      setGeneratedAt(insightsData.generated_at)
      setCached(insightsData.cached || false)
      setStale(insightsData.stale || false)

      if (summaryRes.ok) {
        const summaryData = await summaryRes.json()
        setSummary(summaryData)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load insights')
    } finally {
      setLoading(false)
      setGenerating(false)
    }
  }

  const handleRefresh = () => {
    if (!confirm('Generate fresh AI insights? This uses API tokens. Insights are cached for 24 hours.')) return
    fetchAll(true)
  }

  useEffect(() => { fetchAll() }, [])

  const alerts = insights.filter(i => i.type === 'alert')
  const recommendations = insights.filter(i => i.type === 'recommendation' || i.type === 'saving')
  const wins = insights.filter(i => i.type === 'win')
  const forecasts = insights.filter(i => i.type === 'forecast')
  const patterns = insights.filter(i => i.type === 'pattern')

  const bva = summary?.current_month?.budget_vs_actual || []
  const msiTimeline = summary?.msi_timeline || []
  const goalFunding = summary?.goal_funding

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) }
    catch { return iso }
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl">🐺</span>
              <h1 className="text-2xl font-bold tracking-tight">Daily Brief</h1>
            </div>
            <p className="text-sm text-[hsl(var(--text-tertiary))] mt-1">
              {generatedAt ? formatTime(generatedAt) : 'No insights yet'} 
              {cached && !stale && ' · Cached'}
              {stale && ' · Stale (>24h old)'}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading || generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] text-xs font-medium hover:bg-[hsl(var(--bg-elevated))] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', generating && 'animate-spin')} />
            {generating ? 'Generating...' : 'Generate'}
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-6">
            <div className="rounded-xl border border-[hsl(var(--border))] p-6 space-y-3">
              <div className="h-3 w-24 bg-[hsl(var(--bg-elevated))] rounded animate-pulse" />
              <div className="h-5 w-3/4 bg-[hsl(var(--bg-elevated))] rounded animate-pulse" />
              <div className="h-3 w-1/2 bg-[hsl(var(--bg-elevated))] rounded animate-pulse" />
            </div>
            <div className="rounded-lg border border-[hsl(var(--border))] p-4 space-y-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex justify-between">
                  <div className="h-3 w-1/4 bg-[hsl(var(--bg-elevated))] rounded animate-pulse" />
                  <div className="h-3 w-1/6 bg-[hsl(var(--bg-elevated))] rounded animate-pulse" />
                </div>
              ))}
            </div>
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-lg border border-[hsl(var(--border))] p-4 flex gap-3">
                <div className="h-7 w-7 bg-[hsl(var(--bg-elevated))] rounded-lg animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/3 bg-[hsl(var(--bg-elevated))] rounded animate-pulse" />
                  <div className="h-3 w-1/3 bg-[hsl(var(--bg-elevated))] rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <GlassCard className="text-center py-12">
            <span className="text-3xl block mb-3">🐺</span>
            <p className="text-sm text-[hsl(var(--text-secondary))]">{error}</p>
            <button onClick={() => fetchAll(true)} className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors">
              Try Again
            </button>
          </GlassCard>
        )}

        {/* Content */}
        {!loading && !error && (
          <div className="space-y-8">
            {/* Hero — top priority insight */}
            {insights[0] && (
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 p-4 sm:p-6">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/20">
                      <Target className="h-4 w-4 text-amber-500" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Today&apos;s Priority</span>
                  </div>
                  <p className="text-lg font-semibold leading-relaxed">{insights[0].title}</p>
                  <p className="text-sm text-[hsl(var(--text-secondary))] mt-2 leading-relaxed">{insights[0].detail}</p>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* BUDGET VS ACTUAL TABLE — WOLFF's #1 request */}
            {/* ══════════════════════════════════════════════════ */}
            {bva.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
                    Budget vs Actual
                    {summary?.current_month && (
                      <span className="ml-2 text-xs font-normal normal-case">
                        — Day {summary.current_month.day_of_month}/{summary.current_month.days_in_month} ({summary.current_month.month_progress_pct}% through month)
                      </span>
                    )}
                  </h2>
                </div>
                <div className="rounded-lg border border-[hsl(var(--border))] overflow-hidden">
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-[hsl(var(--bg-elevated))] text-xs font-medium text-[hsl(var(--text-tertiary))] border-b border-[hsl(var(--border))]">
                    <div className="col-span-3">Category</div>
                    <div className="col-span-2 text-right tabular-nums">Spent</div>
                    <div className="col-span-2 text-right tabular-nums">Budget</div>
                    <div className="col-span-1 text-center">Status</div>
                    <div className="col-span-2 text-right tabular-nums">Projected</div>
                    <div className="col-span-2 text-right">Pace</div>
                  </div>
                  {/* Rows */}
                  {bva.map((row, i) => (
                    <div
                      key={i}
                      className={cn(
                        'grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm border-b border-[hsl(var(--border))] last:border-0',
                        row.status === 'over' && 'bg-red-500/5',
                        row.status === 'warning' && 'bg-yellow-500/5',
                      )}
                    >
                      <div className="col-span-3 font-medium truncate flex items-center gap-1.5">
                        <span className="text-xs">{row.icon}</span>
                        <span className="truncate">{row.category}</span>
                      </div>
                      <div className="col-span-2 text-right tabular-nums">${formatMXN(row.spent)}</div>
                      <div className="col-span-2 text-right tabular-nums text-[hsl(var(--text-tertiary))]">${formatMXN(row.budget)}</div>
                      <div className="col-span-1 text-center"><StatusBadge status={row.status} pct={row.pct_used} /></div>
                      <div className="col-span-2 text-right tabular-nums">
                        <span className={cn(
                          row.projected_month_total > row.budget ? 'text-red-500' : 'text-[hsl(var(--text-secondary))]'
                        )}>
                          ${formatMXN(row.projected_month_total)}
                        </span>
                      </div>
                      <div className="col-span-2 text-right"><PaceBadge pct={row.pace_vs_budget_pct} /></div>
                    </div>
                  ))}
                  {/* Total row */}
                  {summary?.current_month && (
                    <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm bg-[hsl(var(--bg-elevated))] font-semibold">
                      <div className="col-span-3">Total</div>
                      <div className="col-span-2 text-right tabular-nums">${formatMXN(summary.current_month.total_spent)}</div>
                      <div className="col-span-2 text-right tabular-nums text-[hsl(var(--text-tertiary))]">
                        ${formatMXN(bva.reduce((s, b) => s + b.budget, 0))}
                      </div>
                      <div className="col-span-5" />
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Alerts */}
            {alerts.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-3">Active Alerts</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {alerts.map((a, i) => (
                    <div key={i} className={cn('rounded-lg border p-4', a.priority === 'high' ? 'border-red-500/30 bg-red-500/5' : 'border-yellow-500/30 bg-yellow-500/5')}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{a.icon} {a.title}</span>
                      </div>
                      <p className="text-xs text-[hsl(var(--text-tertiary))]">{a.detail}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-3">Recommendations</h2>
                <div className="space-y-3">
                  {recommendations.map((rec, i) => (
                    <div key={i} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))]/50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 shrink-0 mt-0.5">
                          <Lightbulb className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium leading-relaxed">{rec.title}</p>
                            {rec.effort && <EffortBadge effort={rec.effort} />}
                          </div>
                          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1 leading-relaxed">{rec.detail}</p>
                          {rec.savings_amount && rec.savings_amount > 0 && (
                            <p className="text-xs font-medium text-emerald-500 mt-1.5">
                              💰 Potential savings: ${formatMXN(rec.savings_amount)}/mo
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Wins */}
            {wins.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-3">Wins</h2>
                <div className="space-y-2">
                  {wins.map((w, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <Trophy className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">{w.title}</p>
                        <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{w.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Forecasts */}
            {forecasts.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-3">Forecasts</h2>
                <div className="space-y-2">
                  {forecasts.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-[hsl(var(--border))] p-4">
                      <TrendingUp className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium">{f.title}</p>
                        <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{f.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Patterns */}
            {patterns.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-3">Patterns</h2>
                <div className="space-y-2">
                  {patterns.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-[hsl(var(--border))] p-4">
                      <span className="text-sm shrink-0 mt-0.5">🔍</span>
                      <div>
                        <p className="text-sm font-medium">{p.title}</p>
                        <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{p.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ══════════════════════════════════════════════════ */}
            {/* WOLFF'S COMMENTARY — Raw data behind the insights */}
            {/* ══════════════════════════════════════════════════ */}
            {(msiTimeline.length > 0 || goalFunding) && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Wolff&apos;s Commentary
                  </h2>
                  <button
                    onClick={() => setShowRawData(!showRawData)}
                    className="text-xs text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))] transition-colors"
                  >
                    {showRawData ? 'Hide data' : 'Show data'}
                  </button>
                </div>

                {showRawData && (
                  <div className="space-y-4">
                    {/* MSI Payoff Timeline */}
                    {msiTimeline.length > 0 && (
                      <div className="rounded-lg border border-[hsl(var(--border))] p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-3">
                          MSI Payoff Timeline
                        </h3>
                        <div className="space-y-2.5">
                          {msiTimeline.map((m, i) => (
                            <div key={i} className="flex items-center justify-between text-sm">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{m.name}</p>
                                <p className="text-xs text-[hsl(var(--text-tertiary))]">
                                  {m.merchant} · {m.payments_remaining} payments left · ends {m.end_date}
                                </p>
                              </div>
                              <div className="text-right shrink-0 ml-4">
                                <p className="font-medium tabular-nums">${formatMXN(m.monthly_payment)}/mo</p>
                                <p className="text-xs text-emerald-500">
                                  Frees ${formatMXN(m.monthly_payment)}/mo after
                                </p>
                              </div>
                            </div>
                          ))}
                          <div className="pt-2 mt-2 border-t border-[hsl(var(--border))] flex items-center justify-between text-sm font-semibold">
                            <span>Total MSI commitment</span>
                            <span className="tabular-nums">${formatMXN(msiTimeline.reduce((s, m) => s + m.monthly_payment, 0))}/mo</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Goal Funding Gap */}
                    {goalFunding && (
                      <div className={cn(
                        'rounded-lg border p-4',
                        goalFunding.fully_funded
                          ? 'border-emerald-500/20 bg-emerald-500/5'
                          : 'border-yellow-500/20 bg-yellow-500/5'
                      )}>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-3">
                          Goal Funding Analysis
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Goals need</span>
                            <span className="font-medium tabular-nums">${formatMXN(goalFunding.total_monthly_needed)}/mo</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Discretionary available</span>
                            <span className="font-medium tabular-nums">${formatMXN(goalFunding.discretionary_available)}/mo</span>
                          </div>
                          <div className="pt-2 mt-1 border-t border-[hsl(var(--border))]">
                            {goalFunding.fully_funded ? (
                              <div className="flex justify-between text-emerald-500 font-semibold">
                                <span>✅ Fully funded</span>
                                <span className="tabular-nums">+${formatMXN(Math.abs(goalFunding.gap))}/mo surplus</span>
                              </div>
                            ) : (
                              <div className="flex justify-between text-yellow-500 font-semibold">
                                <span>⚠️ Funding gap</span>
                                <span className="tabular-nums">-${formatMXN(goalFunding.gap)}/mo short</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cash Flow Summary */}
                    {summary?.cash_flow && (
                      <div className="rounded-lg border border-[hsl(var(--border))] p-4">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-3">
                          Monthly Cash Flow
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Income</span>
                            <span className="font-medium tabular-nums text-emerald-500">${formatMXN(summary.cash_flow.monthly_income)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Fixed commitments</span>
                            <span className="font-medium tabular-nums text-red-500">-${formatMXN(summary.cash_flow.fixed_commitments)}</span>
                          </div>
                          <div className="pt-2 mt-1 border-t border-[hsl(var(--border))] flex justify-between font-semibold">
                            <span>Discretionary</span>
                            <span className="tabular-nums">${formatMXN(summary.cash_flow.discretionary_available)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Empty insights but has summary data */}
            {insights.length === 0 && bva.length > 0 && (
              <GlassCard className="text-center py-8">
                <span className="text-2xl block mb-2">🐺</span>
                <p className="text-sm text-[hsl(var(--text-secondary))]">
                  AI insights unavailable — check that GEMINI_API_KEY is configured.
                </p>
                <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">
                  Budget vs actual data is still shown above from live data.
                </p>
              </GlassCard>
            )}

            {/* Fully empty — prompt generation */}
            {insights.length === 0 && bva.length === 0 && (
              <GlassCard className="text-center py-16">
                <span className="text-4xl block mb-3">🐺</span>
                <p className="text-sm text-[hsl(var(--text-secondary))] italic mb-4">&ldquo;Hit Generate to get your first daily brief.&rdquo;</p>
                <button
                  onClick={handleRefresh}
                  disabled={generating}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {generating ? 'Generating...' : '🐺 Generate Daily Brief'}
                </button>
              </GlassCard>
            )}
          </div>
        )}
      </div>
    </PageTransition>
  )
}
