'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronUp, MessageSquarePlus, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { conversationStart, currentConversation, isResetMarker } from '@/lib/mona-chat-session.mjs'
import { WolffAvatar } from '@/components/brand-logo'
import { MiniMarkdown } from '@/lib/mini-markdown'
import { MX_TIME_ZONE, diffDaysKey, mexicoCityToday } from '@/lib/dates'

const noteTime = new Intl.DateTimeFormat('en-US', { timeZone: MX_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
const noteWeekday = new Intl.DateTimeFormat('en-US', { timeZone: MX_TIME_ZONE, weekday: 'short' })
const noteDate = new Intl.DateTimeFormat('en-US', { timeZone: MX_TIME_ZONE, month: 'short', day: 'numeric' })
const dividerDay = new Intl.DateTimeFormat('en-US', { timeZone: MX_TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' })

/** "Tue Nov 4" on the Mexico City calendar, for conversation dividers. */
export function dividerDate(at: string | number): string {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : dividerDay.format(d).replace(',', '')
}

/** "today 9:00 AM", "yesterday 3:02 PM", "Mon 9:00 AM" this week, else "Oct 21" — so stacked notes show their age. */
export function noteStamp(iso: string, now: Date = new Date()): { label: string; today: boolean } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { label: '', today: false }
  const day = mexicoCityToday(d)
  const age = diffDaysKey(day, mexicoCityToday(now))
  if (age <= 0) return { label: `today ${noteTime.format(d)}`, today: true }
  if (age === 1) return { label: `yesterday ${noteTime.format(d)}`, today: false }
  if (age < 7) return { label: `${noteWeekday.format(d)} ${noteTime.format(d)}`, today: false }
  return { label: noteDate.format(d), today: false }
}

interface ChatMessage {
  id: string
  role: 'user' | 'wolff'
  content: string
  status: string
  created_at: string
  reply_to?: string | null
  asked_by?: string | null
}

const SUGGESTIONS = [
  'What is our one financial move today?',
  'Can we afford dinner out this weekend?',
  'How are we doing vs the WEST plan?',
  'How much should move to GBM this month?',
  'What changed since our last transaction?',
]

const SPANISH_HINTS = /[¿¡ñ]|\b(que|para|con|los|las|del|est[aá]s?|puedes|gastos?|semana|mes|ahorro|tenemos|hoy|pero|también|cuánto)\b/gi

/** Rough language sniff so VoiceOver reads Spanish bubbles with a Spanish voice (MOB-20). */
export function detectLang(text: string): 'es' | undefined {
  const words = text.split(/\s+/).filter(Boolean).length
  if (!words) return undefined
  const hits = text.match(SPANISH_HINTS)?.length ?? 0
  return hits >= 2 && hits / words > 0.08 ? 'es' : undefined
}

type LogItem = { kind: 'divider'; key: string; label: string } | { kind: 'message'; message: ChatMessage }

/**
 * Older messages (everything outside the current conversation), with a
 * divider at every earlier "new chat" marker and every Mexico City day change.
 */
export function earlierItems(earlier: ChatMessage[]): LogItem[] {
  const items: LogItem[] = []
  let day = ''
  let pendingDivider = true
  for (const m of earlier) {
    const mDay = mexicoCityToday(new Date(m.created_at))
    if (isResetMarker(m)) {
      items.push({ kind: 'divider', key: `marker-${m.id}`, label: `New conversation · ${dividerDate(m.created_at)}` })
      day = mDay
      pendingDivider = false
      continue
    }
    if (pendingDivider || mDay !== day) items.push({ kind: 'divider', key: `day-${m.id}`, label: dividerDate(m.created_at) })
    day = mDay
    pendingDivider = false
    items.push({ kind: 'message', message: m })
  }
  return items
}

const isMonitorQuestion = (m: ChatMessage) => m.role === 'user' && Boolean(m.asked_by?.startsWith('wolff-monitor:'))

/** Merge a (full or incremental) server page into the local list, dropping optimistic copies it confirms. */
export function mergeMessages(local: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(local.filter(m => !m.id.startsWith('tmp-')).map(m => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  const confirmed = new Set(incoming.filter(m => m.role === 'user').map(m => m.content.trim()))
  const pending = local.filter(m => m.id.startsWith('tmp-') && !confirmed.has(m.content.trim()))
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).concat(pending)
}

export default function AskWolffClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showEarlier, setShowEarlier] = useState(false)
  const [resetting, setResetting] = useState(false)
  // The daily reset moves at Mexico City midnight; re-read the clock on every load.
  const [now, setNow] = useState(() => Date.now())
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSeen = useRef<string | null>(null)

  // First load reads the latest page; later polls ask only for what is new.
  const load = useCallback(async (full = false) => {
    try {
      const since = !full && lastSeen.current ? `?since=${encodeURIComponent(lastSeen.current)}` : ''
      const res = await fetch(`/api/finance/wolff-chat${since}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      const incoming: ChatMessage[] = Array.isArray(data.messages) ? data.messages : []
      const newest = incoming.reduce<string | null>((max, m) => (!max || m.created_at > max ? m.created_at : max), lastSeen.current)
      lastSeen.current = newest
      setNow(Date.now())
      setMessages(local => mergeMessages(full ? local.filter(m => m.id.startsWith('tmp-')) : local, incoming))
    } catch { /* offline */ }
    finally { setLoading(false) }
  }, [])

  const answered = new Set(messages.filter(m => m.role === 'wolff' && m.reply_to).map(m => m.reply_to))
  const waiting = messages.some(m => m.role === 'user' && m.status === 'pending' && !isMonitorQuestion(m) && !answered.has(m.id))

  useEffect(() => {
    const initial = window.setTimeout(() => {
      const prompt = new URLSearchParams(window.location.search).get('prompt')
      if (prompt) setInput(prompt.slice(0, 1000))
      void load(true)
    }, 0)
    return () => window.clearTimeout(initial)
  }, [load])

  // Poll faster while a question waits for Mona; pause while the tab is hidden.
  // While waiting, re-read the full page: a failed answer only PATCHes the
  // question row's status, which a `since` (created_at) poll never sees.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load(waiting) }
    const id = window.setInterval(tick, waiting ? 3000 : 15000)
    const onVisible = () => { if (document.visibilityState === 'visible') void load(waiting) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, waiting])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, waiting])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    const tmp: ChatMessage = { id: `tmp-${crypto.randomUUID()}`, role: 'user', content, status: 'pending', created_at: new Date().toISOString() }
    setMessages(m => [...m, tmp])
    try {
      const res = await fetch('/api/finance/wolff-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessages(m => m.map(x => x.id === tmp.id ? { ...x, status: 'failed', content: `${content}\n(${err.error || 'failed to send'})` } : x))
        return
      }
      await load()
    } catch {
      setMessages(m => m.map(x => x.id === tmp.id ? { ...x, status: 'failed' } : x))
      setInput(current => current || content)
    } finally {
      setSending(false)
    }
  }

  // Start a new conversation: one marker row, nothing deleted. Earlier
  // messages stay one tap away under "Show earlier".
  const newChat = async () => {
    if (resetting) return
    setResetting(true)
    try {
      const res = await fetch('/api/finance/wolff-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      if (!res.ok) return
      const data = await res.json().catch(() => ({}))
      const marker: ChatMessage | undefined = data?.message
      if (marker?.id) {
        if (!lastSeen.current || marker.created_at > lastSeen.current) lastSeen.current = marker.created_at
        setMessages(local => mergeMessages(local, [marker]))
      }
      setNow(Date.now())
      setShowEarlier(false)
      inputRef.current?.focus()
    } catch { /* offline: nothing changed */ }
    finally { setResetting(false) }
  }

  const monitorIds = new Set(messages.filter(isMonitorQuestion).map(m => m.id))
  const nowDate = new Date(now)
  const start = conversationStart(messages, nowDate)
  const current = currentConversation(messages, nowDate)
  const currentIds = new Set(current.map(m => m.id))
  const visibleMessages = current.filter(m => !monitorIds.has(m.id))
  // The marker that opened this conversation is drawn once, as the boundary
  // divider below, so it never also shows up among the earlier items.
  const earlier = messages.filter(m => !currentIds.has(m.id) && !monitorIds.has(m.id) && m.id !== start.marker?.id)
  const hasEarlier = earlier.some(m => !isResetMarker(m))
  const boundaryLabel = start.kind === 'marker'
    ? `New conversation · ${dividerDate(start.at)}`
    : `New day · ${dividerDate(start.at)} · Mona starts fresh`
  const items: LogItem[] = [
    ...(showEarlier ? earlierItems(earlier) : []),
    ...(hasEarlier ? [{ kind: 'divider' as const, key: 'current', label: boundaryLabel }] : []),
    ...visibleMessages.map(message => ({ kind: 'message' as const, message })),
  ]

  return (
    <div className="mx-auto flex h-[calc(100dvh-11rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-96 w-full max-w-2xl flex-col md:h-[calc(100vh-4.5rem)] md:min-h-[560px]">
      <div className="mb-4 flex items-center gap-3">
        <WolffAvatar className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.75rem] font-semibold leading-[2.125rem] tracking-[-0.02em] text-fg">Ask Mona</h1>
          <p className="text-label text-fg-secondary">One verdict, the numbers behind it, and your next move.</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={newChat}
          disabled={resetting || loading || visibleMessages.length === 0}
          title="Start fresh. Earlier messages stay under Show earlier."
          className="shrink-0"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          New chat
        </Button>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation with Mona"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-card sm:p-4"
      >
        {loading ? (
          <p className="py-10 text-center text-sm text-fg-tertiary">Loading conversation…</p>
        ) : (
          <>
          {hasEarlier && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setShowEarlier(v => !v)}
                aria-expanded={showEarlier}
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-label font-medium text-fg-tertiary hover:text-fg"
              >
                <ChevronUp className={cn('h-3.5 w-3.5 transition-transform', showEarlier && 'rotate-180')} aria-hidden="true" />
                {showEarlier ? 'Hide earlier' : 'Show earlier'}
              </button>
            </div>
          )}
          {visibleMessages.length === 0 && !showEarlier ? (
          <div className="py-8 text-center">
            <WolffAvatar className="mx-auto h-12 w-12" />
            <p className="mt-3 text-sm font-semibold text-fg">Make the next decision simple.</p>
            <p className="mt-1 text-label text-fg-tertiary">
              {hasEarlier
                ? start.kind === 'day'
                  ? 'Fresh start for today: Mona no longer uses earlier chats. They stay under Show earlier.'
                  : 'Fresh start: Mona no longer uses earlier chats. They stay under Show earlier.'
                : 'Mona checks your live month, the WEST plan, the baby plan, goals and budgets.'}
            </p>
          </div>
        ) : (
          items.map(item => {
            if (item.kind === 'divider') {
              return (
                <div key={item.key} role="separator" aria-label={item.label} className="flex items-center gap-3 py-1 text-label text-fg-tertiary">
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  <span className="shrink-0">{item.label}</span>
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
              )
            }
            const m = item.message
            const proactive = m.role === 'wolff' && Boolean(m.reply_to && monitorIds.has(m.reply_to))
            const mona = m.role === 'wolff'
            const stamp = proactive ? noteStamp(m.created_at) : null
            return (
              <div key={m.id} className={cn('flex items-end gap-2', mona ? 'justify-start' : 'justify-end')}>
                {mona && <WolffAvatar className="mb-0.5 h-6 w-6 shrink-0" />}
                <div lang={detectLang(m.content)} className={cn(
                  'max-w-[88%] break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed [overflow-wrap:anywhere] sm:max-w-[80%]',
                  !mona && 'whitespace-pre-wrap rounded-br-md bg-primary text-primary-fg',
                  mona && !proactive && 'rounded-bl-md border border-border bg-surface-2 text-fg',
                  proactive && 'rounded-bl-md border-l-2 bg-surface-2 text-fg',
                  proactive && (stamp?.today ? 'border-warning' : 'border-border text-fg-secondary'),
                )}>
                  {proactive && (
                    <span className={cn('mb-1 block text-label font-semibold', stamp?.today ? 'text-warning' : 'text-fg-tertiary')}>
                      Mona noticed{stamp?.label ? <span className="font-normal"> · {stamp.label}</span> : null}
                    </span>
                  )}
                  {mona ? <MiniMarkdown text={m.content} /> : m.content}
                  {!mona && m.status === 'failed' && (
                    <span className="mt-1 block text-label opacity-90">Mona couldn&apos;t answer this one. Try again.</span>
                  )}
                </div>
              </div>
            )
          })
        )}
          </>
        )}
        {waiting && (
          <div className="flex items-end gap-2">
            <WolffAvatar className="mb-0.5 h-6 w-6 shrink-0" />
            <div className="rounded-2xl rounded-bl-md border border-border bg-surface-2 px-3.5 py-2.5 text-sm text-fg-secondary">
              <span className="animate-pulse">Mona is checking the numbers…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Suggested questions">
        {SUGGESTIONS.map(s => (
          <button key={s} type="button" onClick={() => send(s)} disabled={sending}
            className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-3.5 text-label font-medium text-fg-secondary hover:border-border-strong hover:text-fg disabled:opacity-50">
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={e => { e.preventDefault(); send() }} className="mt-2 flex items-center gap-2">
        <input
          ref={inputRef}
          aria-label="Your question for Mona"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your money…"
          maxLength={1000}
          className="min-h-12 min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-base text-fg outline-none placeholder:text-fg-tertiary focus:border-border-strong sm:text-sm"
        />
        <button type="submit" disabled={!input.trim() || sending} aria-label="Send"
          className="btn-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-opacity disabled:opacity-40">
          <Send className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  )
}
