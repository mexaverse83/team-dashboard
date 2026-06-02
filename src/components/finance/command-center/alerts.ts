import type { FinanceTransaction } from '@/lib/finance-types'
import { type Alert, type Forecast, type Summary, fmtMoney } from './types'

// Build the top alerts from summary + forecast + recent transactions, ranked by weight.
export function buildAlerts(summary: Summary | null, forecast: Forecast | null, recentTx: FinanceTransaction[]): Alert[] {
  if (!summary) return []
  const alerts: Alert[] = []

  // 1. Budget categories projected to overshoot
  for (const cat of summary.current_month.budget_vs_actual) {
    if (cat.is_non_monthly) continue
    if (cat.budget <= 0) continue
    if (cat.projected_month_total > cat.budget * 1.1) {
      const overshoot = cat.projected_month_total - cat.budget
      alerts.push({
        id: `budget-${cat.category}`,
        severity: cat.status === 'over' ? 'danger' : 'warning',
        title: `${cat.icon} ${cat.category} — projected ${fmtMoney(overshoot, { compact: true })} over budget`,
        description: `On pace for ${fmtMoney(cat.projected_month_total)} vs ${fmtMoney(cat.budget)} budget · ${cat.pct_used}% used · day ${summary.current_month.day_of_month}/${summary.current_month.days_in_month}`,
        action: { label: 'Adjust budget', href: '/finance/budgets' },
        weight: cat.status === 'over' ? 90 : 70,
      })
    }
  }

  // 2. Goal funding gap
  if (summary.goal_funding.gap > 0) {
    alerts.push({
      id: 'goal-gap',
      severity: 'warning',
      title: `Goal funding gap of ${fmtMoney(summary.goal_funding.gap, { compact: true })}/mo`,
      description: `Discretionary cash flow falls short of goal monthly contributions. Trim a budget or increase income to close it.`,
      action: { label: 'Review goals', href: '/finance/goals' },
      weight: 60,
    })
  }

  // 2b. December target stress plan
  if (summary.year_end_goal_plan?.shortfall_by_december > 0) {
    alerts.push({
      id: 'december-target-gap',
      severity: 'danger',
      title: `December target gap: ${fmtMoney(summary.year_end_goal_plan.shortfall_by_december, { compact: true })}`,
      description: `To still reach ${fmtMoney(summary.year_end_goal_plan.target_amount, { compact: true })} by December after treatment, you need ${fmtMoney(summary.year_end_goal_plan.monthly_extra_needed, { compact: true })}/mo more capacity.`,
      action: { label: 'See plan', href: '#plans' },
      weight: 99,
    })
  }

  if (summary.fertility_plan?.monthly_gap_to_keep_goals > 0) {
    alerts.push({
      id: 'fertility-plan-gap',
      severity: 'danger',
      title: `Treatment shortfall: ${fmtMoney(summary.fertility_plan.monthly_gap_to_keep_goals, { compact: true })} for the next payment month`,
      description: `Free cash minus treatment payment minus goal funding. Use the plan card to decide what to cut, delay, or cover from savings.`,
      action: { label: 'Review plan', href: '#plans' },
      weight: 98,
    })
  } else if (summary.fertility_plan?.current_month_commitment > 0) {
    alerts.push({
      id: 'fertility-plan-covered',
      severity: 'info',
      title: `Fertility treatment planned: ${fmtMoney(summary.fertility_plan.current_month_commitment, { compact: true })} next`,
      description: `This commitment is included in the forecast and goal funding check.`,
      action: { label: 'Review plan', href: '#plans' },
      weight: 45,
    })
  }

  // 3. Cash flow forecast — projected to go negative or low
  if (forecast && forecast.summary.min_balance.balance < -20000) {
    alerts.push({
      id: 'cashflow-low',
      severity: 'danger',
      title: `Cash flow tight on ${forecast.summary.min_balance.date}`,
      description: `Net flows over next ${forecast.period.days}d project a low point of ${fmtMoney(forecast.summary.min_balance.balance, { compact: true })}. Consider deferring non-critical spend.`,
      action: { label: 'See forecast', href: '#forecast' },
      weight: 95,
    })
  } else if (forecast && forecast.summary.net_delta > 0) {
    alerts.push({
      id: 'cashflow-positive',
      severity: 'success',
      title: `Forecast: +${fmtMoney(forecast.summary.net_delta, { compact: true })} net over ${forecast.period.days}d`,
      description: `Inflow ${fmtMoney(forecast.summary.total_inflow, { compact: true })} vs outflow ${fmtMoney(forecast.summary.total_outflow, { compact: true })}. Spare capacity for goal acceleration.`,
      action: { label: 'Top up a goal', href: '/finance/goals' },
      weight: 30,
    })
  }

  // 4. Crypto risk flags
  if (summary.crypto?.risks?.concentration) {
    const c = summary.crypto.risks.concentration
    alerts.push({
      id: 'crypto-concentration',
      severity: 'warning',
      title: `Crypto concentration: ${c.pct}% in ${c.symbol}`,
      description: `Single-asset risk. Consider diversifying or trimming on rallies.`,
      action: { label: 'View portfolio', href: '/finance/investments?tab=Crypto' },
      weight: 50,
    })
  }
  if (summary.crypto?.risks?.large_loss) {
    alerts.push({
      id: 'crypto-loss',
      severity: 'danger',
      title: `Crypto P&L: ${summary.crypto.risks.large_loss.pnl_pct}%`,
      description: `Holdings down materially vs cost basis. Tax-loss harvest opportunity if planning a rebalance.`,
      action: { label: 'View positions', href: '/finance/investments?tab=Crypto' },
      weight: 65,
    })
  }

  // 5. Emergency fund coverage
  if (summary.emergency_fund.target > 0 && summary.emergency_fund.months_covered < 3) {
    alerts.push({
      id: 'ef-low',
      severity: 'warning',
      title: `Emergency fund: ${summary.emergency_fund.months_covered.toFixed(1)} months covered`,
      description: `Recommended minimum is 3 months of expenses. Currently ${fmtMoney(summary.emergency_fund.current, { compact: true })} of ${fmtMoney(summary.emergency_fund.target, { compact: true })} target.`,
      action: { label: 'Top up', href: '/finance/emergency-fund' },
      weight: 75,
    })
  }

  // 6. Anomaly detection — recent transactions >2σ above merchant baseline
  if (recentTx.length > 0) {
    const last7 = recentTx.filter(t => {
      const d = new Date(t.transaction_date)
      const week = new Date()
      week.setDate(week.getDate() - 7)
      return d >= week
    })
    const merchantHistory: Record<string, number[]> = {}
    for (const t of recentTx) {
      if (!t.merchant) continue
      if (!merchantHistory[t.merchant]) merchantHistory[t.merchant] = []
      merchantHistory[t.merchant].push(t.amount_mxn)
    }
    for (const t of last7) {
      if (!t.merchant) continue
      const hist = merchantHistory[t.merchant] || []
      if (hist.length < 4) continue
      const mean = hist.reduce((s, x) => s + x, 0) / hist.length
      const variance = hist.reduce((s, x) => s + (x - mean) ** 2, 0) / hist.length
      const std = Math.sqrt(variance)
      if (std > 0 && t.amount_mxn > mean + 2 * std && t.amount_mxn > mean * 1.5) {
        alerts.push({
          id: `anomaly-${t.id}`,
          severity: 'warning',
          title: `Unusual ${t.merchant} charge: ${fmtMoney(t.amount_mxn, { compact: true })}`,
          description: `Average ${fmtMoney(mean, { compact: true })} across ${hist.length} prior charges. ${t.transaction_date}.`,
          action: { label: 'Review', href: '/finance/transactions' },
          weight: 55,
        })
        break // one anomaly call-out at most
      }
    }
  }

  // 7. Upcoming large bill in next 7 days
  if (forecast) {
    const next7 = forecast.events
      .filter(e => {
        const d = new Date(e.date)
        const week = new Date()
        week.setDate(week.getDate() + 7)
        return d <= week && e.amount_mxn < 0
      })
      .sort((a, b) => a.amount_mxn - b.amount_mxn)
    const biggest = next7[0]
    if (biggest && Math.abs(biggest.amount_mxn) > 5000) {
      alerts.push({
        id: `bill-${biggest.name}`,
        severity: 'info',
        title: `${biggest.name} due ${biggest.date} — ${fmtMoney(Math.abs(biggest.amount_mxn), { compact: true })}`,
        description: `Largest scheduled charge in the next 7 days.`,
        weight: 25,
      })
    }
  }

  return alerts.sort((a, b) => b.weight - a.weight).slice(0, 5)
}
