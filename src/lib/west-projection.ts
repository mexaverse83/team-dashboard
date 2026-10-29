// WEST apartment engine — pure, no I/O. The API route and the slider UI in
// west-tracker both call projectWest() on the same schedule, so the headline
// gap and the scenarios can't disagree (they did, by $10k, while the client
// hard-coded a Dec $100k lump the DB had as $90k). Month keys are strings:
// new Date('2026-12-01').getMonth() is November on a Mexico City clock.

export interface WestSchedule {
  target_amount: number
  /** 'YYYY-MM-DD' */
  delivery_date: string
  monthly_payment: number
  /** 'YYYY-MM' of the last scheduled monthly payment, or null when open-ended. */
  monthly_payment_end_month: string | null
  lump_sum_amount: number
  lump_sum_month: string | null
  /** 'YYYY-MM-DD' of the balloon, when known. */
  lump_sum_date?: string | null
  /** 'YYYY-MM-DD' the remaining sale proceeds land, if still pending. */
  sale_remaining_date: string | null
  /** Sale price − deposit received − debts paid off at closing, floored at 0. */
  sale_net_proceeds: number
  infonavit: number
  current_market_value: number
}

export interface WestBalances {
  paid: number
  investments: number
  crypto: number
}

export interface WestRates {
  /** Net annual GBM return, e.g. 0.095 */
  annual_return: number
  crypto_growth: number
  appreciation: number
  /** Extra household savings into GBM each month (scenarios). */
  monthly_contribution?: number
}

export interface WestMonth {
  month: string
  paid: number
  investments: number
  crypto: number
  infonavit: number
  total: number
  gap: number
  property_value: number
}

export interface WestRun {
  months: WestMonth[]
  total: number
  gap: number
  fully_funded_month: string | null
  property_value: number
}

export function monthlyRateOf(annual: number): number {
  return Math.pow(1 + annual, 1 / 12) - 1
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + n
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** Calendar months from `from` to `to` ('YYYY-MM'), 0 when `to` is not later. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return Math.max(0, (ty - fy) * 12 + (tm - fm))
}

/**
 * Month-by-month funding from `today`'s month through the delivery month.
 * The current month is a snapshot (no payment, no growth); scheduled sale
 * proceeds still land in it when their date is ahead of today.
 */
export function projectWest(schedule: WestSchedule, balances: WestBalances, rates: WestRates, today: string): WestRun {
  const startMonth = today.slice(0, 7)
  const deliveryMonth = schedule.delivery_date.slice(0, 7)
  const r = monthlyRateOf(rates.annual_return)
  const rc = monthlyRateOf(rates.crypto_growth)
  const ra = monthlyRateOf(rates.appreciation)
  const contribution = rates.monthly_contribution || 0
  const saleMonth = schedule.sale_remaining_date?.slice(0, 7) ?? null
  const saleAhead = !!schedule.sale_remaining_date && schedule.sale_remaining_date > today

  let paid = balances.paid
  let inv = balances.investments
  let crypto = balances.crypto
  let property = schedule.current_market_value || schedule.target_amount
  let fullyFunded: string | null = null
  const months: WestMonth[] = []

  for (let month = startMonth; month <= deliveryMonth; month = addMonths(month, 1)) {
    const isCurrent = month === startMonth
    if (!isCurrent) {
      if (schedule.monthly_payment && (!schedule.monthly_payment_end_month || month <= schedule.monthly_payment_end_month)) paid += schedule.monthly_payment
      if (schedule.lump_sum_month && month === schedule.lump_sum_month) paid += schedule.lump_sum_amount
    }
    if (saleAhead && month === saleMonth) inv += schedule.sale_net_proceeds
    if (!isCurrent) {
      inv = (inv + contribution) * (1 + r)
      crypto *= 1 + rc
      property *= 1 + ra
    }
    const total = paid + inv + crypto + schedule.infonavit
    if (!fullyFunded && total >= schedule.target_amount) fullyFunded = month
    months.push({
      month,
      paid: Math.round(paid),
      investments: Math.round(inv),
      crypto: Math.round(crypto),
      infonavit: Math.round(schedule.infonavit),
      total: Math.round(total),
      gap: Math.round(schedule.target_amount - total),
      property_value: Math.round(property),
    })
  }
  const last = months[months.length - 1]
  return {
    months,
    total: last?.total ?? Math.round(paid + inv + crypto + schedule.infonavit),
    gap: last?.gap ?? Math.round(schedule.target_amount - (paid + inv + crypto + schedule.infonavit)),
    fully_funded_month: fullyFunded,
    property_value: last?.property_value ?? Math.round(property),
  }
}

export interface PlanMonth {
  month: string
  capacity: number
  target: number
  notes: string[]
}

