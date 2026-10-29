import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>

/**
 * In-memory PostgREST stand-in that honours the filters the summary engine
 * uses (eq, gt/gte/lt/lte, contains, in, order, range, limit) so builders can
 * be exercised end to end on fixture rows.
 */
export function fakeSupabase(tables: Record<string, Row[]>, failing: string[] = []): SupabaseClient {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = []
    let orderKeys: Array<{ key: string; asc: boolean }> = []
    let start = 0
    let end = Infinity
    const chain: Record<string, unknown> = {}
    const cmp = (a: unknown, b: unknown) => String(a ?? '').localeCompare(String(b ?? ''))
    Object.assign(chain, {
      select: () => chain,
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return chain },
      gt: (k: string, v: unknown) => { filters.push(r => cmp(r[k], v) > 0); return chain },
      gte: (k: string, v: unknown) => { filters.push(r => cmp(r[k], v) >= 0); return chain },
      lt: (k: string, v: unknown) => { filters.push(r => cmp(r[k], v) < 0); return chain },
      lte: (k: string, v: unknown) => { filters.push(r => cmp(r[k], v) <= 0); return chain },
      in: (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return chain },
      contains: (k: string, v: unknown[]) => { filters.push(r => Array.isArray(r[k]) && v.every(x => (r[k] as unknown[]).includes(x))); return chain },
      order: (key: string, opts?: { ascending?: boolean }) => { orderKeys = [...orderKeys, { key, asc: opts?.ascending !== false }]; return chain },
      range: (a: number, b: number) => { start = a; end = b + 1; return chain },
      limit: (n: number) => { end = start + n; return chain },
      then: (ok: (r: unknown) => unknown, fail?: (e: unknown) => unknown) => {
        if (failing.includes(table)) return Promise.resolve({ data: null, error: { message: 'boom' } }).then(ok, fail)
        let rows = (tables[table] ?? []).filter(r => filters.every(f => f(r)))
        if (orderKeys.length) {
          rows = [...rows].sort((a, b) => {
            for (const { key, asc } of orderKeys) {
              const c = cmp(a[key], b[key])
              if (c !== 0) return asc ? c : -c
            }
            return 0
          })
        }
        return Promise.resolve({ data: rows.slice(start, end), error: null }).then(ok, fail)
      },
    })
    return chain
  }
  return { from } as unknown as SupabaseClient
}
