'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, AlertTriangle, ArrowRight, MessageCircle, Sparkles, Target, Wallet } from 'lucide-react'
import { PushToggle } from '@/components/finance/push-toggle'
import { WolffAvatar } from '@/components/brand-logo'
import { cn } from '@/lib/utils'
import { monthKey } from '@/lib/finance-utils'
import { fetchWestProjection, westMonthTarget } from '@/lib/west-projection-client'

interface Insight {
  type: string
  icon: string
  title: string
  detail: string
  priority: string
  category?: string
}

interface WidgetData {
  safe_to_spend_day: number
  controllable_per_day?: number
  week_envelope: number
  days_left_in_week?: number
  over_committed_by: number
  projected_savings: number
  goal_coverage_pct: number
  west_month?: { target: number; gap: number; pct: number } | null
}

interface ChatMessage {
  id: string
  role: 'user' | 'wolff'
  content: string
  reply_to?: string | null
  asked_by?: string | null
  created_at: string
}

function money(value = 0) {
  return `$${Math.round(value).toLocaleString()}`
}

export function WolffWidget() {
  const [directive, setDirective] = useState<Insight | null>(null)
  const [week, setWeek] = useState<Insight | null>(null)
  const [watch, setWatch] = useState<Insight | null>(null)
  const [proactive, setProactive] = useState<ChatMessage | null>(null)
  const [widget, setWidget] = useState<WidgetData | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [loading, setLoading] = useState(true)
  // The widget endpoint computes its own WEST target server-side; prefer the
  // page-shared client fetch so this footer matches the projection card.
  const [sharedWestTarget, setSharedWestTarget] = useState<number | null>(null)

  const load = useCallback(async () => {
    const headers = { 'x-api-key': process.env.NEXT_PUBLIC_FINANCE_API_KEY || '' }
    const [insightRes, widgetRes, chatRes, westData] = await Promise.all([
      fetch('/api/finance/insights', { headers, cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/finance/widget', { headers, cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/finance/wolff-chat', { headers, cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetchWestProjection().catch(() => null),
    ])
    setSharedWestTarget(westMonthTarget(westData, monthKey(new Date())))

    const all: Insight[] = insightRes?.insights || []
    const category = (insight: Insight) => (insight.category || '').toUpperCase()
    const today = all.find(insight => category(insight) === 'WIDGET')
    const weekly = all.find(insight => category(insight) === 'WEEK' && insight.type === 'recommendation')
      || all.find(insight => category(insight) === 'WEEK')
    const secondary = all.find(insight =>
      insight.priority === 'high' && !['WIDGET', 'WEEK', 'PROJECTION'].includes(category(insight)))
      || all.find(insight => !['WIDGET', 'WEEK', 'PROJECTION'].includes(category(insight)))

    const messages: ChatMessage[] = chatRes?.messages || []
    const monitorQuestions = messages.filter(message => message.role === 'user' && message.asked_by?.startsWith('wolff-monitor:'))
    const latestMonitor = monitorQuestions.at(-1)
    const monitorReply = latestMonitor
      ? messages.find(message => message.role === 'wolff' && message.reply_to === latestMonitor.id) || null
      : null

    setDirective(today || secondary || null)
    setWeek(weekly || null)
    setWatch(secondary && secondary !== today ? secondary : null)
    setProactive(monitorReply)
    setWidget(widgetRes || null)
    setGeneratedAt(insightRes?.generated_at || widgetRes?.updated_at || null)
    setStale(Boolean(insightRes?.stale))
    setLoading(false)
  }, [])

  useEffect(() => {
    const initial = window.setTimeout(load, 0)
    const interval = window.setInterval(load, 30_000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const freshness = generatedAt
    ? new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null
  const plannedToday = widget?.controllable_per_day ?? 0
  const extraSafe = widget?.safe_to_spend_day ?? 0
  const risk = (widget?.over_committed_by || 0) > 0

  return (
    <section className="wolff-command relative overflow-hidden rounded-[1.5rem]" aria-labelledby="wolff-command-title">
      <div className="wolff-command-grid pointer-events-none absolute inset-0" />
      <div className="relative border-b border-white/[0.07] px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            <WolffAvatar className="h-11 w-11 sm:h-12 sm:w-12" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="wolff-command-title" className="text-base font-semibold sm:text-lg">Wolff · daily command</h2>
                <span className="signal-blue hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] sm:inline-flex">
                  <Activity className="h-2.5 w-2.5" /> Monitoring live
                </span>
              </div>
              <p className={cn('mt-0.5 truncate text-[10px] sm:text-xs', stale ? 'text-amber-400' : 'text-[hsl(var(--text-tertiary))]')}>
                {stale ? 'Brief refresh pending' : 'Watching spending, goals, and new transactions'}{freshness ? ` · ${freshness}` : ''}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden sm:inline"><PushToggle /></span>
            <Link href="/finance/ask" aria-label="Talk to Wolff" className="inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-xl bg-blue-500 text-xs font-semibold text-white shadow-lg shadow-blue-950/40 hover:bg-blue-400 sm:h-auto sm:w-auto sm:px-3 sm:py-2.5">
              <MessageCircle className="h-3.5 w-3.5" /><span className="hidden sm:inline">Talk to Wolff</span>
            </Link>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1.35fr_.65fr]">
          <div className="h-36 animate-pulse rounded-2xl bg-white/[0.045]" />
          <div className="h-36 animate-pulse rounded-2xl bg-white/[0.045]" />
        </div>
      ) : (
        <div className="relative p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[1.35fr_.65fr]">
            <div className="rounded-2xl border border-blue-400/15 bg-blue-400/[0.055] p-4 sm:p-5">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-300">
                <Sparkles className="h-3.5 w-3.5" /> Your move today
              </p>
              <p className="mt-2 text-xl font-semibold leading-tight text-white sm:text-2xl">
                {directive?.icon && <span className="mr-2">{directive.icon}</span>}{directive?.title || 'Keep today intentional'}
              </p>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
                {directive?.detail || 'Wolff is reviewing the latest household numbers and will place the next action here.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['Plan a date night', 'Review a purchase', 'Where can we cut?'].map(prompt => (
                  <Link key={prompt} href="/finance/ask" className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] font-medium text-[hsl(var(--text-secondary))] hover:border-blue-400/35 hover:bg-blue-400/10 hover:text-blue-200">
                    {prompt}
                  </Link>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
              <div className={cn('rounded-xl border p-3', risk ? 'signal-red' : 'signal-green')}>
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] opacity-75"><span className="sm:hidden">Extra</span><span className="hidden sm:inline">Extra safe</span></p>
                <p className="num-metric mt-1 text-lg font-bold sm:text-xl">{money(extraSafe)}</p>
                <p className="mt-0.5 hidden text-[10px] opacity-70 sm:block">unplanned today</p>
              </div>
              <div className="signal-green rounded-xl border p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] opacity-75"><span className="sm:hidden">Planned</span><span className="hidden sm:inline">Planned today</span></p>
                <p className="num-metric mt-1 text-lg font-bold sm:text-xl">{money(plannedToday)}</p>
                <p className="mt-0.5 hidden text-[10px] opacity-70 sm:block">inside categories</p>
              </div>
              <div className="signal-orange rounded-xl border p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.13em] opacity-75"><span className="sm:hidden">Week left</span><span className="hidden sm:inline">Through Sunday</span></p>
                <p className="num-metric mt-1 text-lg font-bold sm:text-xl">{money(widget?.week_envelope)}</p>
                <p className="mt-0.5 hidden text-[10px] opacity-70 sm:block">{widget?.days_left_in_week || 1} day plan</p>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-yellow-300">This week&apos;s discipline</p>
                <span className="signal-yellow rounded-full border px-2 py-0.5 text-[9px] font-semibold">{widget?.goal_coverage_pct || 0}% goal pace</span>
              </div>
              <p className="mt-1.5 text-sm font-semibold text-white">{week?.title || 'Protect the plan one decision at a time'}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))]">{week?.detail || 'Stay inside the category envelopes and Wolff will keep adjusting the next move.'}</p>
            </div>

            <div className={cn('rounded-xl border p-4', proactive ? 'signal-orange' : 'border-white/[0.07] bg-black/10')}>
              <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.15em]">
                {proactive ? <AlertTriangle className="h-3 w-3" /> : <Target className="h-3 w-3 text-blue-300" />}
                {proactive ? 'Transaction reviewed' : 'Wolff is watching'}
              </p>
              <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))]">
                {proactive?.content || watch?.detail || 'Unexpected spending, goal risk, and upcoming commitments will appear here automatically.'}
              </p>
              <Link href={proactive ? '/finance/ask' : '/finance/insights'} className="mt-2.5 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-300 hover:text-blue-200">
                {proactive ? 'Discuss with Wolff' : 'Open full brief'} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3 text-[10px] text-[hsl(var(--text-tertiary))]">
            <span className="inline-flex items-center gap-1.5"><Wallet className="h-3 w-3 text-green-400" /> Projected savings <strong className="text-[hsl(var(--text-secondary))]">{money(widget?.projected_savings)}</strong></span>
            {widget?.west_month && <span>WEST target <strong className="text-[hsl(var(--text-secondary))]">{money(sharedWestTarget ?? widget.west_month.target)}</strong></span>}
            {risk && <span className="text-red-300">No room for unplanned spending without moving a goal</span>}
          </div>
        </div>
      )}
    </section>
  )
}
