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
