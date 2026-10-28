'use client'

// Fetch-on-mount + resume refresh for finance clients (CH-09, perf-09, MOB-07).
//  - aborts the in-flight request when the key changes or the component unmounts
//  - ignores out-of-order responses (only the latest request may write state)
//  - keeps the last good data on failure (error is reported alongside it)
//  - `loading` is true only until the first data arrives; later fetches set `refreshing`
//  - a key change starts clean (data/error reset, loading true) so the old key's
//    numbers never show under the new key's heading; opt out with keepPreviousData
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
  /** Keep showing the previous key's data (as `refreshing`) while a new key loads (default false). */
  keepPreviousData?: boolean
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

type State<T> = Omit<FinanceDataState<T>, 'refresh'> & {
  /** The key that `data` / `error` belong to. */
  stateKey: string | null
}
type Action<T> =
  | { type: 'start'; key: string; keepPrevious: boolean }
  | { type: 'success'; key: string; data: T; at: number }
  | { type: 'failure'; key: string; error: Error }

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
  switch (action.type) {
    case 'start': {
      const base = state.stateKey === action.key || action.keepPrevious
        ? { ...state, stateKey: action.key }
        : { data: undefined, error: null, updatedAt: null, stateKey: action.key }
      return base.data === undefined
        ? { ...base, loading: true, refreshing: false }
        : { ...base, loading: false, refreshing: true }
    }
    case 'success':
      return { data: action.data, error: null, loading: false, refreshing: false, updatedAt: action.at, stateKey: action.key }
    case 'failure':
      return { ...state, error: action.error, loading: false, refreshing: false, stateKey: action.key }
  }
}

function isAbort(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError'
}

export function useFinanceData<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  { refetchOnVisible = true, minIntervalMs = DEFAULT_MIN_INTERVAL_MS, enabled = true, initialData, keepPreviousData = false }: FinanceDataOptions<T> = {},
): FinanceDataState<T> {
  const [state, dispatch] = useReducer(reducer<T>, {
    data: initialData,
    error: null,
    loading: initialData === undefined && enabled && key !== null,
    refreshing: false,
    updatedAt: null,
    stateKey: initialData === undefined ? null : key,
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
    dispatch({ type: 'start', key, keepPrevious: keepPreviousData })
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
          dispatch({ type: 'success', key, data, at: Date.now() })
        },
        err => {
          if (id !== requestIdRef.current || controller.signal.aborted || isAbort(err)) return
          dispatch({ type: 'failure', key, error: err instanceof Error ? err : new Error(String(err)) })
        },
      )
    return { controller, done }
  }, [key, enabled, keepPreviousData])

  const refresh = useCallback(async () => {
    await start()?.done
  }, [start])

  useEffect(() => {
    const request = start()
    // Abort on unmount / key change so a late response can't land afterwards.
    return () => request?.controller.abort()
  }, [start])

  useResumeRefresh(() => { start() }, { minIntervalMs, enabled: refetchOnVisible && enabled && key !== null })

  const { stateKey, ...visible } = state
  // Between a key change and its 'start' dispatch (one render), hide the old
  // key's data/error unless the caller asked to keep it.
  if (!keepPreviousData && stateKey !== key && (visible.data !== undefined || visible.error !== null)) {
    return { data: undefined, error: null, loading: enabled && key !== null, refreshing: false, updatedAt: null, refresh }
  }
  return { ...visible, refresh }
}
