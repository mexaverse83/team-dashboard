'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, Target, Lightbulb, Trophy, TrendingUp, ArrowDown } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface Insight {
  type: 'alert' | 'recommendation' | 'win' | 'forecast' | 'pattern' | 'saving'
  icon: string
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  category?: string
}

const effortColors: Record<string, string> = {
  easy: 'bg-emerald-500/10 text-emerald-500',
  medium: 'bg-yellow-500/10 text-yellow-500',
  hard: 'bg-red-500/10 text-red-500',
}

function EffortBadge({ effort }: { effort: string }) {
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', effortColors[effort] || effortColors.medium)}>
      {effort === 'easy' ? '🟢 Easy' : effort === 'medium' ? '🟡 Medium' : '🔴 Hard'}
    </span>
  )
}

export default function InsightsClient() {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [cached, setCached] = useState(false)

  const fetchInsights = async (refresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/finance/insights${refresh ? '?refresh=true' : ''}`, {
        headers: { 'x-api-key': process.env.NEXT_PUBLIC_FINANCE_API_KEY || '' },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setInsights(data.insights || [])
      setGeneratedAt(data.generated_at)
      setCached(data.cached || false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load insights')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchInsights() }, [])

  const alerts = insights.filter(i => i.type === 'alert')
  const recommendations = insights.filter(i => i.type === 'recommendation' || i.type === 'saving')
  const wins = insights.filter(i => i.type === 'win')
  const forecasts = insights.filter(i => i.type === 'forecast')
  const patterns = insights.filter(i => i.type === 'pattern')

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
              {generatedAt ? formatTime(generatedAt) : 'Loading...'} {cached && '· Cached'}
            </p>
          </div>
          <button
            onClick={() => fetchInsights(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--border))] text-xs font-medium hover:bg-[hsl(var(--bg-elevated))] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
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
            <button onClick={() => fetchInsights(true)} className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium transition-colors">
              Try Again
            </button>
          </GlassCard>
        )}

        {/* Content */}
        {!loading && !error && insights.length > 0 && (
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
                          <p className="text-sm font-medium leading-relaxed">{rec.title}</p>
                          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1 leading-relaxed">{rec.detail}</p>
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
                      <span className="text-sm shrink-0 mt-0.5">📊</span>
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
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && insights.length === 0 && (
          <GlassCard className="text-center py-16">
            <span className="text-4xl block mb-3">🐺</span>
            <p className="text-sm text-[hsl(var(--text-secondary))] italic">&ldquo;I&apos;ll have your first brief ready tomorrow morning.&rdquo;</p>
          </GlassCard>
        )}
      </div>
    </PageTransition>
  )
}
