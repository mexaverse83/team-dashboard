// WEST purchase projection, callable in-process (no HTTP self-fetch). Reads
// run in parallel; the math lives in src/lib/west-projection.ts (pure, shared
// with the slider UI).
import type { SupabaseClient } from '@supabase/supabase-js'
import { accruedValue } from '@/lib/fixed-income'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { fetchCryptoPrices } from '@/lib/crypto-prices'
import { BABY_PLAN, EDUCATION_FUND_PLAN } from '@/lib/baby-plan'
import { addMonthsKey, mexicoCityToday } from '@/lib/dates'
import { monthlyNetHistory, recentNetRunRate, type TxRow } from '@/lib/summary/history'
import { buildSavingsPlan, monthsBetween, projectWest, type WestSchedule } from '@/lib/west-projection'

/** Furnishing / fit-out budget needed at delivery on top of the purchase price. */
export const FURNISHING_BUDGET_MXN = 1_000_000
const DEFAULT_TARGET_MXN = 11_204_000
const DEFAULT_INFONAVIT_MXN = 350_000

export interface WestProjectionOptions {
  /** Clock override for tests. */
  now?: Date
  /** Net annual GBM return override (the route's ?rate=). */
  rate?: number | null
  /** Crypto annual growth override (the route's ?cryptoGrowth=). */
  cryptoGrowth?: number | null
}

/** No active row in finance_real_estate_targets; the route answers 404. */
export class WestTargetNotFoundError extends Error {
  constructor(message = 'No active target found') {
    super(message)
    this.name = 'WestTargetNotFoundError'
  }
}

type Res<T> = { data: T | null; error: { message: string } | null }

function must<T>(res: Res<T>): T {
  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []) as T
}

/** Live crypto value; `known` is false when prices or holdings couldn't be read (never a silent $0). */
async function cryptoTotal(holdingsP: PromiseLike<Res<Array<{ symbol: string; quantity: number }>>>): Promise<{ value: number; known: boolean }> {
  try {
    const res = await holdingsP
    if (res.error) return { value: 0, known: false }
    const holdings = (res.data || []).filter(h => Number(h.quantity) > 0)
    if (holdings.length === 0) return { value: 0, known: true }
    const prices = await fetchCryptoPrices(holdings.map(h => h.symbol))
    if (!prices) return { value: 0, known: false }
    return { value: holdings.reduce((s, h) => s + Number(h.quantity) * (prices[h.symbol]?.mxn || 0), 0), known: true }
  } catch {
    return { value: 0, known: false }
  }
}

