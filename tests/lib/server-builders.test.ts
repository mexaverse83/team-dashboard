/**
 * In-process builders (src/lib/server/*): the route logic moved behind
 * buildSummary(supabase, …) / getWestProjection(supabase, …) with no
 * behaviour change. These tests pin the signatures other streams code against.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildSummary, SummaryUnavailableError } from '@/lib/server/summary'
import { getWestProjection, WestTargetNotFoundError } from '@/lib/server/west'

type Result = { data: unknown; error: { message: string } | null }

/** Chainable PostgREST stand-in: every modifier returns the chain; awaiting resolves the table's result. */
function fakeSupabase(results: Record<string, Result> = {}) {
  const from = vi.fn((table: string) => {
    const result = results[table] ?? { data: [], error: null }
    const chain: Record<string, unknown> = {
      then: (ok: (r: Result) => unknown, fail?: (e: unknown) => unknown) => Promise.resolve(result).then(ok, fail),
    }
    for (const m of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'order', 'limit', 'range', 'single']) {
      chain[m] = vi.fn(() => chain)
    }
    return chain
  })
  return { from } as unknown as SupabaseClient & { from: typeof from }
}

const NOW = new Date('2026-10-28T18:00:00Z')

describe('buildSummary (lib/server/summary)', () => {
  it('builds the summary in-process on the Mexico City calendar', async () => {
    const supabase = fakeSupabase()
    const summary = await buildSummary(supabase, { months: 3, now: NOW })
    expect(summary.current_month).toMatchObject({ month: '2026-10', day_of_month: 28, days_in_month: 31, total_spent: 0 })
    expect(summary.period).toEqual({ start: '2026-08-01', end: '2026-10-28' })
    expect(summary.month_projection.projected_savings).toBeTypeOf('number')
    expect(summary.crypto).toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('finance_transactions')
  })

  it('evening in Mexico City is still the same day (UTC already rolled over)', async () => {
    const summary = await buildSummary(fakeSupabase(), { now: new Date('2026-11-01T01:30:00Z') })
    expect(summary.current_month.month).toBe('2026-10')
    expect(summary.current_month.day_of_month).toBe(31)
  })

  it('clamps months to 1–12', async () => {
    const summary = await buildSummary(fakeSupabase(), { months: 99, now: NOW })
    expect(summary.period.start).toBe('2025-11-01')
  })

  it('throws SummaryUnavailableError when a read fails (route answers 503)', async () => {
    const supabase = fakeSupabase({ finance_categories: { data: null, error: { message: 'boom' } } })
    await expect(buildSummary(supabase, { now: NOW })).rejects.toBeInstanceOf(SummaryUnavailableError)
  })
})

describe('getWestProjection (lib/server/west)', () => {
  it('throws WestTargetNotFoundError without an active target (route answers 404)', async () => {
    await expect(getWestProjection(fakeSupabase(), { now: NOW })).rejects.toBeInstanceOf(WestTargetNotFoundError)
  })

  it('propagates read errors (route answers 500)', async () => {
    const supabase = fakeSupabase({ finance_real_estate_targets: { data: null, error: { message: 'denied' } } })
    await expect(getWestProjection(supabase, { now: NOW })).rejects.toMatchObject({ message: 'denied' })
  })
})