export interface SavingsPlanInputs {
  schedule: WestSchedule
  today: string
  /** Median clean net of the last 3 complete months. */
  baseCapacity: number
  annualReturn: number
  purchaseGap: number
  furnishingBudget: number
  installments: Array<{ installment_amount: number; end_date?: string | null }>
  yearlyBonus: number
  /** 1-12; aguinaldo lands in December unless a source says otherwise. */
  bonusMonth?: number
  /** Scheduled baby-plan events; only their excess over `babyRoutine` is new money. */
  babyEvents: Array<{ month: string; amount: number; label?: string }>
  babyRoutine: number
  education: { monthlyContribution: number; startMonth: string }
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

/**
 * Capacity per month = the base run rate, adjusted for what we KNOW changes:
 * MSI plans ending, the end of the WEST monthly payment, aguinaldo, the WEST
 * balloon, baby events beyond routine prenatal care, and the education fund.
 * Targets are capacity-proportional, scaled so their future value at delivery
 * closes purchase gap + furnishing. `feasible` says whether that scale fits.
 */
export function buildSavingsPlan(input: SavingsPlanInputs) {
  const { schedule, today } = input
  const current = today.slice(0, 7)
  const delivery = schedule.delivery_date.slice(0, 7)
  const r = monthlyRateOf(input.annualReturn)
  const bonusMonth = input.bonusMonth ?? 12
  const freedBy = (month: string) => input.installments
    .filter(i => i.end_date && i.end_date.slice(0, 7) < month)
    .reduce((s, i) => s + (i.installment_amount || 0), 0)

  const months: PlanMonth[] = []
  // Plans that already ended are out of the base run rate; only what frees
  // up from here on is new capacity.
  const alreadyFreed = freedBy(current)
  let prevFreed = 0
  for (let month = current; month <= delivery; month = addMonths(month, 1)) {
    const notes: string[] = []
    const freed = freedBy(month) - alreadyFreed
    if (freed > prevFreed) notes.push(`+${money(freed - prevFreed)}/mo freed (MSI ended)`)
    prevFreed = freed
    const westPaymentFreed = schedule.monthly_payment > 0 && schedule.monthly_payment_end_month
      && schedule.monthly_payment_end_month >= addMonths(current, -1) && month > schedule.monthly_payment_end_month
      ? schedule.monthly_payment : 0
    if (westPaymentFreed && month === addMonths(schedule.monthly_payment_end_month as string, 1)) notes.push(`+${money(westPaymentFreed)}/mo freed (WEST payments end)`)
    const lump = schedule.lump_sum_month === month ? schedule.lump_sum_amount : 0
    if (lump > 0) notes.push(`−${money(lump)} WEST balloon payment`)
    const bonus = Number(month.slice(5, 7)) === bonusMonth ? input.yearlyBonus : 0
    if (bonus > 0) notes.push(`+${money(bonus)} aguinaldo`)
    const baby = input.babyEvents
      .filter(e => e.month === month)
      .reduce((s, e) => s + Math.max(0, e.amount - input.babyRoutine), 0)
    if (baby > 0) notes.push(`−${money(baby)} baby plan`)
    const education = input.education.monthlyContribution > 0 && month >= input.education.startMonth ? input.education.monthlyContribution : 0
    if (education > 0 && month === input.education.startMonth) notes.push(`−${money(education)}/mo education fund starts`)
    const capacity = Math.max(0, Math.round(input.baseCapacity + freed + westPaymentFreed + bonus - lump - baby - education))
    months.push({ month, capacity, target: 0, notes })
  }

  const gapToClose = Math.max(0, input.purchaseGap) + input.furnishingBudget
  const fvWeight = (idx: number) => Math.pow(1 + r, months.length - idx)
  const capacityFV = months.reduce((s, m, idx) => s + m.capacity * fvWeight(idx), 0)
  const stretch = gapToClose > 0 && capacityFV > 0 ? gapToClose / capacityFV : 0
  for (const m of months) {
    m.target = Math.round(m.capacity * stretch)
    if (m.capacity === 0 && gapToClose > 0) m.notes.push('no expected surplus — skip month')
  }
  const annuity = (amount: number) => amount > 0 && months.length > 0
    ? Math.ceil(r > 0 ? amount * r / (Math.pow(1 + r, months.length) - 1) : amount / months.length)
    : 0
  const shortfall = Math.max(0, Math.round(gapToClose - capacityFV))
  const feasible = stretch <= 1.05

  return {
    goal: 'fully fund WEST purchase + furnishing at delivery (base-case return)',
    gap_to_close: gapToClose,
    purchase_gap: Math.max(0, input.purchaseGap),
    furnishing_budget: input.furnishingBudget,
    flat_monthly_equivalent: annuity(gapToClose),
    months,
    total_nominal: months.reduce((s, m) => s + m.target, 0),
    // >1 means the plan asks for more than capacity every month
    stretch_factor: Math.round(stretch * 100) / 100,
    feasible,
    capacity_fv_at_delivery: Math.round(capacityFV),
    projected_shortfall_at_delivery: shortfall,
    options: feasible || shortfall <= 0 ? [] : [
      { kind: 'finance' as const, amount: shortfall, label: `Finance ${money(shortfall)} at delivery` },
      { kind: 'cut_furnishing' as const, amount: Math.min(input.furnishingBudget, shortfall), label: `Cut furnishing to ${money(Math.max(0, input.furnishingBudget - shortfall))}` },
      { kind: 'raise_savings' as const, amount: annuity(shortfall), label: `Save ${money(annuity(shortfall))}/mo more than capacity` },
    ],
  }
}
