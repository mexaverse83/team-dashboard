// Shared browser-side fetch for /api/finance/investments/west-projection.
// The endpoint recomputes its savings plan from live investment and crypto
// balances, so back-to-back requests can return slightly different monthly
// targets — components on one screen must share a single response or the
// same "WEST target" renders with several different values.

// 5 minutes: long enough that a polling component (wolff-widget refreshes
// every 30s) keeps quoting the same number the mount-once cards captured.
let cache: { at: number; promise: Promise<unknown> } | null = null
const TTL_MS = 300_000

export function fetchWestProjection<T>(): Promise<T | null> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.promise as Promise<T | null>
  const promise: Promise<unknown> = fetch('/api/finance/investments/west-projection')
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
    .then(d => {
      // Don't cache failures — the next caller should retry.
      if (d === null && cache?.promise === promise) cache = null
      return d
    })
  cache = { at: now, promise }
  return promise as Promise<T | null>
}

/** Monthly savings target from the plan for a `YYYY-MM` month, if present. */
export function westMonthTarget(west: unknown, month: string): number | null {
  const months = (west as { savings_plan?: { months?: Array<{ month: string; target: number }> } })?.savings_plan?.months
  const m = months?.find(x => x.month === month)
  return m?.target ?? null
}
