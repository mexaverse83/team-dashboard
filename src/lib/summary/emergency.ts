import { median } from '@/lib/household-metrics'
import { diffDaysKey } from '@/lib/dates'
import { hasTag, isWestPayment, txAmount, WINDFALL_TAG, type TxRow } from '@/lib/summary/history'

export interface EmergencyFundRow {
  current_amount?: number | null
  target_amount?: number | null
  target_months?: number | null
  risk_score?: number | null
  updated_at?: string | null
  created_at?: string | null
  account_allocation_json?: { monthly_essentials?: number | null; essentials_override?: boolean | null } | null
}

/**
 * What the household must cover each month no matter what: the median of the
 * last 3 complete months of needs-category spend (rent, groceries, utilities,
 * transport, health, maintenance — budgeted or not). The WEST payment is
 * savings, and fertility/windfall rows are finished one-offs, so they're out.
 */
export function deriveMonthlyEssentials(
  historyRows: TxRow[],
  { isNeedsCategory, beforeMonth, months = 3 }: { isNeedsCategory: (categoryId: string | null | undefined) => boolean; beforeMonth: string; months?: number },
): { monthly: number; months_used: number } {
  const byMonth = new Map<string, number>()
  for (const t of historyRows) {
    if (t.type && t.type !== 'expense') continue
    const month = (t.transaction_date || '').slice(0, 7)
    if (!month || month >= beforeMonth) continue
    byMonth.set(month, byMonth.get(month) ?? 0)
    if (!isNeedsCategory(t.category_id) || isWestPayment(t) || hasTag(t, 'fertility', WINDFALL_TAG)) continue
    byMonth.set(month, (byMonth.get(month) ?? 0) + txAmount(t))
  }
  const recent = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-months).map(([, v]) => v)
  return { monthly: Math.round(median(recent)), months_used: recent.length }
}

/**
 * Coverage against derived essentials. The stored monthly_essentials is only
 * honoured when explicitly marked as an override — the $25k typed in February
 * made 390k read as 15.6 months when it covers about five.
 */
export function buildEmergencyFund(ef: EmergencyFundRow | null | undefined, derivedEssentials: number, today: string) {
  const current = Number(ef?.current_amount || 0)
  const targetMonths = ef?.target_months && ef.target_months > 0 ? ef.target_months : 6
  const stored = Number(ef?.account_allocation_json?.monthly_essentials || 0)
  const manual = !!ef?.account_allocation_json?.essentials_override && stored > 0
  const essentials = manual ? stored : derivedEssentials > 0 ? derivedEssentials : stored || (Number(ef?.target_amount || 0) / targetMonths)
  const basis: 'derived' | 'manual' = manual || !(derivedEssentials > 0) ? 'manual' : 'derived'
  const target = basis === 'derived' ? Math.round(essentials * targetMonths) : Number(ef?.target_amount || 0) || Math.round(essentials * targetMonths)
  const confirmedAt = (ef?.updated_at || ef?.created_at || null)
  return {
    target,
    current,
    target_months: targetMonths,
    monthly_essentials: Math.round(essentials),
    months_covered: essentials > 0 ? Math.round((current / essentials) * 10) / 10 : 0,
    funded_pct: target > 0 ? Math.round((current / target) * 100) : 0,
    gap: Math.max(0, Math.round(target - current)),
    risk_score: Number(ef?.risk_score || 0),
    essentials_basis: basis,
    derived_essentials: Math.round(derivedEssentials),
    manual_essentials: stored > 0 ? Math.round(stored) : null,
    stored_target: Number(ef?.target_amount || 0),
    confirmed_at: confirmedAt,
    days_since_confirmed: confirmedAt ? Math.max(0, diffDaysKey(confirmedAt.slice(0, 10), today)) : null,
  }
}
