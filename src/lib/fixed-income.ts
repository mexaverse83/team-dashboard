// Fixed-income valuation helpers.
//
// The stored `principal` is the last *confirmed* balance (from the GBM
// statement). Between confirmations we show an ESTIMATE that accrues the net
// annual rate, compounded monthly, from the date the balance was last
// confirmed (`updated_at`). Saving the holding re-stamps `updated_at`, so
// entering a real statement balance re-anchors the estimate to truth.

export interface FixedIncomeLike {
  principal?: number | null
  annual_rate?: number | null
  commission_rate?: number | null
  net_annual_rate?: number | null
  updated_at?: string | null
}

// DB may store rates as percent (10.26) instead of decimal (0.1026)
export function normalizeRate(r: number | null | undefined): number {
  if (r == null) return 0
  return r > 1 ? r / 100 : r
}

// Net rate = gross − commission when a commission exists (stored net is
// unreliable); otherwise stored net, else gross.
export function effectiveNetRate(inst: FixedIncomeLike): number {
  const gross = normalizeRate(inst.annual_rate)
  const comm = normalizeRate(inst.commission_rate)
  if (inst.commission_rate != null) return gross - comm
  if (inst.net_annual_rate != null) return normalizeRate(inst.net_annual_rate)
  return gross
}

// Whole calendar months between the anchor date and `now` (≥ 0). Using whole
// months makes the estimate step once per month, matching a monthly statement.
export function monthsSinceConfirmed(inst: FixedIncomeLike, now: Date = new Date()): number {
  if (!inst.updated_at) return 0
  const a = new Date(inst.updated_at)
  if (Number.isNaN(a.getTime())) return 0
  // UTC components: updated_at is a UTC timestamp, so counting in UTC keeps the
  // monthly step deterministic regardless of server timezone.
  const months = (now.getUTCFullYear() - a.getUTCFullYear()) * 12 + (now.getUTCMonth() - a.getUTCMonth())
  return months > 0 ? months : 0
}

// Estimated current value: principal compounded at the net monthly rate over
// the whole months since it was last confirmed. Returns the bare principal
// when there's no rate or it was confirmed this month.
export function accruedValue(inst: FixedIncomeLike, now: Date = new Date()): number {
  const principal = inst.principal || 0
  const rate = effectiveNetRate(inst)
  const months = monthsSinceConfirmed(inst, now)
  if (rate <= 0 || months <= 0) return principal
  const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1
  return principal * Math.pow(1 + monthlyRate, months)
}
