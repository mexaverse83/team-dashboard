import type { TreatmentEvent } from '@/lib/fertility-plan'

// ─── Baby plan — due April 2027 ───────────────────────────────────────────────
// Planning envelope for the pregnancy and birth, following the fertility-plan
// pattern: hardcoded plan constants drive per-month commitments and forecast
// entries, while remaining-amount math is dynamic (planningTotal − tagged spend).
// Market figures: Monterrey private care, Aug 2026 research (prenatal $15–45k
// full pregnancy; delivery all-in incl. honorarios $55–135k; gear $12–50k).

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === '1'

export const BABY_PLAN_TAG = 'baby'

export const BABY_PLAN = DEMO ? {
  name: 'Baby plan',
  dueMonth: '2020-01',
  minTotal: 0,
  maxTotal: 0,
  planningTotal: 0,
  startMonth: '2020-01',
  endMonth: '2020-01',
  events: [] as TreatmentEvent[],
} : {
  name: 'Baby — April 2027',
  dueMonth: '2027-04',
  minTotal: 130000,
  maxTotal: 260000,
  planningTotal: 233000,
  startMonth: '2026-09',
  endMonth: '2027-04',
  events: [
    { date: '2026-09-15', month: '2026-09', amount: 4000, minAmount: 2000, maxAmount: 6500, label: 'Prenatal care (consultas, ultrasonido, labs)' },
    { date: '2026-10-15', month: '2026-10', amount: 4000, minAmount: 2000, maxAmount: 6500, label: 'Prenatal care' },
    { date: '2026-11-15', month: '2026-11', amount: 4000, minAmount: 2000, maxAmount: 6500, label: 'Prenatal care' },
    { date: '2026-12-15', month: '2026-12', amount: 4000, minAmount: 2000, maxAmount: 6500, label: 'Prenatal care' },
    { date: '2027-01-15', month: '2027-01', amount: 4000, minAmount: 2000, maxAmount: 6500, label: 'Prenatal care' },
    { date: '2027-02-15', month: '2027-02', amount: 4000, minAmount: 2000, maxAmount: 6500, label: 'Prenatal care' },
    { date: '2027-03-15', month: '2027-03', amount: 29000, minAmount: 14000, maxAmount: 56500, label: 'Prenatal care + gear & setup' },
    { date: '2027-04-15', month: '2027-04', amount: 180000, minAmount: 100000, maxAmount: 180000, label: 'Birth — hospital package + honorarios' },
  ] satisfies TreatmentEvent[],
}

