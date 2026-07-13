export type TreatmentEvent = {
  date: string
  month: string
  amount: number
  minAmount: number
  maxAmount: number
  label: string
}

export type CutCandidate = {
  category: string
  icon?: string
  budget: number
}

export type CutRecommendation = {
  category: string
  icon: string
  current_budget: number
  recommended_cap: number
  cut_amount: number
}

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === '1'

export const FERTILITY_TREATMENT_PLAN = DEMO ? {
  name: 'Family plan',
  minTotal: 0,
  maxTotal: 0,
  planningTotal: 0,
  startMonth: '2020-01',
  endMonth: '2020-01',
  events: [] as TreatmentEvent[],
} : {
  name: 'Fertility treatment',
  minTotal: 260000,
  maxTotal: 260000,
  planningTotal: 260000,
  startMonth: '2026-05',
  endMonth: '2026-08',
  // Updated 2026-07-13: the July commitment is $12,000 due July 22.
  // The dashboard's remaining-amount math is dynamic (planningTotal − tagged
  // spend); these events only drive per-month commitments and forecast entries.
  events: [
    { date: '2026-05-15', month: '2026-05', amount: 92000, minAmount: 92000, maxAmount: 92000, label: 'Treatment payment 1' },
    { date: '2026-06-15', month: '2026-06', amount: 50000, minAmount: 50000, maxAmount: 50000, label: 'Treatment payment 2' },
    { date: '2026-07-22', month: '2026-07', amount: 12000, minAmount: 12000, maxAmount: 12000, label: 'Final treatment payment (1 of 2)' },
    { date: '2026-08-15', month: '2026-08', amount: 13672, minAmount: 13672, maxAmount: 13672, label: 'Final treatment payment (2 of 2)' },
  ] satisfies TreatmentEvent[],
}

const CUT_RATES: Record<string, number> = {
  'Dining Out': 0.45,
  Shopping: 0.4,
  Entertainment: 0.5,
  Travel: 0.5,
  Subscriptions: 0.25,
  Gifts: 0.35,
  Business: 0.15,
  Education: 0.1,
  Other: 0.2,
}

// Local time, not UTC: plan dates are local calendar dates, and toISOString /
// getUTC* shift Mexico evenings into the next UTC day/month.
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(date: Date): string {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`
}

export function getTreatmentEventForMonth(month: string): TreatmentEvent | null {
  return FERTILITY_TREATMENT_PLAN.events.find(event => event.month === month) ?? null
}

export function getRemainingTreatmentEvents(asOf: Date = new Date()): TreatmentEvent[] {
  const today = dayKey(asOf)
  const currentMonth = monthKey(asOf)

  return FERTILITY_TREATMENT_PLAN.events.filter(event => {
    if (event.date >= today) return true
    return event.month === currentMonth
  })
}

export function getNextTreatmentEvent(asOf: Date = new Date()): TreatmentEvent | null {
  return getRemainingTreatmentEvents(asOf)[0] ?? null
}

export function buildFertilityCutRecommendations(
  candidates: CutCandidate[],
  targetCut: number,
): CutRecommendation[] {
  if (targetCut <= 0) return []

  let remaining = targetCut
  const recommendations: CutRecommendation[] = []

  const ranked = candidates
    .map(candidate => {
      const rate = CUT_RATES[candidate.category] ?? 0
      return { ...candidate, cut: Math.round(candidate.budget * rate) }
    })
    .filter(candidate => candidate.cut > 0)
    .sort((a, b) => b.cut - a.cut)

  for (const candidate of ranked) {
    if (remaining <= 0) break
    const cut = Math.min(candidate.cut, remaining)
    recommendations.push({
      category: candidate.category,
      icon: candidate.icon || '',
      current_budget: Math.round(candidate.budget),
      recommended_cap: Math.max(0, Math.round(candidate.budget - cut)),
      cut_amount: Math.round(cut),
    })
    remaining -= cut
  }

  return recommendations
}
