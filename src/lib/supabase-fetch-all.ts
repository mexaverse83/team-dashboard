type PageResult<T> = { data: T[] | null; error: { message: string } | null }
type PageQuery<T> = (from: number, to: number) => PromiseLike<PageResult<T>>

export interface FetchAllOptions {
  pageSize?: number
  /** Runaway guard, not a feature. */
  maxRows?: number
  /** Throw on a failed page or on hitting maxRows instead of returning partial rows (default true). */
  strict?: boolean
  /** A unique column the page query must also order by, so offset pages never skip or repeat rows (default 'id'). */
  orderKey?: string
}

/**
 * True when a PostgREST builder's `order=` includes `orderKey` (e.g.
 * 'transaction_date.desc,id.asc'). Builders that don't expose their URL (test
 * doubles) count as ordered: the check is a guard, not a parser.
 */
export function hasStableOrder(query: unknown, orderKey = 'id'): boolean {
  const url = (query as { url?: unknown } | null)?.url
  if (!(url instanceof URL)) return true
  const order = url.searchParams.get('order')
  if (!order) return false
  return order.split(',').some(term => term.split('.')[0] === orderKey)
}

const warned = new Set<string>()

/**
 * Fetch every matching row by paging with .range(). Supabase/PostgREST caps a
 * single response at 1000 rows (server max-rows), so unbounded .select()
 * calls silently truncate once a table grows past that — all-time aggregates
 * then undercount.
 *
 * Offset paging is only correct with a total order: ordering by a non-unique
 * column (transaction_date has ~25 rows on busy days) can repeat or skip rows
 * across a page boundary (F15, CH-11). Always add a unique tiebreaker:
 *
 *   const rows = await fetchAllRows<Tx>((from, to) =>
 *     supabase.from('finance_transactions').select('*')
 *       .order('transaction_date', { ascending: false }).order('id').range(from, to),
 *     { orderKey: 'id' })
 *
 * The options form defaults to strict and throws (outside production) when
 * the query lacks the tiebreaker. The legacy positional form keeps its old
 * defaults (non-strict) and only warns in development.
 */
export async function fetchAllRows<T>(page: PageQuery<T>, options?: FetchAllOptions): Promise<T[]>
export async function fetchAllRows<T>(page: PageQuery<T>, pageSize?: number, maxRows?: number, strict?: boolean): Promise<T[]>
export async function fetchAllRows<T>(
  page: PageQuery<T>,
  pageSizeOrOptions?: number | FetchAllOptions,
  legacyMaxRows?: number,
  legacyStrict?: boolean,
): Promise<T[]> {
  const optionsForm = typeof pageSizeOrOptions === 'object' && pageSizeOrOptions !== null
  const opts: FetchAllOptions = optionsForm ? pageSizeOrOptions as FetchAllOptions : {}
  const pageSize = optionsForm ? (opts.pageSize ?? 1000) : ((pageSizeOrOptions as number | undefined) ?? 1000)
  const maxRows = optionsForm ? (opts.maxRows ?? 20000) : (legacyMaxRows ?? 20000)
  const strict = optionsForm ? (opts.strict ?? true) : (legacyStrict ?? false)
  const orderKey = opts.orderKey ?? 'id'

  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxRows) || maxRows < 1) {
    throw new Error("Invalid pagination limits")
  }
  const rows: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const query = page(from, from + pageSize - 1)
    if (from === 0 && !hasStableOrder(query, orderKey)) {
      const message = `fetchAllRows: page query must also .order('${orderKey}') so offset pages are stable`
      if (optionsForm && process.env.NODE_ENV !== 'production') throw new Error(message)
      if (process.env.NODE_ENV === 'development' && !warned.has(message)) {
        warned.add(message)
        console.warn(message)
      }
    }
    const { data, error } = await query
    if (error || !data) {
      if (strict) throw new Error(error?.message || 'Missing query data')
      break
    }
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
  if (strict && rows.length >= maxRows) throw new Error('Query exceeded the complete-data limit')
  return rows
}
