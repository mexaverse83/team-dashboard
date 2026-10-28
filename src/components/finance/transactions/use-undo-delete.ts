'use client'

// Delete with a 5s Undo (MOB-14). The row hides immediately; the DB delete
// runs when the toast expires, the page is hidden/left (pagehide) or the
// list unmounts, so leaving the page never resurrects or loses a delete.
import { useCallback, useEffect, useRef, useState } from 'react'

export const UNDO_WINDOW_MS = 5000

interface Pending<T> { item: T; timer: number }

export function useUndoDelete<T extends { id: string }>(commit: (item: T) => Promise<void> | void) {
  const pending = useRef(new Map<string, Pending<T>>())
  const commitRef = useRef(commit)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [last, setLast] = useState<T | null>(null)

  useEffect(() => { commitRef.current = commit }, [commit])

  const sync = () => setHidden(new Set(pending.current.keys()))

  const flush = useCallback((id: string) => {
    const entry = pending.current.get(id)
    if (!entry) return
    window.clearTimeout(entry.timer)
    pending.current.delete(id)
    void commitRef.current(entry.item)
  }, [])

  const remove = useCallback((item: T) => {
    if (pending.current.has(item.id)) return
    const timer = window.setTimeout(() => {
      flush(item.id)
      sync()
      setLast(current => (current?.id === item.id ? null : current))
    }, UNDO_WINDOW_MS)
    pending.current.set(item.id, { item, timer })
    sync()
    setLast(item)
  }, [flush])

  const undo = useCallback((id?: string) => {
    const target = id ?? last?.id
    if (!target) return
    const entry = pending.current.get(target)
    if (entry) window.clearTimeout(entry.timer)
    pending.current.delete(target)
    sync()
    setLast(null)
  }, [last])

  useEffect(() => {
    const map = pending.current
    const flushAll = () => { Array.from(map.keys()).forEach(flush) }
    window.addEventListener('pagehide', flushAll)
    return () => {
      window.removeEventListener('pagehide', flushAll)
      flushAll()
    }
  }, [flush])

  return { remove, undo, hidden, last, dismiss: () => setLast(null) }
}
