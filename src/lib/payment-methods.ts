// How a transaction was paid, plus BBVA Infinite statement-cycle math.
//
// BBVA Infinite: statement cuts on the 9th (purchases through the 9th are on
// that statement) and payment is due on the 29th of the same month. So a
// purchase on Sep 5 is paid Sep 29; a purchase on Sep 12 is paid Oct 29.

import { OWNERS, ownersEqual } from '@/lib/owners'

export const PAYMENT_METHODS = [
  { value: 'bbva_infinite', label: 'BBVA Infinite', short: 'BBVA', icon: '💳' },
  { value: 'amex', label: 'American Express', short: 'Amex', icon: '💳' },
  { value: 'cash', label: 'Cash', short: 'Cash', icon: '💵' },
  { value: 'transfer', label: 'Transfer', short: 'Transfer', icon: '🏦' },
] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export function getPaymentMethod(value?: string | null) {
  return PAYMENT_METHODS.find(m => m.value === value) ?? null
}

export const BBVA_CUT_DAY = 9
export const BBVA_DUE_DAY = 29

export interface StatementCycle {
  /** First purchase day included (YYYY-MM-DD) — the day after the previous cut */
  start: string
  /** Fecha de corte — last purchase day included (YYYY-MM-DD) */
  cut: string
  /** Fecha límite de pago (YYYY-MM-DD) */
  due: string
}

function key(year: number, month: number, day: number): string {
  // month is 1-based; normalize overflow/underflow across years
  const y = year + Math.floor((month - 1) / 12)
  const m = ((month - 1) % 12 + 12) % 12 + 1
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function cycleForCutMonth(year: number, month: number): StatementCycle {
  return {
    start: key(year, month - 1, BBVA_CUT_DAY + 1),
    cut: key(year, month, BBVA_CUT_DAY),
    due: key(year, month, BBVA_DUE_DAY),
  }
}

/** The statement a purchase made on `dateKey` (YYYY-MM-DD) lands on. */
export function bbvaCycleFor(dateKey: string): StatementCycle {
  const [y, m, d] = dateKey.split('-').map(Number)
  return d <= BBVA_CUT_DAY ? cycleForCutMonth(y, m) : cycleForCutMonth(y, m + 1)
}

/** Move a cycle forward/backward by whole statements. */
export function shiftCycle(cycle: StatementCycle, statements: number): StatementCycle {
  const [y, m] = cycle.cut.split('-').map(Number)
  return cycleForCutMonth(y, m + statements)
}

/**
 * The statement to focus on today: the closed statement still awaiting its
 * due date (10th–29th), otherwise the currently open cycle.
 */
export function bbvaCycleToPay(todayKey: string): StatementCycle {
  const open = bbvaCycleFor(todayKey)
  const previous = shiftCycle(open, -1)
  return todayKey <= previous.due ? previous : open
}

export interface CycleTransaction {
  type: 'expense' | 'income'
  amount_mxn: number
  transaction_date: string
  owner: string | null
  payment_method?: string | null
}

export interface CycleSummary {
  total: number
  count: number
  /** Net amount per owner (expenses minus refunds/credits). Unassigned lands under "Unassigned". */
  byOwner: { owner: string; amount: number }[]
}

/**
 * Net charges on a card for one statement: expenses add, income entries
 * paid to the card (refunds, cashback) subtract.
 */
export function summarizeCycle(
  transactions: CycleTransaction[],
  cycle: StatementCycle,
  method: PaymentMethod = 'bbva_infinite',
): CycleSummary {
  const inCycle = transactions.filter(t =>
    t.payment_method === method && t.transaction_date >= cycle.start && t.transaction_date <= cycle.cut)
  const totals = new Map<string, number>(OWNERS.map(o => [o, 0]))
  for (const t of inCycle) {
    const owner = OWNERS.find(o => ownersEqual(o, t.owner)) ?? 'Unassigned'
    const signed = t.type === 'expense' ? t.amount_mxn : -t.amount_mxn
    totals.set(owner, (totals.get(owner) ?? 0) + signed)
  }
  const byOwner = [...totals.entries()]
    .filter(([owner, amount]) => OWNERS.includes(owner) || amount !== 0)
    .map(([owner, amount]) => ({ owner, amount }))
  return {
    total: byOwner.reduce((sum, o) => sum + o.amount, 0),
    count: inCycle.length,
    byOwner,
  }
}
