import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const FREQ_DIVISOR: Record<string, number> = { weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12 }

export async function GET(req: NextRequest) {
  // Auth: API key for external calls, allow same-origin browser requests
  const key = req.headers.get('x-api-key')
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes(req.nextUrl.host)
  if (!isSameOrigin && (!key || key !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const months = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('months') || '3'), 1), 12)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
  const startStr = start.toISOString().slice(0, 10)
  const endStr = now.toISOString().slice(0, 10)

  const [
    { data: transactions },
    { data: categories },
    { data: budgets },
    { data: recurring },
    { data: installments },
    { data: debts },
    { data: emergencyFund },
    { data: goals },
    { data: incomeSources },
  ] = await Promise.all([
    supabase.from('finance_transactions').select('*').gte('transaction_date', startStr).lte('transaction_date', endStr).eq('type', 'expense'),
    supabase.from('finance_categories').select('*'),
    supabase.from('finance_budgets').select('*'),
    supabase.from('finance_recurring').select('*').eq('is_active', true),
    supabase.from('finance_installments').select('*').eq('is_active', true),
    supabase.from('finance_debts').select('*').eq('is_active', true),
    supabase.from('finance_emergency_fund').select('*').order('created_at', { ascending: false }).limit(1),
    supabase.from('finance_goals').select('*').eq('is_completed', false),
    supabase.from('finance_income_sources').select('*').eq('is_active', true),
  ])

  const catMap = new Map((categories || []).map(c => [c.id, c]))

  // Income
  const incSources = (incomeSources || []).map(s => ({
    name: s.name,
    type: s.type,
    monthly_amount: Math.round(s.amount / (FREQ_DIVISOR[s.frequency] || 1)),
  }))
  const totalMonthlyIncome = incSources.reduce((s, i) => s + i.monthly_amount, 0)

  // Spending by category
  const txs = transactions || []
  const catSpend: Record<string, number> = {}
  txs.forEach(t => {
    const key = t.category_id || 'uncategorized'
    catSpend[key] = (catSpend[key] || 0) + (t.amount_mxn || t.amount || 0)
  })
  const totalSpend = txs.reduce((s, t) => s + (t.amount_mxn || t.amount || 0), 0)
  const monthlyAvgSpend = Math.round(totalSpend / months)

  const spendByCategory = Object.entries(catSpend).map(([catId, total]) => {
    const cat = catMap.get(catId)
    const bgt = (budgets || []).find(b => b.category_id === catId)
    return {
      category: cat?.name || 'Uncategorized',
      icon: cat?.icon || '📦',
      total: Math.round(total),
      monthly_avg: Math.round(total / months),
      budget: bgt?.amount || 0,
      pct_of_income: totalMonthlyIncome > 0 ? Math.round((total / months) / totalMonthlyIncome * 100) : 0,
    }
  }).sort((a, b) => b.total - a.total)

  // Spending by month
  const byMonth: Record<string, number> = {}
  txs.forEach(t => {
    const m = (t.transaction_date || '').slice(0, 7)
    if (m) byMonth[m] = (byMonth[m] || 0) + (t.amount_mxn || t.amount || 0)
  })
  const spendByMonth = Object.entries(byMonth).sort().map(([month, total]) => ({ month, total: Math.round(total) }))

  // Budgets
  const budgetCategories = (budgets || []).map(b => {
    const cat = catMap.get(b.category_id)
    const spent = catSpend[b.category_id] || 0
    return {
      category: cat?.name || 'Unknown',
      budget: b.amount,
      spent: Math.round(spent / months),
      pct_used: b.amount > 0 ? Math.round((spent / months) / b.amount * 100) : 0,
      budget_type: b.budget_type || 'needs',
    }
  })

  // Subscriptions
  const subs = (recurring || []).map(r => ({
    name: r.name,
    amount: r.amount,
    frequency: r.frequency,
    monthly_equivalent: Math.round(r.amount / (FREQ_DIVISOR[r.frequency] || 1)),
    last_charge: r.next_due_date,
  }))
  const subsMonthly = subs.reduce((s, r) => s + r.monthly_equivalent, 0)

  // Installments
  const inst = (installments || []).map(i => ({
    name: i.name,
    merchant: i.merchant,
    monthly_payment: i.installment_amount,
    payments_remaining: i.installment_count - (i.payments_made || 0),
    total_remaining: (i.installment_count - (i.payments_made || 0)) * i.installment_amount,
    end_date: i.end_date,
  }))
  const instMonthly = inst.reduce((s, i) => s + i.monthly_payment, 0)

  // Debts
  const debtItems = (debts || []).map(d => ({
    name: d.name,
    balance: d.balance,
    rate: d.interest_rate,
    minimum: d.minimum_payment,
  }))

  // Emergency fund
  const ef = (emergencyFund || [])[0]
  const monthlyExpenses = monthlyAvgSpend
  const monthsCovered = ef && monthlyExpenses > 0 ? Math.round((ef.current_amount / monthlyExpenses) * 10) / 10 : 0

  // Goals
  const activeGoals = (goals || []).map(g => {
    const remaining = (g.target_amount || 0) - (g.current_amount || 0)
    const monthlyNeeded = g.target_date ? Math.round(remaining / Math.max(1, Math.ceil((new Date(g.target_date).getTime() - now.getTime()) / (30 * 86400000)))) : 0
    return {
      name: g.name,
      target: g.target_amount,
      current: g.current_amount,
      pct: g.target_amount > 0 ? Math.round(g.current_amount / g.target_amount * 100) : 0,
      monthly_needed: monthlyNeeded,
      on_track: g.monthly_contribution >= monthlyNeeded,
    }
  })

  // Cash flow — subscriptions are already inside budget categories, don't double-count
  const totalBudgeted = budgetCategories.reduce((s, b) => s + b.budget, 0)
  const fixedCommitments = totalBudgeted + instMonthly + debtItems.reduce((s, d) => s + d.minimum, 0)

  // Current month budget vs actual with pace
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthProgress = dayOfMonth / daysInMonth

  // Billing cycle multipliers: how many months one payment covers
  const CYCLE_MONTHS: Record<string, number> = {
    monthly: 1, bimonthly: 2, quarterly: 3, 'semi-annual': 6, annual: 12,
  }

  // Allocate transaction amount to current month, respecting coverage dates
  function allocateToMonth(t: Record<string, unknown>, targetMonth: string): number {
    const amt = (t.amount_mxn as number) || (t.amount as number) || 0
    const coverStart = t.coverage_start as string | null
    const coverEnd = t.coverage_end as string | null

    if (!coverStart || !coverEnd) {
      // No coverage dates — only count if transaction is in target month
      return ((t.transaction_date as string) || '').startsWith(targetMonth) ? amt : 0
    }

    // Split evenly across covered months
    const [sy, sm] = coverStart.split('-').map(Number)
    const [ey, em] = coverEnd.split('-').map(Number)
    const [ty, tm] = targetMonth.split('-').map(Number)
    const coveredMonths = Math.max(1, (ey - sy) * 12 + (em - sm) + 1)
    const targetVal = ty * 12 + tm
    const startVal = sy * 12 + sm
    const endVal = ey * 12 + em

    if (targetVal >= startVal && targetVal <= endVal) {
      return amt / coveredMonths
    }
    return 0
  }

  // Current month spending by category using allocation logic
  const currentMonthCatSpend: Record<string, number> = {}
  txs.forEach(t => {
    const allocated = allocateToMonth(t, currentMonthStr)
    if (allocated > 0) {
      const k = (t.category_id as string) || 'uncategorized'
      currentMonthCatSpend[k] = (currentMonthCatSpend[k] || 0) + allocated
    }
  })

  const budgetVsActual = (budgets || []).map(b => {
    const cat = catMap.get(b.category_id)
    const billingCycle = cat?.billing_cycle || 'monthly'
    const cycleMonths = CYCLE_MONTHS[billingCycle] || 1
    const isNonMonthly = cycleMonths > 1

    const spent = currentMonthCatSpend[b.category_id] || 0
    const budget = b.amount || 0
    const pctUsed = budget > 0 ? Math.round(spent / budget * 100) : 0

    // Pace calculation: skip for non-monthly categories (bimonthly bills aren't linear spending)
    let dailyPace = 0
    let budgetDailyPace = 0
    let paceVsBudget = 0
    let projectedTotal = 0

    if (isNonMonthly) {
      // For non-monthly: just compare allocated monthly amount vs monthly budget
      dailyPace = 0
      budgetDailyPace = 0
      paceVsBudget = 0
      projectedTotal = Math.round(spent) // Already amortized, don't project linearly
    } else {
      dailyPace = dayOfMonth > 0 ? spent / dayOfMonth : 0
      budgetDailyPace = daysInMonth > 0 ? budget / daysInMonth : 0
      paceVsBudget = budgetDailyPace > 0 ? Math.round((dailyPace / budgetDailyPace - 1) * 100) : 0
      projectedTotal = Math.round(dailyPace * daysInMonth)
    }

    return {
      category: cat?.name || 'Unknown',
      icon: cat?.icon || '📦',
      billing_cycle: billingCycle,
      spent: Math.round(spent),
      budget,
      pct_used: pctUsed,
      over_under: Math.round(spent - budget),
      status: pctUsed < 80 ? 'ok' : pctUsed <= 100 ? 'warning' : 'over',
      daily_pace: Math.round(dailyPace),
      budget_daily_pace: Math.round(budgetDailyPace),
      pace_vs_budget_pct: paceVsBudget,
      projected_month_total: projectedTotal,
      is_non_monthly: isNonMonthly,
    }
  }).sort((a, b) => b.pct_used - a.pct_used)

  // Total current month spend using allocation
  let totalCurrentMonthSpend = 0
  txs.forEach(t => { totalCurrentMonthSpend += allocateToMonth(t, currentMonthStr) })
  totalCurrentMonthSpend = Math.round(totalCurrentMonthSpend)

  // Goal funding gap
  const totalGoalMonthlyNeeded = activeGoals.reduce((s, g) => s + g.monthly_needed, 0)
  const discretionary = totalMonthlyIncome - fixedCommitments
  const goalFundingGap = totalGoalMonthlyNeeded - discretionary

  // MSI payoff timeline
  const msiTimeline = inst.map(i => ({
    name: i.name,
    merchant: i.merchant,
    monthly_payment: i.monthly_payment,
    payments_remaining: i.payments_remaining,
    end_date: i.end_date,
    total_remaining: i.total_remaining,
  })).sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))

  return NextResponse.json({
    period: { start: startStr, end: endStr },
    income: { sources: incSources, total_monthly: totalMonthlyIncome },
    spending: { by_category: spendByCategory, total_monthly_avg: monthlyAvgSpend, by_month: spendByMonth },
    budgets: {
      total_budgeted: budgetCategories.reduce((s, b) => s + b.budget, 0),
      total_spent: monthlyAvgSpend,
      categories: budgetCategories,
    },
    subscriptions: { active: subs, total_monthly: subsMonthly, total_annual: subsMonthly * 12 },
    installments: { active: inst, total_monthly_commitment: instMonthly },
    debts: { items: debtItems, total_balance: debtItems.reduce((s, d) => s + d.balance, 0), total_minimums: debtItems.reduce((s, d) => s + d.minimum, 0) },
    emergency_fund: {
      target: ef?.target_amount || 0,
      current: ef?.current_amount || 0,
      months_covered: monthsCovered,
      risk_score: ef?.risk_score || 0,
    },
    goals: { active: activeGoals },
    cash_flow: {
      monthly_income: totalMonthlyIncome,
      fixed_commitments: fixedCommitments,
      discretionary_available: discretionary,
    },
    current_month: {
      month: currentMonthStr,
      day_of_month: dayOfMonth,
      days_in_month: daysInMonth,
      month_progress_pct: Math.round(monthProgress * 100),
      total_spent: Math.round(totalCurrentMonthSpend),
      budget_vs_actual: budgetVsActual,
    },
    goal_funding: {
      total_monthly_needed: totalGoalMonthlyNeeded,
      discretionary_available: discretionary,
      gap: goalFundingGap > 0 ? goalFundingGap : 0,
      fully_funded: goalFundingGap <= 0,
    },
    msi_timeline: msiTimeline,
  })
}
// 1771253121
