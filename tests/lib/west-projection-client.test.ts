import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Fresh module per test — the cache is module-level state.
async function freshModule() {
  vi.resetModules()
  return await import('@/lib/west-projection-client')
}

const okResponse = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) })

describe('fetchWestProjection', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('shares one request across concurrent callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ target: 11204000 }))
    vi.stubGlobal('fetch', fetchMock)
    const { fetchWestProjection } = await freshModule()

    const [a, b, c] = await Promise.all([fetchWestProjection(), fetchWestProjection(), fetchWestProjection()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ target: 11204000 })
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('reuses the cached response for sequential callers within the TTL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(okResponse({ savings_plan: { months: [{ month: '2026-07', target: 72788 }] } }))
      .mockResolvedValueOnce(okResponse({ savings_plan: { months: [{ month: '2026-07', target: 72828 }] } }))
    vi.stubGlobal('fetch', fetchMock)
    const { fetchWestProjection, westMonthTarget } = await freshModule()

    const first = await fetchWestProjection()
    const second = await fetchWestProjection()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(westMonthTarget(first, '2026-07')).toBe(72788)
    expect(westMonthTarget(second, '2026-07')).toBe(72788)
  })

  it('does not cache failures, so the next caller retries', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(okResponse({ target: 1 }))
    vi.stubGlobal('fetch', fetchMock)
    const { fetchWestProjection } = await freshModule()

    expect(await fetchWestProjection()).toBeNull()
    expect(await fetchWestProjection()).toEqual({ target: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('resolves null on network errors instead of rejecting', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { fetchWestProjection } = await freshModule()
    await expect(fetchWestProjection()).resolves.toBeNull()
  })
})

describe('westMonthTarget', () => {
  it('returns null for missing plans, months, or malformed payloads', async () => {
    const { westMonthTarget } = await freshModule()
    expect(westMonthTarget(null, '2026-07')).toBeNull()
    expect(westMonthTarget({}, '2026-07')).toBeNull()
    expect(westMonthTarget({ savings_plan: { months: [{ month: '2026-08', target: 5 }] } }, '2026-07')).toBeNull()
  })
})
