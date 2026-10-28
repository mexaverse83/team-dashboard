'use client'

// Refetch when the app comes back (perf-09, MOB-07, CH-09). Replaces the
// copy-pasted `visibilitychange → fetchData()` effects:
//  - tab visible again / back online → refetch, but at most once per
//    `minIntervalMs` (default 60s) so flipping apps doesn't re-download everything
//  - `finance:data-changed` / `finance:refresh` window events → refetch now
import { useEffect, useRef } from 'react'
import { FINANCE_EVENTS } from '@/lib/finance-events'

export interface ResumeRefreshOptions {
  /** Minimum gap between visibility/online refetches (default 60_000). Events bypass it. */
  minIntervalMs?: number
  enabled?: boolean
  /** Also listen to the app events (default true). */
  listenToAppEvents?: boolean
}

export const DEFAULT_MIN_INTERVAL_MS = 60_000

export function useResumeRefresh(fn: () => void, { minIntervalMs = DEFAULT_MIN_INTERVAL_MS, enabled = true, listenToAppEvents = true }: ResumeRefreshOptions = {}) {
  const fnRef = useRef(fn)
  const lastRunRef = useRef(0)

  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    // The caller fetched on mount; the throttle window starts now.
    lastRunRef.current = Date.now()

    const run = (force: boolean) => {
      const now = Date.now()
      if (!force && now - lastRunRef.current < minIntervalMs) return
      lastRunRef.current = now
      fnRef.current()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run(false)
    }
    const onOnline = () => run(false)
    const onAppEvent = () => run(true)

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', onOnline)
    if (listenToAppEvents) {
      window.addEventListener(FINANCE_EVENTS.dataChanged, onAppEvent)
      window.addEventListener(FINANCE_EVENTS.refresh, onAppEvent)
    }
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', onOnline)
      window.removeEventListener(FINANCE_EVENTS.dataChanged, onAppEvent)
      window.removeEventListener(FINANCE_EVENTS.refresh, onAppEvent)
    }
  }, [enabled, minIntervalMs, listenToAppEvents])
}
