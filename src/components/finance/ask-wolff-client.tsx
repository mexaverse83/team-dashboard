'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChatMessage {
  id: string
  role: 'user' | 'wolff'
  content: string
  status: string
  created_at: string
}

const SUGGESTIONS = [
  'Can we afford dinner out this weekend?',
  'How is the WEST plan going?',
  'Where are we overspending this month?',
  '¿Cuánto puedo gastar hoy sin culpa?',
]

export default function AskWolffClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/wolff-chat', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages || [])
    } catch { /* offline */ }
    finally { setLoading(false) }
  }, [])

  // Poll — faster while a question is waiting for Wolff
  const waiting = messages.some(m => m.role === 'user' && m.status === 'pending')
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const id = setInterval(load, waiting ? 3000 : 15000)
    return () => clearInterval(id)
  }, [load, waiting])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, waiting])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || sending) return
    setSending(true)
    setInput('')
    // Optimistic append
    const tmp: ChatMessage = { id: `tmp-${Date.now()}`, role: 'user', content, status: 'pending', created_at: new Date().toISOString() }
    setMessages(m => [...m, tmp])
    try {
      const res = await fetch('/api/finance/wolff-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setMessages(m => m.map(x => x.id === tmp.id ? { ...x, status: 'failed', content: `${content}\n(⚠ ${err.error || 'failed to send'})` } : x))
        return
      }
      await load()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] max-w-2xl flex-col md:h-[calc(100vh-4rem)]">
      <div className="mb-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
          <span className="section-tick" aria-hidden />🐺 Ask Wolff
        </h1>
        <p className="text-sm text-[hsl(var(--text-secondary))]">
          Your financial advisor, with your live numbers. Replies take ~10–30s.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))] p-4">
        {loading ? (
          <p className="py-10 text-center text-sm text-[hsl(var(--text-tertiary))]">Loading conversation…</p>
        ) : messages.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-3xl">🐺</p>
            <p className="mt-2 text-sm font-medium">Ask me anything about your money.</p>
            <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">I know your budgets, the WEST plan, and today&apos;s numbers.</p>
            <div className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-2">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-500/10">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                m.role === 'user'
                  ? 'rounded-br-md bg-emerald-600 text-white'
                  : 'rounded-bl-md border border-[hsl(var(--border))] bg-[hsl(var(--bg-elevated))]/60'
              )}>
                {m.role === 'wolff' && <span className="mr-1.5">🐺</span>}
                {m.content}
                {m.role === 'user' && m.status === 'failed' && (
                  <span className="mt-1 block text-[10px] text-rose-200">⚠ Wolff couldn&apos;t answer this one — try again</span>
                )}
              </div>
            </div>
          ))
        )}
        {waiting && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-[hsl(var(--border))] bg-[hsl(var(--bg-elevated))]/60 px-3.5 py-2.5 text-sm text-[hsl(var(--text-secondary))]">
              🐺 <span className="animate-pulse">Wolff is checking the numbers…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={e => { e.preventDefault(); send() }}
        className="mt-3 flex items-center gap-2"
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about your money…"
          maxLength={1000}
          className="flex-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))] px-4 py-3 text-sm outline-none focus:border-emerald-500/50"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          aria-label="Send"
          className="rounded-xl bg-emerald-600 p-3 text-white transition-colors hover:bg-emerald-500 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}