export async function getWestProjection(
  supabase: SupabaseClient,
  { now = new Date(), rate, cryptoGrowth }: WestProjectionOptions = {},
) {
  const today = mexicoCityToday(now)
  const currentMonth = today.slice(0, 7)
  // Clean-net history: six complete months for the run rate, back to Jan 1
  // for the year-to-date tracker.
  const sixBack = `${addMonthsKey(currentMonth, -6)}-01`
  const jan1 = `${currentMonth.slice(0, 4)}-01-01`
  const historyStart = jan1 < sixBack ? jan1 : sixBack

  const holdingsP = supabase.from('finance_crypto_holdings').select('symbol, quantity')
  const cryptoP = cryptoTotal(holdingsP as unknown as PromiseLike<Res<Array<{ symbol: string; quantity: number }>>>)
  const [targetsRes, debtsRes, gbmRes, installmentsRes, yearlyRes, westRows, historyRows, crypto] = await Promise.all([
    supabase.from('finance_real_estate_targets').select('*').eq('is_active', true).limit(1),
    supabase.from('finance_debts').select('id, balance'),
    supabase.from('finance_fixed_income').select('principal, annual_rate, commission_rate, net_annual_rate, updated_at').eq('institution', 'GBM'),
    supabase.from('finance_installments').select('name, installment_amount, end_date').eq('is_active', true),
    supabase.from('finance_income_sources').select('name, amount').eq('is_active', true).eq('frequency', 'yearly'),
    fetchAllRows<{ amount_mxn: number; transaction_date: string }>((from, to) => supabase
      .from('finance_transactions').select('amount_mxn, transaction_date')
      .eq('merchant', 'WEST').eq('type', 'expense')
      .order('transaction_date').order('id').range(from, to), 1000, 20000, true),
    fetchAllRows<TxRow>((from, to) => supabase
      .from('finance_transactions').select('transaction_date, type, amount_mxn, tags')
      .gte('transaction_date', historyStart).lt('transaction_date', `${currentMonth}-01`)
      .order('transaction_date').order('id').range(from, to), 1000, 20000, true),
    cryptoP,
  ])

  const targets = must(targetsRes as Res<Array<Record<string, any>>>)
  if (targets.length === 0) throw new WestTargetNotFoundError()
  const target = targets[0]

  const debts = must(debtsRes as Res<Array<{ id: string; balance: number }>>)
  const payoffIds: string[] | null = Array.isArray(target.debt_ids_to_payoff) && target.debt_ids_to_payoff.length > 0 ? target.debt_ids_to_payoff : null
  const debtPayoffTotal = debts
    .filter(d => (payoffIds ? payoffIds.includes(d.id) : (d.balance || 0) > 0))
    .reduce((s, d) => s + (d.balance || 0), 0)

  const gbmRecords = must(gbmRes as Res<Array<{ principal: number; annual_rate: number; commission_rate: number; net_annual_rate: number; updated_at: string | null }>>)
  // Start from the accrued value since the last confirmation, so the
  // projection picks up where the live balance actually is.
  const liveGBM = gbmRecords.length > 0
    ? gbmRecords.reduce((s, r) => s + accruedValue(r as Parameters<typeof accruedValue>[0], now), 0)
    : (target.sale_deposit_received || 0)
  const gbmConfirmedAt = gbmRecords.map(r => r.updated_at).filter(Boolean).sort().at(-1) ?? null

  // amount_paid is anchored at the target's last manual update; WEST payments
  // posted since roll in automatically.
  const paidAnchor = String(target.updated_at || target.purchase_date || '2026-01-01').slice(0, 10)
  const paidToDate = (target.amount_paid || 0) + westRows
    .filter(t => t.transaction_date > paidAnchor)
    .reduce((s, t) => s + (t.amount_mxn || 0), 0)

  const targetAmount = target.target_amount || DEFAULT_TARGET_MXN
  const schedule: WestSchedule = {
    target_amount: targetAmount,
    delivery_date: String(target.delivery_date).slice(0, 10),
    monthly_payment: target.monthly_payment || 0,
    monthly_payment_end_month: target.monthly_payment_end ? String(target.monthly_payment_end).slice(0, 7) : null,
    lump_sum_amount: target.lump_sum_amount || 0,
    lump_sum_month: target.lump_sum_date ? String(target.lump_sum_date).slice(0, 7) : null,
    lump_sum_date: target.lump_sum_date ? String(target.lump_sum_date).slice(0, 10) : null,
    sale_remaining_date: target.sale_remaining_date ? String(target.sale_remaining_date).slice(0, 10) : null,
    sale_net_proceeds: Math.max(0, (target.sale_price || 0) - (target.sale_deposit_received || 0) - debtPayoffTotal),
    infonavit: target.laura_infonavit_mxn || DEFAULT_INFONAVIT_MXN,
    current_market_value: target.current_market_value || targetAmount,
  }
  // 9.5% net = 10.75% gross − 1.25% commission (2023-2025 avg ~10.3% gross)
  const annualRate = rate != null && Number.isFinite(rate) ? rate : (target.investment_annual_return || 0.095)
  const cryptoAnnualGrowth = cryptoGrowth != null && Number.isFinite(cryptoGrowth) ? cryptoGrowth : 0.15
  const appreciationRate = target.appreciation_rate_annual || 0.125
  const balances = { paid: paidToDate, investments: liveGBM, crypto: crypto.value }
  const rates = { annual_return: annualRate, crypto_growth: cryptoAnnualGrowth, appreciation: appreciationRate }

  const run = projectWest(schedule, balances, rates, today)
  const lastMonth = run.months[run.months.length - 1]
  const scenario = (r: number, monthlyContribution = 0) => {
    const s = projectWest(schedule, balances, { ...rates, annual_return: r, monthly_contribution: monthlyContribution }, today)
    return { total: s.total, gap: s.gap, fully_funded_month: s.fully_funded_month }
  }
  const baseRun = scenario(annualRate)

  // Behaviour: what the household actually nets per month, cleaned of
  // windfalls and one-off lumps (no add-back of tagged spend).
  const history = monthlyNetHistory(historyRows, { beforeMonth: currentMonth })
  const lastSix = history.filter(m => m.month >= sixBack.slice(0, 7))
  const avgNet = lastSix.length > 0 ? lastSix.reduce((s, m) => s + m.net, 0) / lastSix.length : 0
  const baseCapacity = Math.max(0, recentNetRunRate(lastSix, 3))
  const behavioralRun = scenario(annualRate, baseCapacity)
  const monthsN = Math.max(1, monthsBetween(currentMonth, schedule.delivery_date.slice(0, 7)))
  const mr = Math.pow(1 + annualRate, 1 / 12) - 1
  const requiredMonthly = baseRun.gap > 0 ? Math.ceil(baseRun.gap * mr / (Math.pow(1 + mr, monthsN) - 1)) : 0
  const ytd = history.filter(m => m.month >= jan1.slice(0, 7))
  const cumulativeVsCapacity = Math.round(ytd.reduce((s, m) => s + (m.net - baseCapacity), 0))

  const installments = must(installmentsRes as Res<Array<{ name: string; installment_amount: number; end_date: string | null }>>)
  const yearlyBonus = must(yearlyRes as Res<Array<{ amount: number }>>).reduce((s, i) => s + (i.amount || 0), 0)
  const babyRoutine = BABY_PLAN.events.length > 0 ? Math.min(...BABY_PLAN.events.map(e => e.amount)) : 0
  const plan = buildSavingsPlan({
    schedule,
    today,
    baseCapacity,
    annualReturn: annualRate,
    purchaseGap: baseRun.gap,
    furnishingBudget: FURNISHING_BUDGET_MXN,
    installments,
    yearlyBonus,
    babyEvents: BABY_PLAN.events,
    babyRoutine,
    education: { monthlyContribution: EDUCATION_FUND_PLAN.monthlyContribution, startMonth: EDUCATION_FUND_PLAN.startMonth },
  })

  const pending = (date: string | null) => (date && date <= today ? 'done' : 'pending')
  const milestones: Array<{ date: string; label: string; status: string }> = [
    { date: today, label: `$${(paidToDate / 1e6).toFixed(1)}M paid (${((paidToDate / targetAmount) * 100).toFixed(1)}%)`, status: 'done' },
  ]
  if (schedule.sale_remaining_date) {
    const status = pending(schedule.sale_remaining_date)
    const postSaleBalance = schedule.sale_net_proceeds + (target.sale_deposit_received || 0)
    milestones.push(
      { date: schedule.sale_remaining_date, label: `Apartment sale proceeds land (~$${(schedule.sale_net_proceeds / 1e6).toFixed(1)}M net)`, status },
      { date: schedule.sale_remaining_date, label: 'BBVA + Infonavit paid off', status },
      // GBM commission drops 1.25% → 0.82% once the balance crosses $2.5M
      { date: schedule.sale_remaining_date, label: `GBM commission 1.25% → 0.82% (+$${(Math.round(postSaleBalance * (0.0125 - 0.0082)) / 1000).toFixed(0)}K/yr saved)`, status },
    )
  }
  if (target.lump_sum_date) {
    milestones.push({ date: String(target.lump_sum_date).slice(0, 10), label: `$${(schedule.lump_sum_amount / 1000).toFixed(0)}K lump sum payment`, status: pending(String(target.lump_sum_date).slice(0, 10)) })
  }
  if (target.monthly_payment_end) {
    milestones.push({ date: String(target.monthly_payment_end).slice(0, 10), label: `Last monthly $${(schedule.monthly_payment / 1000).toFixed(0)}K payment`, status: pending(String(target.monthly_payment_end).slice(0, 10)) })
  }
  milestones.push(
    { date: schedule.delivery_date, label: `Laura's Infonavit ($${(schedule.infonavit / 1000).toFixed(0)}K) applied to balance`, status: 'pending' },
    { date: schedule.delivery_date, label: 'WEST delivery — final balance due', status: 'target' },
  )
  milestones.sort((a, b) => a.date.localeCompare(b.date))

  const available = paidToDate + liveGBM + crypto.value + schedule.infonavit
  const planMonth = plan.months.find(m => m.month === currentMonth) ?? null

  return {
    target: targetAmount,
    delivery_date: schedule.delivery_date,
    months_to_delivery: monthsBetween(currentMonth, schedule.delivery_date.slice(0, 7)),
    as_of: today,
    schedule,
    current_status: {
      amount_paid: Math.round(paidToDate),
      pct_paid: (paidToDate / targetAmount) * 100,
      investment_value: Math.round(liveGBM),
      crypto_value: Math.round(crypto.value),
      crypto_value_known: crypto.known,
      infonavit_laura: Math.round(schedule.infonavit),
      // Live position: paid + GBM + crypto + Infonavit (the sale deposit is
      // already inside the GBM balance).
      total_available: Math.round(available),
      gap: Math.round(targetAmount - available),
      funded_pct: Math.round((available / targetAmount) * 1000) / 10,
    },
    projected_at_delivery: lastMonth ? {
      total_paid: lastMonth.paid,
      investment_value: lastMonth.investments,
      crypto_value: lastMonth.crypto,
      infonavit_laura: lastMonth.infonavit,
      total_projected: lastMonth.total,
      gap: lastMonth.gap,
      gap_pct: (lastMonth.gap / targetAmount) * 100,
      financing_needed: Math.max(0, lastMonth.gap),
      sub_million_gap: lastMonth.gap < 1000000,
    } : null,
    monthly_projection: run.months,
    scenarios: {
      conservative_8pct: scenario(0.08),
      base_9_5pct: scenario(0.095),
      optimistic_11pct: scenario(0.11),
    },
    behavioral: {
      monthly_net_savings_history: lastSix,
      avg_monthly_net_savings: Math.round(avgNet),
      recent_3mo_net_savings: baseCapacity,
      assumed_monthly_contribution: baseCapacity,
      projected_total_at_delivery: behavioralRun.total,
      projected_gap_at_delivery: behavioralRun.gap,
      fully_funded_month: behavioralRun.fully_funded_month,
      required_monthly_contribution: requiredMonthly,
      cumulative_vs_capacity_since_jan: cumulativeVsCapacity,
      ytd_months: ytd.length,
    },
    savings_plan: {
      ...plan,
      current_month: planMonth,
      assumptions: {
        base_capacity: baseCapacity,
        capacity_basis: 'median net of the last 3 complete months (windfall income and one-off lumps excluded)',
        clean_months_used: Math.min(3, lastSix.length),
        msi_monthly_now: Math.round(installments.reduce((s, i) => s + (i.installment_amount || 0), 0)),
        aguinaldo_yearly: Math.round(yearlyBonus),
        baby_routine_monthly: babyRoutine,
      },
    },
    milestones,
    property: {
      purchase_price: targetAmount,
      current_market_value: schedule.current_market_value,
      purchase_date: target.purchase_date ?? null,
      last_valuation_date: target.last_valuation_date ?? null,
      appreciation_rate: appreciationRate,
      projected_value_at_delivery: run.property_value,
      equity_at_delivery: run.property_value - targetAmount,
    },
    funding_sources: [
      { name: 'Direct Payments', current: Math.round(paidToDate), at_delivery: lastMonth?.paid || 0, owner: 'bernardo', status: 'on_track' },
      { name: 'GBM Investment', current: Math.round(liveGBM), at_delivery: lastMonth?.investments || 0, owner: 'shared', status: 'growing' },
      { name: 'Crypto', current: Math.round(crypto.value), at_delivery: lastMonth?.crypto || 0, owner: 'shared', status: crypto.known ? 'growing' : 'unknown' },
      { name: "Laura's Infonavit", current: Math.round(schedule.infonavit), at_delivery: Math.round(schedule.infonavit), owner: 'laura', status: 'on_track' },
    ],
    assumptions: {
      investment_return: annualRate,
      appreciation_rate: appreciationRate,
      debt_payoff_total: debtPayoffTotal,
      crypto_growth: cryptoAnnualGrowth,
      laura_infonavit: schedule.infonavit,
      monthly_savings: 0,
    },
    staleness: {
      gbm_confirmed_at: gbmConfirmedAt,
      real_estate_confirmed_at: (target.last_valuation_date || target.updated_at || null) as string | null,
    },
  }
}

export type WestProjection = Awaited<ReturnType<typeof getWestProjection>>
