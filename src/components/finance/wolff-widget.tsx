'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown, MessageCircle } from 'lucide-react'
import { PushToggle } from '@/components/finance/push-toggle'
import { WolffAvatar } from '@/components/brand-logo'
import { Card } from '@/components/ui/card'
import { StatusPill } from '@/components/ui/status-pill'
import { useFinanceData } from '@/hooks/use-finance-data'
import { buildDeterministicBrief, type BriefSummary } from '@/lib/deterministic-brief'
import { insightFreshnessLevel, isInsightUsable, type FreshnessLevel } from '@/lib/insight-freshness'
import { formatDateShort } from '@/lib/format'
import { MiniMarkdown, withMoneySpans } from '@/lib/mini-markdown'
import { cn } from '@/lib/utils'

export interface WolffInsight {
  type?: string
  icon?: string
  title: string
  detail: string
  priority?: string
  category?: string
  url?: string
}

/** GET /api/finance/insights (v2 adds `source`, `expired`, `archived`). */
export interface InsightsPayload {
  insights?: WolffInsight[]
  archived?: WolffInsight[]
  generated_at?: string | null
  /** Date of the last AI brief; differs from generated_at when source is 'live'. */
  llm_generated_at?: string | null
  stale?: boolean
  expired?: boolean
  source?: 'llm' | 'live'
}

export interface ProactiveReply {
  content: string
  created_at: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'wolff'
  content: string
  reply_to?: string | null
  asked_by?: string | null
  created_at: string
}

/**
 * Accepts both wolff-chat shapes: v2 `?latest_proactive=1` → `{question, reply}`
 * (or null), and the legacy `{messages}` list.
 */
export function proactiveFromChat(payload: unknown): ProactiveReply | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { reply?: unknown; messages?: ChatMessage[] }
  if (p.reply && typeof p.reply === 'object') {
    const reply = p.reply as Partial<ChatMessage>
    return reply.content ? { content: String(reply.content), created_at: String(reply.created_at || '') } : null
  }
  const messages = Array.isArray(p.messages) ? p.messages : []
  const monitor = messages.filter(m => m.role === 'user' && m.asked_by?.startsWith('wolff-monitor:')).at(-1)
  const reply = monitor ? messages.find(m => m.role === 'wolff' && m.reply_to === monitor.id) : null
  return reply ? { content: reply.content, created_at: reply.created_at } : null
}

const category = (insight: WolffInsight) => (insight.category || '').toUpperCase()

function pickDirective(items: WolffInsight[]): WolffInsight | null {
  return items.find(i => category(i) === 'WIDGET')
    || items.find(i => i.priority === 'high' && !['WEEK', 'PROJECTION'].includes(category(i)))
    || items.find(i => category(i) !== 'WEEK')
    || null
}

const DOT: Record<FreshnessLevel | 'live', { cls: string; label: string }> = {
  live: { cls: 'bg-positive', label: 'Live' },
  fresh: { cls: 'bg-positive', label: 'Under 24h old' },
  aging: { cls: 'bg-warning', label: 'Over a day old' },
  stale: { cls: 'bg-fg-tertiary', label: 'Out of date' },
  missing: { cls: 'bg-fg-tertiary', label: 'No brief yet' },
}

function FreshnessDot({ level }: { level: FreshnessLevel | 'live' }) {
  return <span role="img" aria-label={DOT[level].label} title={DOT[level].label} data-freshness={level} className={cn('inline-block h-2 w-2 shrink-0 rounded-full', DOT[level].cls)} />
}

const timeStamp = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

interface WolffWidgetProps {
  /** Insights response from the page's first batch (undefined while loading). */
  insights?: InsightsPayload | null
  /** Latest wolff-monitor reply (undefined while loading). */
  proactive?: ProactiveReply | null
  /** Today's summary, for the deterministic "live plan". */
  summary?: BriefSummary | null
  loading?: boolean
  now?: Date
  /** Needs attention already shows a budget overrun: don't repeat it as Mona's move (UX-15). */
  overBudgetShown?: boolean
}

