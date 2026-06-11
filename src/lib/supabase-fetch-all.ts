type PageQuery<T> = (
  from: number,
  to: number,
) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Fetch every matching row by paging with .range(). Supabase/PostgREST caps a
 * single response at 1000 rows (server max-rows), so unbounded .select()
 * calls silently truncate once a table grows past that — all-time aggregates
 * then undercount. maxRows is a runaway guard, not a feature.
 *
 * Usage:
 *   const rows = await fetchAllRows<Tx>((from, to) =>
 *     supabase.from('finance_transactions').select('*')
 *       .order('transaction_date', { ascending: false }).range(from, to))
 */
export async function fetchAllRows<T>(
  page: PageQuery<T>,
  pageSize = 1000,
  maxRows = 20000,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; from < maxRows; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1)
    if (error || !data) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}
