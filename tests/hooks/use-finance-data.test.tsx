import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useFinanceData } from '@/hooks/use-finance-data'
import { useResumeRefresh } from '@/hooks/use-resume-refresh'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})

describe('useResumeRefresh', () => {
  it('throttles visibility refetches but not app events', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-28T18:00:00Z'))
    const fn = vi.fn()
    renderHook(() => useResumeRefresh(fn, { minIntervalMs: 60_000 }))

    setVisibility('visible')
    expect(fn).not.toHaveBeenCalled() // mount fetch counts as fresh

    vi.setSystemTime(new Date('2026-10-28T18:01:01Z'))
    setVisibility('visible')
    expect(fn).toHaveBeenCalledTimes(1)

    setVisibility('visible')
    expect(fn).toHaveBeenCalledTimes(1) // within 60s again

    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged)
    dispatchFinanceEvent(FINANCE_EVENTS.refresh)
    expect(fn).toHaveBeenCalledTimes(3)

    setVisibility('hidden')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does nothing when disabled', () => {
    const fn = vi.fn()
    renderHook(() => useResumeRefresh(fn, { enabled: false }))
    dispatchFinanceEvent(FINANCE_EVENTS.refresh)
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('useFinanceData', () => {
  it('loads, then refreshes without dropping data', async () => {
    let n = 0
    const fetcher = vi.fn(async () => ({ n: ++n }))
    const { result } = renderHook(() => useFinanceData('summary', fetcher))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data).toEqual({ n: 1 }))
    expect(result.current.loading).toBe(false)
    expect(result.current.updatedAt).not.toBeNull()

    await act(() => result.current.refresh())
    expect(result.current.data).toEqual({ n: 2 })
    expect(result.current.refreshing).toBe(false)
  })

  it('keeps the last good data when a refresh fails', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: 1 })
      .mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useFinanceData('k', fetcher))
    await waitFor(() => expect(result.current.data).toEqual({ ok: 1 }))
    await act(() => result.current.refresh())
    expect(result.current.data).toEqual({ ok: 1 })
    expect(result.current.error?.message).toBe('offline')
  })

  it('ignores out-of-order responses and aborts the stale request', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const signals: AbortSignal[] = []
    const fetcher = vi.fn((signal: AbortSignal) => {
      signals.push(signal)
      return signals.length === 1 ? first.promise : second.promise
    })
    const { result, rerender } = renderHook(({ k }) => useFinanceData(k, fetcher), { initialProps: { k: 'month-09' } })
    rerender({ k: 'month-10' })
    expect(signals[0].aborted).toBe(true)

    await act(async () => { second.resolve('october'); await second.promise })
    await act(async () => { first.resolve('september'); await first.promise })
    expect(result.current.data).toBe('october')
  })

  it('refetches on finance:data-changed', async () => {
    const fetcher = vi.fn(async () => 'x')
    renderHook(() => useFinanceData('k', fetcher))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    act(() => dispatchFinanceEvent(FINANCE_EVENTS.dataChanged))
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  })

  it('waits while disabled or keyless', () => {
    const fetcher = vi.fn(async () => 'x')
    const { result } = renderHook(() => useFinanceData(null, fetcher))
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.loading).toBe(false)
    renderHook(() => useFinanceData('k', fetcher, { enabled: false }))
    expect(fetcher).not.toHaveBeenCalled()
  })
})