// Mona's take (UX-01, VIS-07, F01): an LLM brief is only shown as current
// advice while it is usable (same Mexico City day). Otherwise the card shows
// the deterministic live plan and keeps the old brief behind a toggle.
export function WolffWidget(props: WolffWidgetProps) {
  if ('insights' in props || 'summary' in props) return <WolffWidgetView {...props} />
  return <SelfFetchingWolffWidget />
}

/** Standalone use (no page data): fetches its own brief and proactive reply. */
function SelfFetchingWolffWidget() {
  const read = (url: string) => (signal: AbortSignal) => fetch(url, { cache: 'no-store', signal }).then(r => (r.ok ? r.json() : null))
  const insights = useFinanceData<InsightsPayload | null>('wolff:insights', read('/api/finance/insights'), { minIntervalMs: 30 * 60_000 })
  const chat = useFinanceData<unknown>('wolff:proactive', read('/api/finance/wolff-chat?latest_proactive=1'), { minIntervalMs: 5 * 60_000 })
  return (
    <WolffWidgetView
      insights={insights.error ? null : insights.data}
      proactive={chat.data === undefined ? undefined : proactiveFromChat(chat.data)}
      loading={insights.loading}
    />
  )
}

function WolffWidgetView({ insights, proactive, summary, loading = false, now = new Date(), overBudgetShown = false }: WolffWidgetProps) {
  const [showLast, setShowLast] = useState(false)
  const failed = insights === null
  const items = insights?.insights || []
  const generatedAt = insights?.generated_at || null
  const llmUsable = Boolean(insights) && insights?.source !== 'live' && !insights?.expired
    && isInsightUsable(generatedAt, { now, category: 'WIDGET' })

  const llmDirective = llmUsable ? pickDirective(items) : null
  const llmWeek = llmUsable ? items.find(i => category(i) === 'WEEK') || null : null
  const live = !llmDirective && summary ? buildDeterministicBrief(summary, { now }) : null

  // The brief we are NOT showing as current: archived items (v2) or the stale LLM set.
  const lastItems = llmUsable ? [] : (insights?.archived?.length ? insights.archived : insights?.source === 'live' ? [] : items)
  const lastBrief = pickDirective(lastItems)
  // A live payload's generated_at is today's rebuild, not when the archived brief was written.
  const lastBriefAt = insights?.source === 'live' || insights?.archived?.length
    ? insights?.llm_generated_at ?? null
    : insights?.llm_generated_at ?? generatedAt
  const lastDate = lastBriefAt ? formatDateShort(new Date(lastBriefAt)) : null

  // When the overrun is already a Needs attention row, Mona offers the coaching
  // question instead of restating it.
  const coachInstead = Boolean(live && overBudgetShown && live.directive.rule === 'over-budget')
  const directive = llmDirective
    ? { title: llmDirective.title, detail: llmDirective.detail, url: llmDirective.url, cta: 'Open' }
    : live && coachInstead ? { title: live.coach.title, detail: `${live.week.title}. ${live.week.detail}.`, url: live.coach.url, cta: 'Ask Mona' }
    : live ? { title: live.directive.title, detail: live.directive.detail, url: live.directive.url, cta: 'Open' } : null
  const level: FreshnessLevel | 'live' = llmDirective ? insightFreshnessLevel(generatedAt, now) : live ? 'live' : insightFreshnessLevel(generatedAt, now)
  const stamp = llmDirective && generatedAt ? `Mona’s brief · ${timeStamp(generatedAt)}` : live ? 'Built from today’s numbers' : failed ? 'Brief unavailable' : 'Brief out of date'

  const suggestions = [
    { label: 'Plan a date night', prompt: 'Can we afford a date night this week while staying on track with our goals?' },
    live && !coachInstead ? { label: 'Ask about this', prompt: live.coach.title } : { label: 'Review a purchase', prompt: 'Help me check a purchase against our budget and goals.' },
  ]
  const week = llmWeek ? { title: llmWeek.title, detail: llmWeek.detail } : live && !coachInstead ? live.week : null

  return (
    <Card className="flex flex-col" aria-labelledby="wolff-command-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <WolffAvatar className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <h2 id="wolff-command-title" className="text-[0.9375rem] font-semibold text-fg">Mona’s take</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-label text-fg-tertiary"><FreshnessDot level={level} /><span className="truncate">{stamp}</span></p>
          </div>
        </div>
        <Link href="/finance/ask" aria-label="Talk to Mona" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border text-fg-secondary hover:bg-surface-2 hover:text-fg"><MessageCircle className="h-4 w-4" aria-hidden="true" /></Link>
      </div>

      {loading ? <div className="my-5 h-20 animate-pulse rounded-xl bg-surface-2" aria-label="Loading daily brief" /> : (
        <div className="mt-4 flex-1">
          {live && <StatusPill tone="positive" className="mb-2 text-[0.75rem]">Live plan</StatusPill>}
          <h3 className="text-lg font-semibold leading-snug tracking-tight text-fg">
            {directive?.title ? withMoneySpans(directive.title) : (failed ? 'Your numbers are ready. The brief can wait.' : 'Mona’s brief is out of date.')}
          </h3>
          {directive?.detail
            ? <MiniMarkdown text={directive.detail} className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-secondary" />
            : <p className="mt-2 text-sm leading-relaxed text-fg-secondary">Use the live numbers above, or ask Mona about your next decision.</p>}
          {directive?.url && <Link href={directive.url} className="mt-2 inline-flex min-h-9 items-center gap-1 text-label font-semibold text-fg">{directive.cta} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
        </div>
      )}

      {lastBrief && (
        <div className="mt-3 rounded-lg border border-border bg-surface-2">
          <button type="button" onClick={() => setShowLast(v => !v)} aria-expanded={showLast} aria-controls="mona-last-brief"
            className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-label font-medium text-fg-secondary">
            <span>{showLast ? 'Hide last brief' : `Show last brief${lastDate ? ` (${lastDate})` : ''}`}</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', showLast && 'rotate-180')} aria-hidden="true" />
          </button>
          {showLast && (
            <div id="mona-last-brief" className="border-t border-border px-3 py-2.5 text-label leading-relaxed text-fg-secondary">
              <p className="text-micro text-fg-tertiary">Written {lastDate ?? 'earlier'} · its figures may be out of date</p>
              <p className="mt-1 font-medium text-fg">{withMoneySpans(lastBrief.title)}</p>
              <MiniMarkdown text={lastBrief.detail} className="mt-0.5" />
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {suggestions.map(({ label, prompt }) => (
          <Link key={label} href={`/finance/ask?prompt=${encodeURIComponent(prompt)}`} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border px-3 text-label font-medium text-fg-secondary hover:border-border-strong hover:text-fg sm:flex-none sm:justify-start">
            {label}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Link href="/finance/insights" className="inline-flex min-h-9 items-center gap-1 text-label font-medium text-fg-secondary hover:text-fg">Daily brief <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
        <PushToggle />
      </div>

      {(week || proactive) && (
        <details className="group mt-3 border-t border-border pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-label font-medium text-fg-secondary [&::-webkit-details-marker]:hidden">
            <span>{proactive ? 'Mona noticed · this week' : 'This week'}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-3 pb-2 text-label leading-relaxed text-fg-secondary">
            {proactive && (
              <div className="border-l-2 border-warning pl-3">
                <span className="mb-1 block font-semibold text-fg">Mona noticed{proactive.created_at ? ` · ${formatDateShort(new Date(proactive.created_at))}` : ''}</span>
                <MiniMarkdown text={proactive.content} />
              </div>
            )}
            {week && <p><span className="mb-1 block font-semibold text-fg">{withMoneySpans(week.title)}</span>{withMoneySpans(week.detail)}</p>}
          </div>
        </details>
      )}
    </Card>
  )
}
