'use client'

// Fetch-on-mount + resume refresh for finance clients (CH-09, perf-09, MOB-07).
//  - aborts the in-flight request when the key changes or the component unmounts
//  - ignores out-of-order responses (only the latest request may write state)
//  - keeps the last good data on failure (error is reported alongside it)
//  - `loading` is true only until the first data arrives; later fetches set `refreshing`
import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useResumeRefresh, DEFAULT_MIN_INTERVAL_MS } from './use-resume-refresh'

export interface FinanceDataOptions<T> {
  /** Refetch on tab-visible / online / finance:* events (default true). */
  refetchOnVisible?: boolean
  /** Throttle for visibility refetches (default 60s). */
  minIntervalMs?: number
  /** Skip fetching while false (e.g. waiting for auth). */
  enabled?: boolean
  initialData?: T
}

export interface FinanceDataState<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
  refreshing: boolean
  /** Epoch ms of the last successful fetch. */
  updatedAt: number | null
  refresh: () => Promise<void>
}

type State<T> = Omit<FinanceDataState<T>, 'refresh'>
type Action<T> =
  | { type: 'start' }
  | { type: 'success'; data: T; at: number }
  | { type: 'failure'; error: Error }

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'start':
      return state.data === undefined
        ? { ...state, loading: true, refreshing: false }
        : { ...state, loading: false, refreshing: true }
    case 'success':
      return { data: action.data, error: null, loading: false, refreshing: false, updatedAt: action.at }
    case 'failure':
      return { ...state, error: action.error, loading: false, refreshing: false }
  }
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError'
}

export function useFinanceData<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  { refetchOnVisible = true, minIntervalMs = DEFAULT_MIN_INTERVAL_MS, enabled = true, initialData }: FinanceDataOptions<T> = {},
): FinanceDataState<T> {
  const [state, dispatch] = useReducer(reducer<T>, {
    data: initialData,
    error: null,
    loading: initialData === undefined && enabled && key !== null,
    refreshing: false,
    updatedAt: null,
  } as State<T>)

  const fetcherRef = useRef(fetcher)
  const requestIdRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  /** Starts a fetch; returns its controller (for cleanup) and completion promise. */
  const start = useCallback((): { controller: AbortController; done: Promise<void> } | null => {
    if (!enabled || key === null) return null
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const id = ++requestIdRef.current
    dispatch({ type: 'start' })
    let pending: Promise<T>
    try {
      pending = Promise.resolve(fetcherRef.current(controller.signal))
    } catch (err) {
      pending = Promise.reject(err)
    }
    const done = pending
      .then(
        data => {
          if (id !== requestIdRef.current || controller.signal.aborted) return
          dispatch({ type: 'success', data, at: Date.now() })
        },
        err => {
          if (id !== requestIdRef.current || controller.signal.aborted || isAbort(err)) return
          dispatch({ type: 'failure', error: err instanceof Error ? err : new Error(String(err)) })
        },
      )
    return { controller, done }
  }, [key, enabled])

  const refresh = useCallback(async () => {
    await start()?.done
  }, [start])

  useEffect(() => {
    const request = start()
    // Abort on unmount / key change so a late response can't land afterwards.
    return () => request?.controller.abort()
  }, [start])

  useResumeRefresh(() => { start() }, { minIntervalMs, enabled: refetchOnVisible && enabled && key !== null })

  return { ...state, refresh }
}
