'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ChevronDown, MessageCircle } from 'lucide-react'
import { PushToggle } from '@/components/finance/push-toggle'
import { WolffAvatar } from '@/components/brand-logo'

interface Insight {
  type: string
  icon: string
  title: string
  detail: string
  priority: string
  category?: string
}
interface ChatMessage {
  id: string
  role: 'user' | 'wolff'
  content: string
  reply_to?: string | null
  asked_by?: string | null
  created_at: string
}

export function WolffWidget() {
  const inFlight = useRef(false)
  const mounted = useRef(false)
  const [directive, setDirective] = useState<Insight | null>(null)
  const [week, setWeek] = useState<Insight | null>(null)
  const [watch, setWatch] = useState<Insight | null>(null)
  const [proactive, setProactive] = useState<ChatMessage | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const read = (url: string) => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) })
        .then(r => r.ok ? r.json() : null).catch(() => null)
      const [insightRes, chatRes] = await Promise.all([read('/api/finance/insights'), read('/api/finance/wolff-chat')])
      if (!mounted.current) return
      setFailed(!insightRes)
      if (insightRes) {
        const all: Insight[] = insightRes.insights || []
        const category = (insight: Insight) => (insight.category || '').toUpperCase()
        const today = all.find(insight => category(insight) === 'WIDGET')
        const secondary = all.find(insight => insight.priority === 'high' && !['WIDGET', 'WEEK', 'PROJECTION'].includes(category(insight)))
        setDirective(today || secondary || all.find(insight => category(insight) !== 'WEEK') || null)
        setWeek(all.find(insight => category(insight) === 'WEEK') || null)
        setWatch(secondary && secondary !== today ? secondary : null)
        setGeneratedAt(insightRes.generated_at || null)
        setStale(Boolean(insightRes.stale))
      }
      if (chatRes) {
        const messages: ChatMessage[] = chatRes.messages || []
        const monitor = messages.filter(message => message.role === 'user' && message.asked_by?.startsWith('wolff-monitor:')).at(-1)
        setProactive(monitor ? messages.find(message => message.role === 'wolff' && message.reply_to === monitor.id) || null : null)
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    const initial = window.setTimeout(() => void load(), 0)
    const visible = () => { if (document.visibilityState === 'visible') void load() }
    const interval = window.setInterval(visible, 60_000)
    document.addEventListener('visibilitychange', visible)
    return () => {
      mounted.current = false
      window.clearTimeout(initial)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [load])

  const stamp = generatedAt ? new Date(generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null
  const suggestions = [
    { label: 'Plan a date night', prompt: 'Can we afford a date night this week while staying on track with our goals?' },
    { label: 'Review a purchase', prompt: 'Help me check a purchase against our budget and goals.' },
  ]

  return (
    <section className="overview-mona-card flex flex-col rounded-2xl p-4 sm:p-5" aria-labelledby="wolff-command-title">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <WolffAvatar className="h-10 w-10 shrink-0" />
          <div className="min-w-0">
            <h2 id="wolff-command-title" className="text-sm font-semibold">Mona’s take</h2>
            <p className="mt-0.5 text-[11px] text-[hsl(var(--text-secondary))]">{failed ? 'Brief unavailable' : stale ? 'Brief refresh pending' : 'Your daily brief'}{stamp ? ` · ${stamp}` : ''}</p>
          </div>
        </div>
        <Link href="/finance/ask" aria-label="Talk to Mona" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-400/20 bg-sky-400/10 text-sky-300 hover:bg-sky-400/20"><MessageCircle className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
      {loading ? <div className="my-5 h-20 animate-pulse rounded-xl bg-white/[0.04]" aria-label="Loading daily brief" /> : (
        <div className="mt-4 flex-1">
          <h3 className="text-lg font-semibold leading-snug tracking-tight">{directive?.title || (failed ? 'Your numbers are ready. The brief can wait.' : 'A fresh perspective is on its way.')}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[hsl(var(--text-secondary))]">{directive?.detail || 'Use the live spending plan above, or ask Mona about your next decision.'}</p>
          {directive && <p className="mt-2 text-[10px] text-[hsl(var(--text-tertiary))]">Brief figures reflect when it was written. The plan above uses your latest refresh.</p>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {suggestions.map(({ label, prompt }) => <Link key={label} href={`/finance/ask?prompt=${encodeURIComponent(prompt)}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-medium text-[hsl(var(--text-secondary))] hover:border-sky-400/40 hover:text-sky-200">{label}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2"><Link href="/finance/insights" className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-sky-300">Read full brief <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link><PushToggle /></div>
      {(week || watch || proactive) && (
        <details className="group mt-4 border-t border-[hsl(var(--border-subtle))] pt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-[hsl(var(--text-secondary))] [&::-webkit-details-marker]:hidden">
            <span>{proactive ? 'Latest review & weekly brief' : 'Weekly brief & watchlist'}</span><ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-3 pb-2 text-xs leading-relaxed text-[hsl(var(--text-secondary))]">
            {proactive && <p><span className="mb-1 block font-semibold text-sky-300">Latest transaction review · {new Date(proactive.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>{proactive.content}</p>}
            {week && <p><span className="mb-1 block font-semibold text-[hsl(var(--foreground))]">{week.title}</span>{week.detail}</p>}
            {watch && <p><span className="mb-1 block font-semibold text-[hsl(var(--foreground))]">{watch.title}</span>{watch.detail}</p>}
          </div>
        </details>
      )}
    </section>
  )
}
