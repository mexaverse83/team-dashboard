// Summary engine, callable in-process (no HTTP self-fetch). This file only
// fetches and composes; every number comes from a pure builder in
// src/lib/summary/* so it can be tested on fixture rows.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { FERTILITY_TREATMENT_PLAN } from '@/lib/fertility-plan'
import { BABY_PLAN, BABY_PLAN_TAG, looksLikeBabySpend } from '@/lib/baby-plan'
import { deriveIncomeBaseline, expectedMonthIncome } from '@/lib/household-metrics'
import { fetchCryptoPrices } from '@/lib/crypto-prices'
import { addMonthsKey, daysInMonth as daysInMonthOf, mexicoCityDateParts, mxNow } from '@/lib/dates'
import { CYCLE_MONTHS } from '@/lib/finance-utils'
import { householdRunRate, isWestPayment, txAmount, type TxRow } from '@/lib/summary/history'
import { activeBudgetRows, budgetTypeFor, buildBudgetVsActual, type BudgetRow, type CategoryRow } from '@/lib/summary/budgets'
import { buildGoals, type GoalRow } from '@/lib/summary/goals'
import { buildEmergencyFund, deriveMonthlyEssentials, type EmergencyFundRow } from '@/lib/summary/emergency'
import { buildBabyPlan, buildFertilityPlan, treatmentDueThisMonth, type BabyLedger } from '@/lib/summary/plans'
import { buildYearEndPlan, projectMonthSpend, unbudgetedRoutine } from '@/lib/summary/projection'
import { CONTROLLABLE } from '@/lib/controllable-categories'
import { buildOwnerSpend, buildRecentTransactions, buildVariable } from '@/lib/summary/activity'
import { buildUpcoming } from '@/lib/summary/upcoming'
import { buildCryptoSummary, cryptoQuantities, type CryptoHoldingRow } from '@/lib/summary/crypto'
import { getWestProjection, type WestProjection } from '@/lib/server/west'

import type { SummaryResponse, SummaryWestPlan } from '@/lib/summary/types'

const FREQ_DIVISOR: Record<string, number> = { weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12 }
const RI_DIVISOR: Record<string, number> = { monthly: 1, bimonthly: 2, annual: 12 }
const TX_COLUMNS = 'id,transaction_date,type,amount_mxn,amount,category_id,merchant,tags,owner,coverage_start,coverage_end,created_at'

export interface BuildSummaryOptions {
  /** Lookback for the spending averages, clamped to 1–12 (default 3). */
  months?: number
  /** Clock override for tests; dates are anchored to the Mexico City calendar. */
  now?: Date
  /** Skip the WEST engine (callers that already have it, or tests). */
  west?: WestProjection | null | false
}

/** Thrown when any underlying Supabase read fails; routes answer 503. */
export class SummaryUnavailableError extends Error {
  constructor(message = 'Financial data is temporarily unavailable') {
    super(message)
    this.name = 'SummaryUnavailableError'
  }
}

type Res<T> = { data: T[] | null; error: unknown }
const rowsOf = <T>(res: Res<T>): T[] => {
  if (res.error) throw new SummaryUnavailableError()
  return res.data || []
}

