type IncomeTransaction = {
  transaction_date?: string | null
  amount_mxn?: number | null
  amount?: number | null
}

export type IncomeBaseline = {
  configuredMonthly: number
  observedMonthly: number
  currentMonthActual: number
  effectiveMonthly: number
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

// Prefer the configured recurring-income model when it is complete. When it
// is not, use the median of observed positive-income months; median keeps a
// bonus or one-off windfall from silently becoming the household baseline.
export function deriveIncomeBaseline(
  configuredMonthly: number,
  transactions: IncomeTransaction[],
  currentMonth: string,
): IncomeBaseline {
  const byMonth = new Map<string, number>()
  for (const transaction of transactions) {
    const month = transaction.transaction_date?.slice(0, 7)
    if (!month) continue
    const amount = transaction.amount_mxn || transaction.amount || 0
    byMonth.set(month, (byMonth.get(month) || 0) + amount)
  }

  const completedMonths = [...byMonth.entries()]
    .filter(([month, total]) => month !== currentMonth && total > 0)
    .map(([, total]) => total)
  const currentMonthActual = byMonth.get(currentMonth) || 0
  const observedMonthly = Math.round(
    completedMonths.length > 0 ? median(completedMonths) : currentMonthActual,
  )

  return {
    configuredMonthly: Math.round(configuredMonthly),
    observedMonthly,
    currentMonthActual: Math.round(currentMonthActual),
    effectiveMonthly: Math.round(Math.max(configuredMonthly, observedMonthly)),
  }
}

type RecurringIncomeRow = {
  name?: string | null
  amount?: number | null
  recurrence?: string | null
}

/**
 * Income to expect for the current month: what has already posted, plus
 * recurring income still due to land.
 *
 * A `max(actual, monthlyBaseline)` floor never releases — the baseline
 * amortizes annual bonuses across every month and sums both income tables, so
 * after payroll posts in full it keeps expecting income that can no longer
 * arrive, and month-end savings project HIGHER than money already banked.
 * The processor posts one transaction per recurring-income row per month
 * (guarded by row name), so an unposted monthly row is exactly what's still
 * coming — the income-side mirror of unpaid treatment milestones.
 *
 * With no recurring-income model to consult, falls back to the baseline floor
 * rather than projecting a month with zero income.
 */
export function expectedMonthIncome({
  actualIncome,
  recurringIncome,
  postedMerchants,
  monthlyBaseline,
}: {
  actualIncome: number
  recurringIncome: RecurringIncomeRow[]
  postedMerchants: Iterable<string | null | undefined>
  monthlyBaseline: number
}) {
  const posted = new Set(
    [...postedMerchants].map(m => (m || '').trim().toLowerCase()).filter(Boolean),
  )
  const stillScheduled = recurringIncome
    .filter(row => (row.recurrence || 'monthly') === 'monthly')
    .filter(row => !posted.has(String(row.name || '').trim().toLowerCase()))
    .reduce((sum, row) => sum + (row.amount || 0), 0)

  const expected = recurringIncome.length > 0
    ? actualIncome + stillScheduled
    : Math.max(actualIncome, monthlyBaseline)

  return {
    expected: Math.round(expected),
    received: Math.round(actualIncome),
    stillScheduled: Math.max(0, Math.round(expected) - Math.round(actualIncome)),
  }
}

export function emergencyFundCoverage({
  current,
  target,
  targetMonths,
  monthlyEssentials,
}: {
  current: number
  target: number
  targetMonths?: number | null
  monthlyEssentials?: number | null
}) {
  const monthsTarget = targetMonths && targetMonths > 0 ? targetMonths : 6
  const essentialBaseline = monthlyEssentials && monthlyEssentials > 0
    ? monthlyEssentials
    : target > 0 ? target / monthsTarget : 0

  return {
    monthlyEssentials: Math.round(essentialBaseline),
    monthsCovered: essentialBaseline > 0
      ? Math.round((current / essentialBaseline) * 10) / 10
      : 0,
    fundedPct: target > 0 ? Math.round((current / target) * 100) : 0,
    gap: Math.max(0, Math.round(target - current)),
  }
}

export function commitmentCoverage(projectedSavings: number, monthlyGoalNeed: number) {
  if (monthlyGoalNeed <= 0) return { pct: 100, gap: 0, surplus: Math.max(0, projectedSavings) }
  return {
    pct: Math.max(0, Math.round((projectedSavings / monthlyGoalNeed) * 100)),
    gap: Math.max(0, Math.round(monthlyGoalNeed - projectedSavings)),
    surplus: Math.max(0, Math.round(projectedSavings - monthlyGoalNeed)),
  }
}
