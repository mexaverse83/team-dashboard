import type { SummaryWestPlan } from '@/lib/summary/types'

// The home hero reads `summary.west_plan` (WS4). Until that field ships, the
// same numbers are read straight off the WEST projection response — no new
// math here, only lookups and the two ratios the contract also defines.
export interface HomeWestPlan {
  /** Stretch target: full funding of purchase + furnishing this month. */
  month_target: number
  /** Realistic monthly target the bar is coloured against. */
  capacity_target: number
  purchase_gap: number | null
  furnishing_budget: number | null
  months_to_delivery: number | null
  /** Projected value at delivery as % of the purchase target. */
  funded_pct: number | null
  /** Ahead (+) / behind (−) the capacity plan since January; summary only. */
  cumulative_vs_capacity_since_jan: number | null
  source: 'summary' | 'projection'
}

interface WestProjectionLike {
  target?: number
  months_to_delivery?: number
  projected_at_delivery?: { total_projected?: number } | null
  savings_plan?: {
    purchase_gap?: number
    furnishing_budget?: number
    months?: Array<{ month: string; target: number; capacity?: number }>
  } | null
}

export function resolveWestPlan(
  summaryPlan: SummaryWestPlan | null | undefined,
  projection: unknown,
  month: string,
): HomeWestPlan | null {
  if (summaryPlan && summaryPlan.capacity_target > 0) {
    return {
      month_target: summaryPlan.month_target,
      capacity_target: summaryPlan.capacity_target,
      purchase_gap: summaryPlan.purchase_gap ?? null,
      furnishing_budget: summaryPlan.furnishing_budget ?? null,
      months_to_delivery: summaryPlan.months_to_delivery ?? null,
      funded_pct: summaryPlan.funded_pct ?? null,
      cumulative_vs_capacity_since_jan: summaryPlan.cumulative_vs_capacity_since_jan ?? null,
      source: 'summary',
    }
  }
  const west = projection as WestProjectionLike | null
  const row = west?.savings_plan?.months?.find(m => m.month === month)
  if (!row || !(row.target > 0)) return null
  const target = Number(west?.target) || 0
  const projected = Number(west?.projected_at_delivery?.total_projected) || 0
  return {
    month_target: row.target,
    // Older payloads have no capacity; then the stretch target is the only bar.
    capacity_target: row.capacity && row.capacity > 0 ? row.capacity : row.target,
    purchase_gap: west?.savings_plan?.purchase_gap ?? null,
    furnishing_budget: west?.savings_plan?.furnishing_budget ?? null,
    months_to_delivery: west?.months_to_delivery ?? null,
    funded_pct: target > 0 && projected > 0 ? Math.round((projected / target) * 100) : null,
    cumulative_vs_capacity_since_jan: null,
    source: 'projection',
  }
}
