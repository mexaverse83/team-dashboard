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
