import { describe, expect, it, vi } from 'vitest'
import { fetchAllRows } from '@/lib/supabase-fetch-all'

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