// Local time, not UTC: plan dates are local calendar dates, and toISOString /
// getUTC* shift Mexico evenings into the next UTC day/month.
function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(date: Date): string {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`
}

export function getBabyEventForMonth(month: string): TreatmentEvent | null {
  return BABY_PLAN.events.find(event => event.month === month) ?? null
}

export function getRemainingBabyEvents(asOf: Date = new Date()): TreatmentEvent[] {
  const today = dayKey(asOf)
  const currentMonth = monthKey(asOf)
  return BABY_PLAN.events.filter(event => {
    if (event.date >= today) return true
    return event.month === currentMonth
  })
}

export function getNextBabyEvent(asOf: Date = new Date()): TreatmentEvent | null {
  return getRemainingBabyEvents(asOf)[0] ?? null
}

export function monthsUntilDue(asOf: Date = new Date()): number {
  const [dueY, dueM] = BABY_PLAN.dueMonth.split('-').map(Number)
  return (dueY - asOf.getFullYear()) * 12 + (dueM - (asOf.getMonth() + 1))
}

// ─── Education fund — Tec degree in 2045 ─────────────────────────────────────
// A Tec degree costs ~$1.0M (tuition-only) to ~$1.2M (all-in) in 2026 pesos.
// Mexican private-education inflation has run ~6%/yr (2–3 pts above CPI), so
// the 2045 liability is ~$3.0–3.6M nominal. Funded by a dedicated GBM
// portfolio from birth; last ~3 years glide to CETES. Deliberately NOT a
// seguro educativo: ~2.4% real historical return, no tax advantage for this
// use (Art. 93 LISR exemption requires the insured to be 60+).

export const EDUCATION_FUND_PLAN = DEMO ? {
  name: 'Education fund',
  monthlyContribution: 0,
  annualReturnRate: 0.08,
  educationInflationRate: 0.06,
  startMonth: '2020-01',
  targetMonth: '2020-01',
  baseYear: 2020,
  tecCostTodayMin: 0,
  tecCostTodayMax: 0,
  tag: 'education-fund',
} : {
  name: 'Education fund 2045',
  monthlyContribution: 7000,
  annualReturnRate: 0.08,
  educationInflationRate: 0.06,
  startMonth: '2027-05',
  targetMonth: '2045-08',
  baseYear: 2026,
  tecCostTodayMin: 1_000_000,
  tecCostTodayMax: 1_200_000,
  tag: 'education-fund',
}

function monthsBetween(fromMonth: string, toMonth: string): number {
  const [fy, fm] = fromMonth.split('-').map(Number)
  const [ty, tm] = toMonth.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export type EducationProjection = {
  months: number
  contributed: number
  projected_value: number
  tec_cost_min: number
  tec_cost_max: number
  coverage_pct_min: number // projected value vs the all-in (max) cost
  coverage_pct_max: number // projected value vs the tuition-only (min) cost
}

/**
 * Future value of the education fund at the target month, contributing
 * `monthlyContribution` from `startMonth` (inclusive) with monthly
 * compounding, versus the Tec cost band inflated to the target year.
 * `currentBalance` (already-saved pesos, e.g. summed education-fund-tagged
 * contributions) also compounds from `asOfMonth` to the target.
 */
export function projectEducationFund(
  currentBalance = 0,
  asOfMonth: string = EDUCATION_FUND_PLAN.startMonth,
): EducationProjection {
  const plan = EDUCATION_FUND_PLAN
  const i = plan.annualReturnRate / 12
  const contributionMonths = Math.max(0, monthsBetween(plan.startMonth, plan.targetMonth))
  const growthMonths = Math.max(0, monthsBetween(asOfMonth, plan.targetMonth))

  const annuityFv = contributionMonths > 0
    ? plan.monthlyContribution * (((1 + i) ** contributionMonths - 1) / i)
    : 0
  const balanceFv = currentBalance * (1 + i) ** growthMonths
  const projected = annuityFv + balanceFv

  const targetYear = Number(plan.targetMonth.slice(0, 4))
  const inflate = (1 + plan.educationInflationRate) ** (targetYear - plan.baseYear)
  const costMin = plan.tecCostTodayMin * inflate
  const costMax = plan.tecCostTodayMax * inflate

  return {
    months: contributionMonths,
    contributed: plan.monthlyContribution * contributionMonths,
    projected_value: Math.round(projected),
    tec_cost_min: Math.round(costMin),
    tec_cost_max: Math.round(costMax),
    coverage_pct_min: costMax > 0 ? Math.round((projected / costMax) * 100) : 0,
    coverage_pct_max: costMin > 0 ? Math.round((projected / costMin) * 100) : 0,
  }
}

// ─── One-time checklist — the deadlines that decide years ────────────────────
// Time-boxed action items surfaced as command-center alerts while their
// window is open. Windows close on their own; completion tracking can move
// to a table if these need manual check-off.

export type BabyChecklistItem = {
  id: string
  title: string
  description: string
  windowStart: string // inclusive day key
  windowEnd: string   // inclusive day key
  severity: 'info' | 'warning'
}

export const BABY_CHECKLIST: BabyChecklistItem[] = DEMO ? [] : [
  {
    id: 'baby-gmm-verify',
    title: 'Verify Laura’s GMM policy for maternity coverage',
    description: 'If a policy with maternity was issued before ~July 2026 the birth and newborn are covered; otherwise plan the delivery out of pocket (budgeted) and insure the baby within 30 days of birth. New policies can no longer cover this pregnancy (10-month waiting period).',
    windowStart: '2026-08-01',
    windowEnd: '2026-09-30',
    severity: 'warning',
  },
  {
    id: 'baby-testamento',
    title: 'September = Mes del Testamento — wills + tutor designation',
    description: 'Both wills at a Nuevo León notaría (~$3,500 each with the September discount, free at state campaign events). Name the baby’s tutor testamentario in the same document. Book in August; September fills up.',
    windowStart: '2026-08-11',
    windowEnd: '2026-09-30',
    severity: 'warning',
  },
  {
    id: 'baby-imss-weeks',
    title: 'Confirm Laura’s 30 IMSS weeks before mid-February 2027',
    description: 'Her incapacidad por maternidad (84 days at 100% salary — she is under the 25-UMA cap) requires 30 semanas cotizadas in the 12 months before it starts (~mid-Feb 2027).',
    windowStart: '2026-08-11',
    windowEnd: '2026-10-31',
    severity: 'info',
  },
  {
    id: 'baby-life-insurance',
    title: 'Bind term life insurance for both parents',
    description: 'Quotes from GNP, Seguros Monterrey NYL, AXA and MetLife (same profile varies up to 40%). Sizing: Bernardo $12–16M, Laura $7–9M, 20-year term with invalidez rider.',
    windowStart: '2026-09-01',
    windowEnd: '2026-12-31',
    severity: 'info',
  },
  {
    id: 'baby-beneficiaries',
    title: 'Sync beneficiaries: GBM, bank accounts, Afores',
    description: 'The will does not automatically reach these balances — beneficiary designations pay out directly and bypass probate. Update GBM contract clauses, Art. 56 bank designations, and Afore sustitutos.',
    windowStart: '2026-09-01',
    windowEnd: '2026-11-30',
    severity: 'info',
  },
  {
    id: 'baby-gmm-newborn',
    title: 'Enroll the baby in GMM within 30 days of birth',
    description: 'Inside the 30-day window the newborn is accepted with minimal or no medical underwriting. Also: acta de nacimiento + CURP first.',
    windowStart: '2027-04-01',
    windowEnd: '2027-05-31',
    severity: 'warning',
  },
  {
    id: 'baby-guarderia-imss',
    title: 'Register for IMSS guardería waitlist (portal STIGI)',
    description: 'Free childcare from 43 days to 4 years for both working parents; the queue moves by strict prelación, so register immediately after birth.',
    windowStart: '2027-04-01',
    windowEnd: '2027-06-30',
    severity: 'info',
  },
  {
    id: 'baby-education-fund-start',
    title: 'Start the $7,000/mo education fund (dedicated GBM portfolio)',
    description: 'Automate it like rent. CSPX/VOO via GBM; cetesdirecto niños as a small teaching account once the CURP exists.',
    windowStart: '2027-05-01',
    windowEnd: '2027-06-30',
    severity: 'info',
  },
]

export function getActiveChecklistItems(asOf: Date = new Date()): BabyChecklistItem[] {
  const today = dayKey(asOf)
  return BABY_CHECKLIST.filter(item => item.windowStart <= today && today <= item.windowEnd)
}
