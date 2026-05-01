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

export const FERTILITY_TREATMENT_PLAN = {
  name: 'Fertility treatment',
  minTotal: 150000,
  maxTotal: 150000,
  planningTotal: 150000,
  startMonth: '2026-05',
  endMonth: '2026-07',
  events: [
    { date: '2026-05-15', month: '2026-05', amount: 50000, minAmount: 50000, maxAmount: 50000, label: 'Treatment payment 1' },
    { date: '2026-06-15', month: '2026-06', amount: 50000, minAmount: 50000, maxAmount: 50000, label: 'Treatment payment 2' },
    { date: '2026-07-15', month: '2026-07', amount: 50000, minAmount: 50000, maxAmount: 50000, label: 'Treatment payment 3' },
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

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function getTreatmentEventForMonth(month: string): TreatmentEvent | null {
  return FERTILITY_TREATMENT_PLAN.events.find(event => event.month === month) ?? null
}

export function getRemainingTreatmentEvents(asOf: Date = new Date()): TreatmentEvent[] {
  const today = asOf.toISOString().slice(0, 10)
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