export async function buildSummary(
  supabase: SupabaseClient,
  { months: requestedMonths = 3, now = new Date(), west: westOverride }: BuildSummaryOptions = {},
): Promise<SummaryResponse> {
  const months = Number.isFinite(requestedMonths) ? Math.min(Math.max(Math.trunc(requestedMonths), 1), 12) : 3
  // Every date sits on the household's Mexico City calendar: Vercel runs in
  // UTC, which is already tomorrow after ~6pm local.
  const mx = mexicoCityDateParts(now)
  const asOf = mxNow(now)
  const month = `${mx.year}-${String(mx.month).padStart(2, '0')}`
  const today = `${month}-${String(mx.day).padStart(2, '0')}`
  const monthStart = `${month}-01`
  const startStr = `${addMonthsKey(month, -(months - 1))}-01`
  // Income needs six months to tell salary cadence from a bonus month; the
  // per-category spend history needs six complete months for its medians.
  const incomeHistoryStart = `${addMonthsKey(month, -5)}-01`
  const spendHistoryStart = `${addMonthsKey(month, -6)}-01`
  const readStart = startStr < spendHistoryStart ? startStr : spendHistoryStart

  const holdingsP = Promise.resolve(supabase.from('finance_crypto_holdings').select('*')) as Promise<Res<CryptoHoldingRow>>
  // Prices start as soon as holdings resolve, alongside the main batch.
  const pricesP = holdingsP
    .then(res => {
      const symbols = (res.data || []).filter(h => Number(h.quantity) > 0).map(h => h.symbol)
      return symbols.length > 0 ? fetchCryptoPrices(symbols) : null
    })
    .catch(() => null)
  const westP: Promise<WestProjection | null> = westOverride !== undefined
    ? Promise.resolve(westOverride || null)
    : getWestProjection(supabase, { now }).catch(() => null)

  let batch
  try {
    batch = await Promise.all([
      // One narrow read covers the spending period, the income lookback, the
      // category history and this month — split in memory below.
      fetchAllRows<TxRow>((from, to) => supabase.from('finance_transactions').select(TX_COLUMNS)
        .gte('transaction_date', readStart).lte('transaction_date', today)
        .order('transaction_date', { ascending: false }).order('id').range(from, to), 1000, 20000, true),
      supabase.from('finance_categories').select('*'),
      supabase.from('finance_budgets').select('*'),
      supabase.from('finance_recurring').select('*').eq('is_active', true),
      supabase.from('finance_installments').select('*').eq('is_active', true),
      supabase.from('finance_debts').select('*').eq('is_active', true),
      supabase.from('finance_emergency_fund').select('*').order('created_at', { ascending: false }).limit(1),
      supabase.from('finance_goals').select('*').eq('is_completed', false),
      supabase.from('finance_income_sources').select('*').eq('is_active', true),
      supabase.from('finance_recurring_income').select('*').eq('active', true),
      // Plan ledgers, bounded to each plan's lifetime.
      fetchAllRows<TxRow>((from, to) => supabase.from('finance_transactions').select('id,transaction_date,amount_mxn,amount')
        .contains('tags', ['fertility']).eq('type', 'expense')
        .gte('transaction_date', `${addMonthsKey(FERTILITY_TREATMENT_PLAN.startMonth, -6)}-01`)
        .order('transaction_date').order('id').range(from, to), 1000, 20000, true),
      fetchAllRows<TxRow>((from, to) => supabase.from('finance_transactions').select('id,transaction_date,amount_mxn,amount')
        .contains('tags', [BABY_PLAN_TAG]).eq('type', 'expense')
        .gte('transaction_date', `${addMonthsKey(BABY_PLAN.startMonth, -3)}-01`)
        .order('transaction_date').order('id').range(from, to), 1000, 20000, true),
      holdingsP,
    ])
  } catch {
    throw new SummaryUnavailableError()
  }
  const [txRows, categoriesRes, budgetsRes, recurringRes, installmentsRes, debtsRes, efRes, goalsRes, incomeSourcesRes, recurringIncomeRes, fertilityRows, babyRows, holdingsRes] = batch
  const categories = rowsOf(categoriesRes as Res<CategoryRow>)
  const budgets = rowsOf(budgetsRes as Res<BudgetRow>)
  const recurring = rowsOf(recurringRes as Res<{ name: string; amount: number; frequency: string; next_due_date: string | null }>)
  const installments = rowsOf(installmentsRes as Res<{ name: string; merchant: string; installment_amount: number; installment_count: number; payments_made: number | null; start_date: string | null; end_date: string }>)
  const debts = rowsOf(debtsRes as Res<{ name: string; balance: number; interest_rate: number; minimum_payment: number }>)
  const efRows = rowsOf(efRes as Res<EmergencyFundRow>)
  const goals = rowsOf(goalsRes as Res<GoalRow>)
  const incomeSources = rowsOf(incomeSourcesRes as Res<{ name: string; type: string; amount: number; frequency: string }>)
  const recurringIncome = rowsOf(recurringIncomeRes as Res<{ name: string; amount: number; recurrence: string; owner: string; category?: string; start_date?: string | null; day_of_month?: number | null }>)
  const holdings = rowsOf(holdingsRes as Res<CryptoHoldingRow>)

  const catMap = new Map(categories.map(c => [c.id, c]))
  const activeBudgets = activeBudgetRows(budgets, month)
  const budgetByCategory = new Map(activeBudgets.map(b => [b.category_id, b]))
  const typeOfCategory = (id: string | null | undefined) => id ? budgetTypeFor(budgetByCategory.get(id), catMap.get(id)) : null
  // Savings-type categories (e.g. a future "WEST payments" budget) are money
  // moved, not spent: out of Spent and budgets, reported as moved_to_savings.
  const savingsCategoryIds = new Set(activeBudgets.filter(b => b.budget_type === 'savings').map(b => b.category_id))
  const isSavingsMove = (t: TxRow) => !!t.category_id && savingsCategoryIds.has(t.category_id)

  // Annual cycles need 12 months of their category but the category history
  // stops at month − 6: add those categories' older rows (from the main read
  // where it reaches, one bounded extra read for the rest).
  const longCycle = activeBudgets
    .map(b => ({ id: b.category_id, months: CYCLE_MONTHS[(catMap.get(b.category_id)?.billing_cycle || 'monthly') as keyof typeof CYCLE_MONTHS] || 1 }))
    .filter(c => `${addMonthsKey(month, -(c.months - 1))}-01` < spendHistoryStart)
  let cycleHistory: TxRow[] = []
  if (longCycle.length > 0) {
    const ids = new Set(longCycle.map(c => c.id))
    const cycleStart = `${addMonthsKey(month, -(Math.max(...longCycle.map(c => c.months)) - 1))}-01`
    cycleHistory = txRows.filter(t => t.type === 'expense' && t.transaction_date < spendHistoryStart && ids.has(t.category_id || ''))
    if (cycleStart < readStart) {
      try {
        cycleHistory = cycleHistory.concat(await fetchAllRows<TxRow>((from, to) => supabase.from('finance_transactions').select(TX_COLUMNS)
          .in('category_id', [...ids]).eq('type', 'expense')
          .gte('transaction_date', cycleStart).lt('transaction_date', readStart)
          .order('transaction_date').order('id').range(from, to), 1000, 20000, true))
      } catch {
        throw new SummaryUnavailableError()
      }
    }
  }

  const expenses = txRows.filter(t => t.type === 'expense')
  const incomeRows = txRows.filter(t => t.type === 'income')
  const periodExpenses = expenses.filter(t => t.transaction_date >= startStr)
  const historyExpenses = expenses.filter(t => t.transaction_date >= spendHistoryStart && t.transaction_date < monthStart)
  const monthExpensesAll = expenses.filter(t => t.transaction_date >= monthStart)
  const monthExpenses = monthExpensesAll.filter(t => !isSavingsMove(t))
  const movedToSavings = Math.round(monthExpensesAll.filter(isSavingsMove).reduce((s, t) => s + txAmount(t), 0))
  const monthIncomeRows = incomeRows.filter(t => t.transaction_date >= monthStart)

  // ── Income ────────────────────────────────────────────────────────────
  const incSources = incomeSources.map(s => ({ name: s.name, type: s.type, monthly_amount: Math.round(s.amount / (FREQ_DIVISOR[s.frequency] || 1)) }))
  const currentRI = recurringIncome.filter(r => !r.start_date || r.start_date <= today)
  const futureRI = recurringIncome.filter(r => r.start_date && r.start_date > today)
  const riShape = (r: typeof recurringIncome[number]) => ({
    name: r.name, type: r.category || 'recurring_income', owner: r.owner,
    monthly_amount: Math.round(r.amount / (RI_DIVISOR[r.recurrence] || 1)), start_date: r.start_date ?? null,
  })
  const riSources = currentRI.map(riShape)
  const futureRISources = futureRI.map(r => ({ ...riShape(r), start_date: r.start_date as string }))
  const configuredMonthlyIncome = incSources.reduce((s, i) => s + i.monthly_amount, 0) + riSources.reduce((s, i) => s + i.monthly_amount, 0)
  const incomeBaseline = deriveIncomeBaseline(configuredMonthlyIncome, incomeRows.filter(t => t.transaction_date >= incomeHistoryStart), month)
  const totalMonthlyIncome = incomeBaseline.effectiveMonthly

  // ── Spending over the requested period ────────────────────────────────
  const catSpend: Record<string, number> = {}
  for (const t of periodExpenses) catSpend[t.category_id || 'uncategorized'] = (catSpend[t.category_id || 'uncategorized'] || 0) + txAmount(t)
  const totalSpend = periodExpenses.reduce((s, t) => s + txAmount(t), 0)
  const monthlyAvgSpend = Math.round(totalSpend / months)
  const spendByCategory = Object.entries(catSpend).map(([catId, total]) => {
    const cat = catMap.get(catId)
    return {
      category: cat?.name || 'Uncategorized',
      icon: cat?.icon || '📦',
      total: Math.round(total),
      monthly_avg: Math.round(total / months),
      budget: budgetByCategory.get(catId)?.amount || 0,
      pct_of_income: totalMonthlyIncome > 0 ? Math.round((total / months) / totalMonthlyIncome * 100) : 0,
    }
  }).sort((a, b) => b.total - a.total)
  const byMonth: Record<string, number> = {}
  for (const t of periodExpenses) byMonth[t.transaction_date.slice(0, 7)] = (byMonth[t.transaction_date.slice(0, 7)] || 0) + txAmount(t)
  const spendByMonth = Object.entries(byMonth).sort().map(([m, total]) => ({ month: m, total: Math.round(total) }))

  const budgetCategories = activeBudgets.map(b => {
    const cat = catMap.get(b.category_id)
    const spent = catSpend[b.category_id] || 0
    return {
      category: cat?.name || 'Unknown',
      icon: cat?.icon || '📦',
      budget: b.amount,
      spent: Math.round(spent / months),
      pct_used: b.amount > 0 ? Math.round((spent / months) / b.amount * 100) : 0,
      budget_type: budgetTypeFor(b, cat),
    }
  })
  const wantsBudgets = budgetCategories.filter(b => b.budget_type === 'wants').map(b => ({ category: b.category, icon: b.icon, budget: b.budget }))

  // ── Commitments ───────────────────────────────────────────────────────
  const subs = recurring.map(r => ({
    name: r.name, amount: r.amount, frequency: r.frequency,
    monthly_equivalent: Math.round(r.amount / (FREQ_DIVISOR[r.frequency] || 1)),
    last_charge: r.next_due_date,
    next_charge: r.next_due_date,
  }))
  const subsMonthly = subs.reduce((s, r) => s + r.monthly_equivalent, 0)
  const inst = installments
    .map(i => {
      const paymentsRemaining = Math.max(0, i.installment_count - (i.payments_made || 0))
      return {
        name: i.name, merchant: i.merchant, monthly_payment: i.installment_amount,
        payments_remaining: paymentsRemaining, total_remaining: paymentsRemaining * i.installment_amount, end_date: i.end_date,
      }
    })
    // A plan can stay "active" after its final payment; that's history.
    .filter(i => i.payments_remaining > 0)
  const instMonthly = inst.reduce((s, i) => s + i.monthly_payment, 0)
  const debtItems = debts.map(d => ({ name: d.name, balance: d.balance, rate: d.interest_rate, minimum: d.minimum_payment }))

  // ── Current month ─────────────────────────────────────────────────────
  const dayOfMonth = mx.day
  const daysInMonth = daysInMonthOf(mx.year, mx.month)
  const budgetVsActual = buildBudgetVsActual({
    budgets: activeBudgets.filter(b => !savingsCategoryIds.has(b.category_id)),
    catMap, currentMonthTxs: monthExpenses, historyTxs: historyExpenses.filter(t => !isSavingsMove(t)),
    cycleHistoryTxs: cycleHistory, month, dayOfMonth, daysInMonth,
  })

  const fertilityPaid = fertilityRows.map(t => ({ date: t.transaction_date, amount: txAmount(t) }))
  const taggedBabyIds = new Set(babyRows.map(t => t.id))
  const babyCandidates = expenses.filter(t =>
    t.transaction_date >= `${addMonthsKey(BABY_PLAN.startMonth, -1)}-01`
    && !taggedBabyIds.has(t.id)
    && !(t.tags || []).includes(BABY_PLAN_TAG)
    && looksLikeBabySpend(t.merchant, t.category_id ? catMap.get(t.category_id)?.name : null))
  const babyLedger: BabyLedger = {
    taggedPaid: babyRows.map(t => ({ date: t.transaction_date, amount: txAmount(t) })),
    settlementPaid: [...babyRows, ...babyCandidates].map(t => ({ date: t.transaction_date, amount: txAmount(t) })),
    untaggedCandidates: babyCandidates.length,
  }
  const babyPlan = buildBabyPlan(babyLedger, { asOf, today })
  const treatmentDue = treatmentDueThisMonth(month, fertilityPaid)
  const babyDue = babyPlan.remaining_events.filter(e => e.month === month).reduce((s, e) => s + e.amount, 0)

  const spendProjection = projectMonthSpend({
    budgetVsActual,
    currentMonthTxs: monthExpenses,
    budgetedCategoryIds: new Set(activeBudgets.map(b => b.category_id)),
    dayOfMonth, daysInMonth, treatmentDue, babyDue,
  })
  const unbudgeted = unbudgetedRoutine({
    historyTxs: historyExpenses.filter(t => !isSavingsMove(t)),
    currentMonthTxs: monthExpenses,
    budgetedCategoryIds: new Set(activeBudgets.map(b => b.category_id)),
    isEveryday: id => !!id && CONTROLLABLE.has(catMap.get(id)?.name || ''),
    month,
    today,
  })
  // Posted income plus recurring income still due; never a baseline floor
  // that keeps expecting payroll after it landed.
  const monthIncome = expectedMonthIncome({
    actualIncome: monthIncomeRows.reduce((s, t) => s + txAmount(t), 0),
    recurringIncome: currentRI,
    postedMerchants: monthIncomeRows.map(t => t.merchant),
    monthlyBaseline: totalMonthlyIncome,
  })
  const projectedMonthSavings = monthIncome.expected - spendProjection.projected_spend

  // ── Free cash, goals ──────────────────────────────────────────────────
  const fixedCommitments = budgetCategories.reduce((s, b) => s + b.budget, 0) + instMonthly + debtItems.reduce((s, d) => s + d.minimum, 0)
  // ONE free-cash number (householdRunRate, shared with WEST capacity): the
  // median clean net of the last 3 complete months — windfalls and one-off
  // lumps out. Goal funding, the year-end plan and cash_flow all read it.
  const rr = householdRunRate(txRows, month)
  const hasHistory = rr.months_used > 0
  // Income − planned spend must equal free cash on screen (medians don't
  // subtract), so planned spend is derived from the two shown numbers.
  const plannedMonthlySpend = hasHistory ? Math.max(0, Math.round(totalMonthlyIncome - rr.run_rate)) : fixedCommitments
  const discretionary = hasHistory ? rr.run_rate : totalMonthlyIncome - fixedCommitments

  const goalsBuild = buildGoals(goals, mx, cryptoQuantities(holdings))
  const goalGap = goalsBuild.total_monthly_needed - discretionary

  const west = await westP
  // This month's balloon / aguinaldo count only until they post; once posted
  // they're already inside projectedSavings.
  const westLumpPosted = (amount: number) => monthExpensesAll.some(t => isWestPayment(t) && txAmount(t) >= amount * 0.5)
  const inflowPosted = (name: string, amount: number) => monthIncomeRows.some(t => {
    const merchant = (t.merchant || '').toLowerCase()
    return (!!name && merchant.includes(name.toLowerCase())) || merchant.includes('aguinaldo') || Math.abs(txAmount(t) - amount) <= amount * 0.02
  })
  const babyRoutine = BABY_PLAN.events.length > 0 ? Math.min(...BABY_PLAN.events.map(e => e.amount)) : 0
  const yearEnd = buildYearEndPlan({
    goals: goalsBuild.active,
    targetYear: goalsBuild.target_year,
    month,
    projectedSavings: projectedMonthSavings,
    runRate: discretionary,
    futureIncome: futureRISources,
    babyEvents: babyPlan.remaining_events,
    babyRoutine,
    knownLumps: west?.schedule.lump_sum_month && west.schedule.lump_sum_amount > 0
      ? [{
          month: west.schedule.lump_sum_month, amount: west.schedule.lump_sum_amount, label: 'WEST balloon payment',
          posted: west.schedule.lump_sum_month === month && westLumpPosted(west.schedule.lump_sum_amount),
        }]
      : [],
    knownInflows: incomeSources
      .filter(s => s.frequency === 'yearly' && s.amount > 0)
      .map(s => {
        const payMonth = Math.min(Math.max(Number((s as { pay_month?: number }).pay_month) || 12, 1), 12)
        const year = payMonth >= mx.month ? mx.year : mx.year + 1
        const key = `${year}-${String(payMonth).padStart(2, '0')}`
        return { month: key, amount: s.amount, label: s.name, posted: key === month && inflowPosted(s.name, s.amount) }
      }),
    wantsBudgets,
  })

  // ── Emergency fund ────────────────────────────────────────────────────
  const essentials = deriveMonthlyEssentials(historyExpenses, { isNeedsCategory: id => typeOfCategory(id) === 'needs', beforeMonth: month })
  const ef = efRows[0]
  const emergency = buildEmergencyFund(ef, essentials.monthly, today)

  // ── Crypto ────────────────────────────────────────────────────────────
  let cryptoSummary: SummaryResponse['crypto'] = null
  try {
    cryptoSummary = buildCryptoSummary(holdings, await pricesP)
  } catch (e) {
    console.error('Crypto summary error:', e)
  }

  // ── WEST plan for this month (never added to the goal need) ───────────
  let westPlan: SummaryWestPlan | null = null
  const planMonth = west?.savings_plan.months.find(m => m.month === month)
  if (west && planMonth) {
    westPlan = {
      month_target: planMonth.target,
      capacity_target: planMonth.capacity,
      projected_savings: projectedMonthSavings,
      pct_of_capacity: planMonth.capacity > 0 ? Math.round(projectedMonthSavings / planMonth.capacity * 100) : 0,
      pct_of_target: planMonth.target > 0 ? Math.round(projectedMonthSavings / planMonth.target * 100) : 0,
      purchase_gap: west.savings_plan.purchase_gap,
      furnishing_budget: west.savings_plan.furnishing_budget,
      cumulative_vs_capacity_since_jan: west.behavioral.cumulative_vs_capacity_since_jan,
      months_to_delivery: west.months_to_delivery,
      // "Funded at delivery": projected total at delivery over the target, the
      // same definition the Daily Brief and the WEST tracker show (not today's sources).
      funded_pct: west.projected_at_delivery && west.target > 0
        ? Math.round((west.projected_at_delivery.total_projected / west.target) * 1000) / 10
        : west.current_status.funded_pct,
      feasible: west.savings_plan.feasible,
      projected_shortfall_at_delivery: west.savings_plan.projected_shortfall_at_delivery,
      stretch_factor: west.savings_plan.stretch_factor,
    }
  }

  const upcoming = buildUpcoming({
    today,
    recurring,
    installments,
    recurringIncome: currentRI.concat(futureRI),
    postedIncomeMerchants: monthIncomeRows.map(t => t.merchant || ''),
    babyEvents: babyPlan.remaining_events,
    westLump: west?.schedule.lump_sum_month && west.schedule.lump_sum_amount > 0
      ? { date: west.schedule.lump_sum_date || `${west.schedule.lump_sum_month}-01`, amount: west.schedule.lump_sum_amount }
      : null,
  })

  const fertilityPlan = buildFertilityPlan({
    paidTxs: fertilityPaid, asOf, month,
    goalMonthlyNeeded: goalsBuild.total_monthly_needed, discretionary, wantsBudgets,
  })

  return {
    period: { start: startStr, end: today },
    income: {
      sources: incSources,
      recurring: riSources,
      future_recurring: futureRISources,
      configured_monthly: incomeBaseline.configuredMonthly,
      observed_monthly: incomeBaseline.observedMonthly,
      current_month_actual: incomeBaseline.currentMonthActual,
      total_monthly: totalMonthlyIncome,
      baseline_method: incomeBaseline.observedMonthly > incomeBaseline.configuredMonthly ? 'observed-median' : 'configured',
    },
    spending: { by_category: spendByCategory, total_monthly_avg: monthlyAvgSpend, by_month: spendByMonth },
    budgets: {
      total_budgeted: budgetCategories.reduce((s, b) => s + b.budget, 0),
      total_spent: monthlyAvgSpend,
      categories: budgetCategories,
    },
    subscriptions: { active: subs, total_monthly: subsMonthly, total_annual: subsMonthly * 12 },
    installments: { active: inst, total_monthly_commitment: instMonthly },
    debts: { items: debtItems, total_balance: debtItems.reduce((s, d) => s + d.balance, 0), total_minimums: debtItems.reduce((s, d) => s + d.minimum, 0) },
    emergency_fund: emergency,
    goals: { active: goalsBuild.active },
    cash_flow: {
      monthly_income: totalMonthlyIncome,
      // Budgets + MSI + debt minimums: what is budgeted, not what is spent.
      fixed_commitments: fixedCommitments,
      // monthly_income − discretionary_available, so the subtraction on screen reconciles.
      planned_spend: plannedMonthlySpend,
      planned_spend_basis: hasHistory ? 'median-clean-3mo' : 'budgets',
      // Free cash per month: the run rate (== year_end_goal_plan.monthly_free_cash
      // == goal_funding.discretionary_available).
      discretionary_available: discretionary,
    },
    current_month: {
      month,
      day_of_month: dayOfMonth,
      days_in_month: daysInMonth,
      month_progress_pct: Math.round(dayOfMonth / daysInMonth * 100),
      total_spent: spendProjection.total_spent,
      moved_to_savings: movedToSavings,
      budget_basis: 'cash',
      budget_vs_actual: budgetVsActual,
    },
    month_projection: {
      expected_income: monthIncome.expected,
      income_received: monthIncome.received,
      income_still_scheduled: monthIncome.stillScheduled,
      spent_so_far: spendProjection.total_spent,
      projected_spend: spendProjection.projected_spend,
      known_upcoming_treatment: Math.round(treatmentDue),
      known_upcoming_baby: Math.round(babyDue),
      moved_to_savings: movedToSavings,
      unbudgeted_typical: unbudgeted.typical,
      unbudgeted_spent: unbudgeted.spent,
      unbudgeted_spent_today: unbudgeted.spent_today,
      projected_savings: projectedMonthSavings,
      method: spendProjection.past_day_7
        ? 'per-category pace blended with recent-month medians'
        : 'history-anchored (pace stabilizes after day 7)',
    },
    goal_funding: {
      total_monthly_needed: goalsBuild.total_monthly_needed,
      discretionary_available: discretionary,
      gap: goalGap > 0 ? goalGap : 0,
      fully_funded: goalGap <= 0,
      overdue_goals: goalsBuild.overdue_goals,
    },
    year_end_goal_plan: yearEnd,
    fertility_plan: fertilityPlan,
    baby_plan: babyPlan,
    msi_timeline: inst.map(i => ({
      name: i.name, merchant: i.merchant, monthly_payment: i.monthly_payment,
      payments_remaining: i.payments_remaining, end_date: i.end_date, total_remaining: i.total_remaining,
    })).sort((a, b) => (a.end_date || '').localeCompare(b.end_date || '')),
    crypto: cryptoSummary,
    variable: buildVariable(budgetVsActual, { today, dayOfWeek: mx.dayOfWeek, daysInMonth, dayOfMonth }),
    owner_spend: buildOwnerSpend(monthExpenses, today),
    recent_transactions: buildRecentTransactions(txRows.filter(t => !isSavingsMove(t)), catMap, today),
    upcoming,
    west_plan: westPlan,
    staleness: {
      gbm_confirmed_at: west?.staleness.gbm_confirmed_at ?? null,
      ef_confirmed_at: emergency.confirmed_at,
      real_estate_confirmed_at: west?.staleness.real_estate_confirmed_at ?? null,
    },
  }
}

