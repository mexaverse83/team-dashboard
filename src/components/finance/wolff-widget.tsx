'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, MessageCircle, Sparkles } from 'lucide-react'
import { PushToggle } from '@/components/finance/push-toggle'
import { GlassCard } from '@/components/ui/glass-card'

interface Insight {
  type: string
  icon: string
  title: string
  detail: string
  priority: string
  category?: string
}

export function WolffWidget() {
  const [directive, setDirective] = useState<Insight | null>(null)
  const [week, setWeek] = useState<Insight | null>(null)
  const [watch, setWatch] = useState<Insight | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance/insights', {
      headers: { 'x-api-key': process.env.NEXT_PUBLIC_FINANCE_API_KEY || '' },
      cache: 'no-store',
    })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        const all: Insight[] = data?.insights || []
        const category = (insight: Insight) => (insight.category || '').toUpperCase()
        const today = all.find(insight => category(insight) === 'WIDGET')
        const weekly = all.find(insight => category(insight) === 'WEEK' && insight.type === 'recommendation')
          || all.find(insight => category(insight) === 'WEEK')
        const secondary = all.find(insight =>
          insight.priority === 'high' && !['WIDGET', 'WEEK', 'PROJECTION'].includes(category(insight)))
          || all.find(insight => !['WIDGET', 'WEEK', 'PROJECTION'].includes(category(insight)))
        setDirective(today || secondary || null)
        setWeek(weekly || null)
        setWatch(secondary && secondary !== today ? secondary : null)
        setGeneratedAt(data?.generated_at || null)
        setStale(Boolean(data?.stale))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (!loading && !directive && !week) return null

  const freshness = generatedAt
    ? new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <GlassCard className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[hsl(var(--border-subtle))] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--brand))] text-sm text-white shadow-[0_8px_20px_-12px_hsl(var(--brand))]">W</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Wolff&apos;s move</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700">
                <Sparkles className="h-2.5 w-2.5" /> AI brief
              </span>
            </div>
            <p className={`truncate text-[10px] ${stale ? 'text-amber-700' : 'text-[hsl(var(--text-tertiary))]'}`}>
              {stale ? 'Refresh pending' : 'Based on live household data'}{freshness ? ` · ${freshness}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline"><PushToggle /></span>
          <Link href="/finance/ask" aria-label="Ask Wolff" className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(var(--brand))] p-2.5 text-xs font-semibold text-white hover:bg-[hsl(var(--brand-glow))] sm:px-3 sm:py-2">
            <MessageCircle className="h-3.5 w-3.5" /><span className="hidden sm:inline">Ask Wolff</span>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          <div className="h-5 w-2/3 animate-pulse rounded bg-[hsl(var(--bg-elevated))]" />
          <div className="h-3 w-full animate-pulse rounded bg-[hsl(var(--bg-elevated))]" />
        </div>
      ) : (
        <div className="grid md:grid-cols-[1.35fr_1fr]">
          <div className="p-4 sm:p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[hsl(var(--brand))]">Do this today</p>
            <p className="mt-1 text-base font-semibold leading-snug sm:text-lg">
              {directive?.icon && <span className="mr-1.5">{directive.icon}</span>}{directive?.title || 'Your brief is being prepared'}
            </p>
            {directive?.detail && <p className="mt-1.5 max-h-[3.75rem] overflow-hidden text-xs leading-relaxed text-[hsl(var(--text-secondary))] sm:max-h-none">{directive.detail}</p>}
          </div>

          <div className="border-t border-[hsl(var(--border-subtle))] bg-[hsl(var(--brand)/0.035)] p-4 sm:p-5 md:border-l md:border-t-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[hsl(var(--text-tertiary))]">This week</p>
            <p className="mt-1 text-sm font-semibold leading-snug">{week?.title || watch?.title || 'Stay on the monthly plan'}</p>
            <p className="mt-1 max-h-10 overflow-hidden text-[11px] leading-relaxed text-[hsl(var(--text-secondary))] sm:max-h-none">
              {week?.detail || watch?.detail || 'Wolff will update this after the next daily analysis.'}
            </p>
            <Link href="/finance/insights" className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(var(--brand))] hover:underline">
              Full analysis <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </GlassCard>
  )
}
