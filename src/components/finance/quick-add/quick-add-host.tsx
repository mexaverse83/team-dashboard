'use client'

// Global quick-add (MOB-01). Mount <QuickAddHost/> once in the finance layout;
// anything opens it with openQuickAdd(prefill) or a `finance:quick-add` event,
// and `?add=1&m=Heb&a=250&category=<id>` deep links still work on any route.
// Several hosts may be mounted (a page keeps one as a fallback); only the
// first-mounted live host answers, so the sheet never opens twice.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getOwnerName } from '@/lib/owners'
import { dispatchFinanceEvent, FINANCE_EVENTS, onFinanceEvent } from '@/lib/finance-events'
import { loadQuickAddData, peekQuickAddData, rememberSavedTransaction, type QuickAddData } from './quick-add-data'
import { QuickAddSheet } from './quick-add-sheet'
import type { QuickAddRequest, SaveResult } from './use-transaction-form'

export type { QuickAddRequest } from './use-transaction-form'

const hostStack: number[] = []
let nextHostId = 1

/** Open the quick-add sheet from anywhere (FAB, widget link handler, Mona). */
export function openQuickAdd(request: QuickAddRequest = {}): void {
  dispatchFinanceEvent(FINANCE_EVENTS.quickAdd, request)
}

const DEEP_LINK_PARAMS = ['add', 'm', 'a', 'category', 'type', 'date']

/** `?add=1&m=Heb&a=250&category=<id>` → prefill, or null when `add` isn't set. */
export function quickAddRequestFromSearch(search: string): QuickAddRequest | null {
  const params = new URLSearchParams(search)
  if (params.get('add') !== '1') return null
  const amount = Number(params.get('a'))
  const type = params.get('type')
  return {
    merchant: params.get('m')?.trim() || undefined,
    amount: Number.isFinite(amount) && amount > 0 ? amount : undefined,
    categoryId: params.get('category') || undefined,
    type: type === 'income' || type === 'expense' ? type : undefined,
    date: params.get('date') || undefined,
  }
}

/** Check mark that pops in once (respects reduced motion via the global guard). */
function SavedCheck() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setShown(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-positive-bg text-positive transition-transform duration-300 ease-out ${shown ? 'scale-100' : 'scale-50'}`}>
      <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
    </span>
  )
}

export function QuickAddHost() {
  const [hostId] = useState(() => nextHostId++)
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(0)
  const [request, setRequest] = useState<QuickAddRequest | null>(null)
  const [data, setData] = useState<QuickAddData | null>(() => peekQuickAddData())
  const [defaultOwner, setDefaultOwner] = useState('')
  const [saved, setSaved] = useState<{ message: string; type: SaveResult['type'] } | null>(null)
  const savedTimer = useRef<number | null>(null)

  const isActive = useCallback(() => hostStack[0] === hostId, [hostId])

  const openWith = useCallback((next: QuickAddRequest) => {
    const cached = peekQuickAddData()
    if (cached) setData(cached)
    setRequest(next)
    setSession(s => s + 1)
    setSaved(null)
    setOpen(true)
    loadQuickAddData().then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    hostStack.push(hostId)
    return () => {
      const index = hostStack.indexOf(hostId)
      if (index >= 0) hostStack.splice(index, 1)
    }
  }, [hostId])

  useEffect(() => onFinanceEvent<QuickAddRequest | undefined>(FINANCE_EVENTS.quickAdd, detail => {
    if (isActive()) openWith(detail ?? {})
  }), [isActive, openWith])

  // Deep link: open prefilled, then strip the params so back/refresh doesn't reopen it.
  useEffect(() => {
    if (!isActive()) return
    const prefill = quickAddRequestFromSearch(window.location.search)
    if (!prefill) return
    // Opened on the next tick: setState inside an effect body cascades renders.
    void Promise.resolve().then(() => openWith(prefill))
    const params = new URLSearchParams(window.location.search)
    DEEP_LINK_PARAMS.forEach(p => params.delete(p))
    const qs = params.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`)
  }, [isActive, openWith])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data: auth }) => {
      if (!cancelled) setDefaultOwner(getOwnerName(auth.user?.email ?? undefined))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Warm the cache when the browser is idle so the first tap opens with data.
  useEffect(() => {
    if (!isActive()) return
    const timer = window.setTimeout(() => { loadQuickAddData().then(d => setData(d)).catch(() => {}) }, 1500)
    return () => window.clearTimeout(timer)
  }, [isActive])

  useEffect(() => () => { if (savedTimer.current) window.clearTimeout(savedTimer.current) }, [])

  const handleSaved = (result: SaveResult) => {
    setOpen(false)
    rememberSavedTransaction(result.row)
    setData(peekQuickAddData())
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_transactions' })
    const noun = result.type === 'expense' ? 'Expense' : 'Income'
    setSaved({ message: `${noun} ${result.kind === 'updated' ? 'updated' : 'saved'}`, type: result.type })
    if (savedTimer.current) window.clearTimeout(savedTimer.current)
    savedTimer.current = window.setTimeout(() => setSaved(null), 4500)
  }

  return (
    <>
      {session > 0 && (
        <QuickAddSheet
          key={session}
          open={open}
          request={request}
          data={data}
          defaultOwner={defaultOwner}
          onClose={() => setOpen(false)}
          onSaved={handleSaved}
        />
      )}
      {saved && (
        <div role="status"
          className="animate-fade-up fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] flex items-center gap-3 rounded-2xl border border-border bg-surface p-2 pl-3 shadow-card sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
          <SavedCheck />
          <span className="flex-1 text-sm font-semibold text-fg">{saved.message}</span>
          <button type="button" onClick={() => openWith({ type: saved.type })}
            className="h-11 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary/10">
            Add another
          </button>
        </div>
      )}
    </>
  )
}
