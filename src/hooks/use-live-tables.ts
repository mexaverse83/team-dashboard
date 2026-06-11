'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type RowsOf<T> = { [K in keyof T]: T[K][] }
type Fetchers<T> = { [K in keyof T]: () => PromiseLike<{ data: T[K][] | null }> }

/** Coalesce bursts of realtime events into a single re-fetch per table. */
const REFETCH_DEBOUNCE_MS = 400

/**
 * Fetch several tables once, then keep them fresh via a single realtime
 * channel. Keys of `fetchers` must be the postgres table names to watch.
 * Re-fetches are debounced per table so a burst of changes (e.g. an agent
 * bulk-updating tickets) costs one query instead of one per event.
 */
export function useLiveTables<T extends Record<string, unknown>>(
  channelName: string,
  fetchers: Fetchers<T>,
): { data: RowsOf<T>; loading: boolean } {
  // Fetchers are inline closures; keep the latest without re-subscribing.
  const fetchersRef = useRef(fetchers)
  useEffect(() => {
    fetchersRef.current = fetchers
  })

  const [data, setData] = useState<RowsOf<T>>(() => {
    const empty = {} as RowsOf<T>
    for (const key of Object.keys(fetchers) as (keyof T)[]) empty[key] = []
    return empty
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const tables = Object.keys(fetchersRef.current) as (keyof T & string)[]

    const fetchTable = (table: keyof T & string) =>
      fetchersRef.current[table]().then(({ data: rows }) => {
        if (!cancelled && rows) setData(prev => ({ ...prev, [table]: rows }))
      })

    Promise.all(tables.map(fetchTable)).then(() => {
      if (!cancelled) setLoading(false)
    })

    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const channel = supabase.channel(channelName)
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(timers.get(table))
        timers.set(table, setTimeout(() => fetchTable(table), REFETCH_DEBOUNCE_MS))
      })
    }
    channel.subscribe()

    return () => {
      cancelled = true
      timers.forEach(t => clearTimeout(t))
      supabase.removeChannel(channel)
    }
  }, [channelName])

  return { data, loading }
}
