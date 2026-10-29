import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows, hasStableOrder } from '@/lib/supabase-fetch-all'

describe('complete financial queries', () => {
  it('fetches every page in order', async () => {
    const page = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: [3], error: null })
    expect(await fetchAllRows(page, 2, 10, true)).toEqual([1, 2, 3])
    expect(page.mock.calls).toEqual([[0, 1], [2, 3]])
  })
  it('rejects a failed later page rather than returning believable partial totals', async () => {
    const page = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    await expect(fetchAllRows(page, 2, 10, true)).rejects.toThrow('offline')
  })
  it('rejects truncation at the safety limit', async () => {
    await expect(fetchAllRows(async () => ({ data: [1, 2], error: null }), 2, 2, true)).rejects.toThrow('complete-data limit')
  })
  it('rejects non-progressing pagination', async () => {
    await expect(fetchAllRows(vi.fn(), 0)).rejects.toThrow('Invalid pagination')
  })
})

describe('stable ordering (F15, CH-11)', () => {
  const sb = createClient('http://localhost:54321', 'test-key')
  const tx = () => sb.from('finance_transactions').select('*')

  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('detects whether a PostgREST query carries the unique tiebreaker', () => {
    expect(hasStableOrder(tx().order('transaction_date', { ascending: false }).order('id').range(0, 999))).toBe(true)
    expect(hasStableOrder(tx().order('transaction_date', { ascending: false }).range(0, 999))).toBe(false)
    expect(hasStableOrder(tx().range(0, 999))).toBe(false)
    expect(hasStableOrder(tx().order('created_at').order('uuid').range(0, 9), 'uuid')).toBe(true)
    // test doubles without a URL are not second-guessed
    expect(hasStableOrder(Promise.resolve({ data: [], error: null }))).toBe(true)
  })

  it('options form refuses a page query ordered only by a non-unique column', async () => {
    const page = (from: number, to: number) => tx().order('transaction_date', { ascending: false }).range(from, to)
    await expect(fetchAllRows(page, { orderKey: 'id' })).rejects.toThrow(/order\('id'\)/)
  })

  it('options form defaults to strict', async () => {
    const page = vi.fn().mockResolvedValueOnce({ data: [1, 2], error: null }).mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(fetchAllRows(page, { pageSize: 2 })).rejects.toThrow('boom')
  })

  it('legacy positional form keeps working and only warns in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unordered = tx().order('transaction_date').range(0, 1)
    // resolve without a network call: the builder is only inspected, then awaited via a stub
    const page = vi.fn(() => Object.assign(Promise.resolve({ data: [1], error: null }), { url: (unordered as unknown as { url: URL }).url }))
    expect(await fetchAllRows(page, 2)).toEqual([1])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("order('id')"))
  })
})
