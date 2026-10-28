'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Plus, RefreshCw } from 'lucide-react'
import { FinanceAuthGuard } from '@/components/finance-auth-guard'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'
import { requestQuickAdd } from '@/lib/finance-navigation'
import { cn } from '@/lib/utils'

const PULL_THRESHOLD = 70
// Pages where a floating button would cover the primary control.
const FAB_HIDDEN = ['/finance/ask']

// One add affordance for every finance page, in the thumb zone (MOB-01).
// Opens the global quick-add sheet; falls back to the transactions deep link
// while no sheet host is mounted.
function QuickAddFab({ pathname }: { pathname: string }) {
  const router = useRouter()
  if (FAB_HIDDEN.includes(pathname)) return null
  return (
    <button
      type="button"
      aria-label="Add transaction"
      data-testid="quick-add-fab"
      onClick={() => { if (!requestQuickAdd()) router.push('/finance/transactions?add=1') }}
      className="btn-primary fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_12px_28px_-10px_hsl(var(--shadow-color)/0.6)] transition-transform active:scale-95 md:bottom-8 md:right-8"
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
    </button>
  )
}

type PullState = { phase: 'idle' } | { phase: 'pulling'; distance: number } | { phase: 'refreshing' } | { phase: 'done'; at: Date }

// Pull down at the top of any finance page → `finance:refresh` (MOB-21).
function usePullToRefresh(): PullState {
  const [state, setState] = useState<PullState>({ phase: 'idle' })
  const start = useRef<number | null>(null)
  const distance = useRef(0)

  useEffect(() => {
    let doneTimer = 0
    const onStart = (event: TouchEvent) => {
      const target = event.target as Element | null
      if (window.scrollY > 0 || target?.closest?.('[role="dialog"], [data-no-pull-refresh], input, textarea, select')) { start.current = null; return }
      start.current = event.touches[0]?.clientY ?? null
      distance.current = 0
    }
    const onMove = (event: TouchEvent) => {
      if (start.current == null) return
      const dy = (event.touches[0]?.clientY ?? 0) - start.current
      if (dy <= 0 || window.scrollY > 0) { distance.current = 0; setState(s => s.phase === 'pulling' ? { phase: 'idle' } : s); return }
      distance.current = dy
      if (dy > 12) setState({ phase: 'pulling', distance: Math.min(dy, PULL_THRESHOLD * 1.6) })
    }
    const onEnd = () => {
      if (start.current == null) return
      start.current = null
      if (distance.current < PULL_THRESHOLD) { setState(s => s.phase === 'pulling' ? { phase: 'idle' } : s); return }
      setState({ phase: 'refreshing' })
      dispatchFinanceEvent(FINANCE_EVENTS.refresh)
      window.clearTimeout(doneTimer)
      doneTimer = window.setTimeout(() => {
        setState({ phase: 'done', at: new Date() })
        doneTimer = window.setTimeout(() => setState({ phase: 'idle' }), 2500)
      }, 900)
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.clearTimeout(doneTimer)
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return state
}

function PullIndicator({ state }: { state: PullState }) {
  if (state.phase === 'idle') return null
  const ready = state.phase === 'pulling' && state.distance >= PULL_THRESHOLD
  const label = state.phase === 'pulling' ? (ready ? 'Release to refresh' : 'Pull to refresh')
    : state.phase === 'refreshing' ? 'Refreshing…'
    : `Updated ${state.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-40 flex justify-center md:top-4" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-label font-medium text-fg-secondary shadow-card"
        style={state.phase === 'pulling' ? { transform: `translateY(${Math.round(state.distance / 4)}px)` } : undefined}>
        <RefreshCw aria-hidden="true" className={cn('h-3.5 w-3.5', state.phase === 'refreshing' && 'animate-spin', ready && 'text-positive')} />
        {label}
      </span>
    </div>
  )
}

function FinanceShell({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const pull = usePullToRefresh()
  return (
    <>
      <PullIndicator state={pull} />
      {children}
      <QuickAddFab pathname={pathname} />
    </>
  )
}

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Don't guard the login page
  if (pathname === '/finance/login') {
    return <>{children}</>
  }

  return (
    <FinanceAuthGuard>
      <FinanceShell pathname={pathname}>{children}</FinanceShell>
    </FinanceAuthGuard>
  )
}
