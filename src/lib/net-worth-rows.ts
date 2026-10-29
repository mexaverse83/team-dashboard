// One net-worth breakdown for every page (Home, Investments, Reports, Daily
// Brief): the latest finance_net_worth_snapshots row. Its classes plus cash
// minus liabilities add up to net_worth, so the rows always reconcile with the
// total — the audit endpoint's live by_class leaves out cash and debts and
// valued private equity at a hard-coded FX rate.

export interface NetWorthSnapshotRow {
  snapshot_date: string
  net_worth: number
  total_assets?: number | null
  total_liabilities?: number | null
  cash_amount?: number | null
  crypto_amount?: number | null
  stocks_amount?: number | null
  fixed_income_amount?: number | null
  real_estate_amount?: number | null
  retirement_amount?: number | null
  /** Not a column: today's private-equity estimate from GET ?latest=1, for the at-cost check. */
  private_equity_estimate?: number | null
}

/**
 * True when the snapshot still holds private equity at cost: snapshots written
 * before the live valuation shipped stored ~$5k where today's estimate is ~$1M.
 */
export function privateEquityAtCost(s: Pick<NetWorthSnapshotRow, 'stocks_amount' | 'private_equity_estimate'>): boolean {
  const estimate = Number(s.private_equity_estimate) || 0
  return estimate > 0 && s.stocks_amount != null && Number(s.stocks_amount) < estimate / 2
}

/** The caveat Investments, Reports and the Daily Brief all show for such a snapshot. */
export const PE_AT_COST_NOTE = 'private equity still at cost (re-valued on the next snapshot)'

export interface NetWorthRow {
  key: string
  label: string
  value: number
  /** CSS colour (categorical token). */
  color: string
  note?: string
}

export function netWorthRows(s: NetWorthSnapshotRow): NetWorthRow[] {
  const n = (v: number | null | undefined) => Math.round(Number(v) || 0)
  const atCost = privateEquityAtCost(s)
  const rows: NetWorthRow[] = [
    { key: 'real_estate', label: 'Real estate (equity)', value: n(s.real_estate_amount), color: 'hsl(var(--cat-3))', note: 'value − remaining to developer' },
    { key: 'fixed_income', label: 'Fixed income (GBM)', value: n(s.fixed_income_amount), color: 'hsl(var(--cat-1))', note: 'accrued at the net rate' },
    { key: 'retirement', label: 'Retirement (locked)', value: n(s.retirement_amount), color: 'hsl(var(--cat-5))' },
    atCost
      ? { key: 'private_equity', label: 'Stocks & private equity', value: n(s.stocks_amount), color: 'hsl(var(--cat-2))', note: PE_AT_COST_NOTE }
      : { key: 'private_equity', label: 'Stocks & private equity (est.)', value: n(s.stocks_amount), color: 'hsl(var(--cat-2))', note: 'estimate at the live USD rate' },
    { key: 'crypto', label: 'Crypto', value: n(s.crypto_amount), color: 'hsl(var(--cat-4))', note: 'volatile' },
    { key: 'cash', label: 'Cash (emergency fund)', value: n(s.cash_amount), color: 'hsl(var(--cat-6))' },
  ]
  return rows.filter(r => r.value !== 0)
}

/** Fetches the newest snapshot (the same one Home shows). */
export async function fetchLatestNetWorth(signal?: AbortSignal): Promise<NetWorthSnapshotRow | null> {
  const res = await fetch('/api/finance/net-worth?latest=1', { cache: 'no-store', signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const body = await res.json() as { snapshot?: NetWorthSnapshotRow | null; private_equity_estimate?: number | null }
  return body.snapshot ? { ...body.snapshot, private_equity_estimate: body.private_equity_estimate ?? null } : null
}
