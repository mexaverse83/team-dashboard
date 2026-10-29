/** Advance date-only values without overflowing February or depending on TZ.
 * An original anchor day retains Jan 31 → Feb 28 → Mar 31 during catch-up.
 */
export function advanceRecurringDate(date: string, frequency: string, anchorDay = Number(date.slice(8, 10))): string {
  const current = new Date(`${date}T12:00:00Z`)
  if (!Number.isFinite(current.getTime()) || current.toISOString().slice(0, 10) !== date) {
    throw new Error('Invalid recurring date')
  }
  const months: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12, annual: 12, 'semi-annual': 6 }
  if (frequency === 'weekly' || frequency === 'biweekly') {
    current.setUTCDate(current.getUTCDate() + (frequency === 'weekly' ? 7 : 14))
  } else if (months[frequency]) {
    const targetMonth = current.getUTCMonth() + months[frequency]
    const year = current.getUTCFullYear()
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate()
    current.setUTCDate(1)
    current.setUTCMonth(targetMonth)
    current.setUTCDate(Math.min(anchorDay, lastDay))
  } else {
    throw new Error(`Unsupported recurrence: ${frequency}`)
  }
  return current.toISOString().slice(0, 10)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM' + day → 'YYYY-MM-DD', clamped to the month's last day. */
export function dueDateInMonth(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${month}-${pad2(Math.min(Math.max(1, Math.trunc(day) || 1), last))}`
}

function monthIndex(month: string) {
  const [y, m] = month.split('-').map(Number)
  return y * 12 + (m - 1)
}

function monthFromIndex(i: number) {
  return `${Math.floor(i / 12)}-${pad2((i % 12) + 1)}`
}

export interface MsiPeriod { number: number; month: string; date: string }

/**
 * The MSI payments still to post as of `today` (AUTO-13): one per month from
 * the start month through the current month, capped at installment_count.
 * Missed months are dated at their due day (start_date's day, clamped). The
 * current month's row is dated at the due day once it has passed, else today,
 * so a mid-month due day never delays this month's posting.
 */
export function msiPendingPeriods(
  msi: { start_date: string; installment_count: number; payments_made?: number | null },
  today: string,
  maxCatchUp = 12,
): MsiPeriod[] {
  const startMonth = msi.start_date.slice(0, 7)
  const currentMonth = today.slice(0, 7)
  const dueDay = Number(msi.start_date.slice(8, 10)) || 1
  const elapsed = monthIndex(currentMonth) - monthIndex(startMonth) + 1
  const expected = Math.min(Math.max(0, elapsed), Math.max(0, Number(msi.installment_count) || 0))
  const made = Math.max(0, Number(msi.payments_made) || 0)
  const out: MsiPeriod[] = []
  for (let n = made + 1; n <= expected && out.length < maxCatchUp; n++) {
    const month = monthFromIndex(monthIndex(startMonth) + n - 1)
    const due = dueDateInMonth(month, dueDay)
    const date = month < currentMonth ? due : due <= today ? due : today
    out.push({ number: n, month, date })
  }
  return out
}

/**
 * Income-source cadence with an explicit pay month (F08). Yearly posts only in
 * pay_month; quarterly in pay_month and every third month after. Without a
 * pay_month the historical January anchor is kept.
 */
export function shouldPostIncomeSource(frequency: string, month1to12: number, payMonth?: number | null): boolean {
  const anchor = payMonth && payMonth >= 1 && payMonth <= 12 ? payMonth : 1
  switch (frequency) {
    case 'quarterly': return (((month1to12 - anchor) % 3) + 3) % 3 === 0
    case 'yearly':
    case 'annual': return month1to12 === anchor
    default: return true
  }
}

export interface RecurringIncomeRow {
  id: string
  name: string
  recurrence?: string | null
  start_date?: string | null
  end_date?: string | null
  active?: boolean | null
}

/**
 * One row per income name (AUTO-11, F17): a raise is modeled as a new row with
 * a later start_date, so the latest start_date on or before `today` wins and
 * rows that ended before this month drop out. Ties keep the first row returned.
 */
export function pickCurrentRecurringIncome<T extends RecurringIncomeRow>(rows: readonly T[], today: string): T[] {
  const monthStart = `${today.slice(0, 7)}-01`
  const byName = new Map<string, T>()
  for (const row of rows) {
    if (row.active === false) continue
    if (row.start_date && row.start_date.slice(0, 10) > today) continue
    if (row.end_date && row.end_date.slice(0, 10) < monthStart) continue
    const key = row.name.trim().toLowerCase()
    const current = byName.get(key)
    if (!current || (row.start_date || '') > (current.start_date || '')) byName.set(key, row)
  }
  return [...byName.values()]
}
