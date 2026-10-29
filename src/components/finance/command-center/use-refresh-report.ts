'use client'

import { useEffect, useRef } from 'react'
import { FINANCE_EVENTS, onFinanceEvent } from '@/lib/finance-events'
import type { FinanceRefreshDetail } from '@/lib/finance-navigation'

interface QueryState { loading?: boolean; refreshing: boolean; error: Error | null; updatedAt: number | null }

interface Pending {
  resolve: () => void
  reject: (error: Error) => void
  baseline: Array<number | null>
  started: boolean
}

/**
 * Reports when the page's useFinanceData queries finish a `finance:refresh`
 * (they refetch on the event themselves), so pull-to-refresh can say
 * "Updated" or "Couldn't refresh" truthfully.
 */
export function useRefreshReport(queries: QueryState[]) {
  const queriesRef = useRef(queries)
  const pendingRef = useRef<Pending | null>(null)
  useEffect(() => { queriesRef.current = queries })

  useEffect(() => onFinanceEvent<FinanceRefreshDetail | undefined>(FINANCE_EVENTS.refresh, detail => {
    if (!detail?.waitUntil) return
    pendingRef.current?.reject(new Error('superseded'))
    detail.waitUntil(new Promise<void>((resolve, reject) => {
      pendingRef.current = { resolve, reject, baseline: queriesRef.current.map(q => q.updatedAt), started: false }
    }))
  }), [])

  useEffect(() => {
    const pending = pendingRef.current
    if (!pending) return
    // A query that never loaded refetches as `loading`, not `refreshing`.
    if (queries.some(q => q.refreshing || q.loading)) { pending.started = true; return }
    if (!pending.started) return
    pendingRef.current = null
    const updated = queries.some((q, i) => q.updatedAt !== pending.baseline[i])
    const failed = queries.some((q, i) => q.error && q.updatedAt === pending.baseline[i])
    if (updated && !failed) pending.resolve()
    else pending.reject(new Error('refresh failed'))
  })
}
