import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { FERTILITY_TREATMENT_PLAN, getUnpaidTreatmentEventsForMonth, isFertilityPlanComplete } from '@/lib/fertility-plan'
import { BABY_PLAN, BABY_PLAN_TAG, looksLikeBabySpend } from '@/lib/baby-plan'
import { advanceRecurringDate } from '@/lib/recurring-dates'
import { ownersEqual } from '@/lib/owners'
import { deriveIncomeBaseline, median } from '@/lib/household-metrics'
import { addDaysKey, addMonthsKey, daysInMonth, mexicoCityToday } from '@/lib/dates'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { ConfigError, configErrorResponse, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'
import { hasTag, isWestPayment, txAmount, WINDFALL_TAG, type TxRow } from '@/lib/summary/history'
import { remainingBabyEvents } from '@/lib/summary/plans'

type ForecastEvent = {
  date: string
  type: 'income' | 'subscription' | 'msi' | 'debt' | 'recurring_income' | 'planned_expense'
  amount_mxn: number
  name: string
  category_id?: string | null
  owner?: string | null
  source_id?: string
}

type DailyPoint = {
  date: string
  inflow: number
  outflow: number
  /** Typical day-to-day spending (groceries, dining, health…), inside `outflow`. */
  variable_outflow: number
  net: number
  running_balance: number
  events: ForecastEvent[]
}

const FREQ_DIVISOR: Record<string, number> = {
  weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12,
}

// Rows the schedule below already models (processor posts, plan events, the
// WEST payment) stay out of the variable run rate, or they'd count twice.
const SCHEDULED_TAGS = ['auto-recurring', 'auto-msi', 'fertility', BABY_PLAN_TAG, WINDFALL_TAG]

function dayInMonth(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(Math.min(Math.max(1, day), daysInMonth(y, m))).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const requestedDays = Number(req.nextUrl.searchParams.get('days') ?? 60)
  const days = Number.isFinite(requestedDays) ? Math.min(Math.max(Math.trunc(requestedDays), 7), 365) : 60
  const requestedBalance = Number(req.nextUrl.searchParams.get('balance') ?? 0)
  const startingBalance = Number.isFinite(requestedBalance) ? requestedBalance : 0
  const owner = req.nextUrl.searchParams.get('owner') // optional filter

  let supabase, degraded
  try {
    ({ client: supabase, degraded } = getAdminClientInfo())
  } catch (e) {
    if (e instanceof ConfigError) return configErrorResponse(e)
    throw e
  }

  const today = mexicoCityToday()
  const month = today.slice(0, 7)
  const horizon = addDaysKey(today, days)
  const lastDay = addDaysKey(today, days - 1)

  let results
  try {
    results = await Promise.all([
      supabase.from('finance_recurring').select('*').eq('is_active', true),
      supabase.from('finance_recurring_income').select('*').eq('active', true),
      supabase.from('finance_income_sources').select('*').eq('is_active', true),
      fetchAllRows<TxRow>((from, to) => supabase.from('finance_transactions')
        .select('id,transaction_date,type,amount_mxn,amount,category_id,merchant,tags')
        .gte('transaction_date', `${addMonthsKey(month, -5)}-01`).lte('transaction_date', today)
        .order('transaction_date').order('id').range(from, to), 1000, 20000, true),
      supabase.from('finance_installments').select('*').eq('is_active', true),
      supabase.from('finance_debts').select('*').eq('is_active', true),
      supabase.from('finance_real_estate_targets').select('*').eq('is_active', true).limit(1),
      supabase.from('finance_categories').select('id,name'),
    ])
  } catch {
    results = null
  }
  if (!results || results.some(r => !Array.isArray(r) && r.error)) {
    return NextResponse.json({ error: 'Forecast data is temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const [recurringRes, recurringIncomeRes, incomeSourcesRes, txRows, installmentsRes, debtsRes, targetsRes, categoriesRes] = results as [any, any, any, TxRow[], any, any, any, any]
  const recurring: any[] = recurringRes.data || []
  const recurringIncome: any[] = recurringIncomeRes.data || []
  const incomeSources: any[] = incomeSourcesRes.data || []
  const installments: any[] = installmentsRes.data || []
  const debts: any[] = debtsRes.data || []
  const target: any = (targetsRes.data || [])[0] ?? null
  const categories: Array<{ id: string; name: string }> = categoriesRes.data || []
  const catName = new Map(categories.map(c => [c.id, c.name]))

  const events: ForecastEvent[] = []

  // 1. Subscriptions / recurring expenses — walk next_due_date forward to horizon
  for (const sub of recurring) {
    if (owner && sub.owner && !ownersEqual(sub.owner, owner)) continue
    if (!sub.next_due_date) continue
    const anchor = Number(String(sub.next_due_date).slice(8, 10))
    let due = String(sub.next_due_date).slice(0, 10)
    for (let safety = 0; due < today && safety < 50; safety++) due = advanceRecurringDate(due, sub.frequency, anchor)
    for (let safety = 0; due <= horizon && safety < 365; safety++) {
      events.push({ date: due, type: 'subscription', amount_mxn: -Math.abs(sub.amount), name: sub.name, category_id: sub.category_id, owner: sub.owner, source_id: sub.id })
      due = advanceRecurringDate(due, sub.frequency, anchor)
    }
  }

  // 2. Recurring income (finance_recurring_income — monthly with day_of_month)
  for (const ri of recurringIncome) {
    if (owner && ri.owner && !ownersEqual(ri.owner, owner)) continue
    if (ri.recurrence !== 'monthly') continue
    const day = Math.min(Math.max(ri.day_of_month || 1, 1), 31)
    let cursorMonth = month
    if (dayInMonth(cursorMonth, day) < today) cursorMonth = addMonthsKey(cursorMonth, 1)
    for (let safety = 0; safety < 24; safety++, cursorMonth = addMonthsKey(cursorMonth, 1)) {
      const date = dayInMonth(cursorMonth, day)
      if (date > horizon) break
      if (ri.start_date && date < ri.start_date) continue
      events.push({ date, type: 'recurring_income', amount_mxn: Math.abs(ri.amount), name: ri.name, owner: ri.owner, source_id: ri.id })
    }
  }

  // 3. Income sources. Yearly ones (aguinaldo) land once, in their pay month
  // (pay_month/pay_day when the row has them, else Dec 20) — not on the 1st
  // of whatever month the forecast happens to start.
  for (const inc of incomeSources) {
    if ((recurringIncome).some(ri => ri.name === inc.name && ri.active)) continue
    const freq = inc.frequency || 'monthly'
    if (freq === 'yearly') {
      const payMonth = Math.min(Math.max(Number(inc.pay_month) || 12, 1), 12)
      const payDay = Number(inc.pay_day) || 20
      let year = Number(today.slice(0, 4))
      let date = dayInMonth(`${year}-${String(payMonth).padStart(2, '0')}`, payDay)
      if (date < today) { year++; date = dayInMonth(`${year}-${String(payMonth).padStart(2, '0')}`, payDay) }
      if (date <= horizon) events.push({ date, type: 'income', amount_mxn: Math.abs(inc.amount), name: inc.name, source_id: inc.id })
      continue
    }
    let cursor = `${month}-01`
    while (cursor < today) cursor = advanceRecurringDate(cursor, freq, 1)
    for (let safety = 0; cursor <= horizon && safety < 365; safety++) {
      events.push({ date: cursor, type: 'income', amount_mxn: Math.abs(inc.amount), name: inc.name, source_id: inc.id })
      cursor = advanceRecurringDate(cursor, freq, 1)
    }
  }

  // The source tables can lag behind posted salary transactions. Add only the
  // missing portion of the robust observed baseline so the forecast neither
  // drops real household income nor double-counts configured sources.
  if (!owner) {
    const recurringNames = new Set(recurringIncome.filter(ri => ri.active).map(ri => ri.name))
    const configuredFromRecurring = recurringIncome.reduce((sum, income) => {
      const divisor = income.recurrence === 'bimonthly' ? 2 : income.recurrence === 'annual' ? 12 : 1
      return sum + Math.abs(income.amount || 0) / divisor
    }, 0)
    const configuredFromSources = incomeSources
      .filter(income => !recurringNames.has(income.name))
      .reduce((sum, income) => sum + Math.abs(income.amount || 0) / (FREQ_DIVISOR[income.frequency] || 1), 0)
    const configuredMonthly = configuredFromRecurring + configuredFromSources
    const baseline = deriveIncomeBaseline(configuredMonthly, txRows.filter(t => t.type === 'income'), month)
    const monthlySupplement = Math.max(0, baseline.effectiveMonthly - configuredMonthly)
    if (monthlySupplement > 0) {
      for (let cursor = `${addMonthsKey(month, 1)}-01`; cursor <= horizon; cursor = `${addMonthsKey(cursor, 1)}-01`) {
        events.push({ date: cursor, type: 'income', amount_mxn: monthlySupplement, name: 'Observed household income baseline', source_id: 'observed-income-baseline' })
      }
    }
  }

  // 4. MSI installments — the next one is start_date + payments made
  for (const msi of installments) {
    if (owner && msi.owner && !ownersEqual(msi.owner, owner)) continue
    const remaining = msi.installment_count - (msi.payments_made || 0)
    if (remaining <= 0) continue
    const start = msi.start_date ? String(msi.start_date).slice(0, 10) : today
    const day = Number(start.slice(8, 10)) || 1
    let next = dayInMonth(addMonthsKey(start, msi.payments_made || 0), day)
    if (next < today) next = dayInMonth(month, day) >= today ? dayInMonth(month, day) : dayInMonth(addMonthsKey(month, 1), day)
    for (let posted = 0; posted < remaining && next <= horizon; posted++) {
      events.push({ date: next, type: 'msi', amount_mxn: -Math.abs(msi.installment_amount), name: `MSI: ${msi.name}`, category_id: msi.category_id, owner: msi.owner, source_id: msi.id })
      next = dayInMonth(addMonthsKey(next, 1), day)
    }
  }

  // 5. Debt minimums — monthly on the 1st (only if not already covered by a linked subscription)
  const debtIdsCoveredBySubs = new Set(recurring.filter(r => r.debt_id).map(r => r.debt_id))
  for (const debt of debts) {
    if (owner && debt.owner && !ownersEqual(debt.owner, owner)) continue
    if (debt.balance <= 0) continue
    if (debtIdsCoveredBySubs.has(debt.id)) continue
    let cursor = `${month}-01`
    if (cursor < today) cursor = `${addMonthsKey(month, 1)}-01`
    for (let safety = 0; cursor <= horizon && safety < 24; safety++, cursor = `${addMonthsKey(cursor, 1)}-01`) {
      events.push({ date: cursor, type: 'debt', amount_mxn: -Math.abs(debt.minimum_payment), name: `${debt.name} (min)`, owner: debt.owner, source_id: debt.id })
    }
  }

  const expenses = txRows.filter(t => t.type === 'expense')
  if (!owner) {
    // 6. Planned plan events: only what's still owed, on or after today. The
    // treatment plan is complete; baby events settle on the month's tagged
    // (or obviously prenatal) spend, the same rule summary uses.
    if (!isFertilityPlanComplete()) {
      const paid = expenses.filter(t => hasTag(t, 'fertility')).map(t => ({ date: t.transaction_date, amount: txAmount(t) }))
      const months = [...new Set(FERTILITY_TREATMENT_PLAN.events.map(e => e.month))].filter(m => m >= month)
      for (const m of months) {
        for (const e of getUnpaidTreatmentEventsForMonth(m, paid)) {
          const date = e.date < today ? today : e.date
          if (date <= horizon) events.push({ date, type: 'planned_expense', amount_mxn: -Math.abs(e.amount), name: e.label, category_id: null, owner: null, source_id: 'fertility-treatment' })
        }
      }
    }
    const babyRows = expenses.filter(t => t.transaction_date >= `${BABY_PLAN.startMonth}-01`
      && (hasTag(t, BABY_PLAN_TAG) || looksLikeBabySpend(t.merchant, t.category_id ? catName.get(t.category_id) : null)))
    const babyLedger = {
      taggedPaid: [],
      settlementPaid: babyRows.map(t => ({ date: t.transaction_date, amount: txAmount(t) })),
      untaggedCandidates: 0,
    }
    for (const e of remainingBabyEvents(babyLedger, today)) {
      const date = e.date < today ? today : e.date
      if (date <= horizon) events.push({ date, type: 'planned_expense', amount_mxn: -Math.abs(e.amount), name: e.label, category_id: null, owner: null, source_id: 'baby-plan' })
    }

    // 7. WEST apartment: the balloon, plus monthly payments when no active
    // subscription already schedules them.
    if (target) {
      const lumpDate = target.lump_sum_date ? String(target.lump_sum_date).slice(0, 10) : null
      const lumpPosted = lumpDate && expenses.some(t => isWestPayment(t) && t.transaction_date.slice(0, 7) === lumpDate.slice(0, 7) && txAmount(t) >= (target.lump_sum_amount || 0) * 0.5)
      if (lumpDate && lumpDate >= today && lumpDate <= horizon && (target.lump_sum_amount || 0) > 0 && !lumpPosted) {
        events.push({ date: lumpDate, type: 'planned_expense', amount_mxn: -Math.abs(target.lump_sum_amount), name: 'WEST balloon payment', category_id: null, owner: null, source_id: 'west-lump' })
      }
      const scheduledBySub = recurring.some(r => /\bwest\b/i.test(String(r.name || '')))
      if (!scheduledBySub && (target.monthly_payment || 0) > 0) {
        const end = target.monthly_payment_end ? String(target.monthly_payment_end).slice(0, 10) : null
        for (let cursor = `${addMonthsKey(month, 1)}-01`; cursor <= horizon && (!end || cursor <= end); cursor = `${addMonthsKey(cursor, 1)}-01`) {
          events.push({ date: cursor, type: 'planned_expense', amount_mxn: -Math.abs(target.monthly_payment), name: 'WEST monthly payment', category_id: null, owner: null, source_id: 'west-monthly' })
        }
      }
    }
  }

  // 8. Typical variable spending: median of the last 3 complete months of
  // everything the schedule above doesn't already model, spread per day.
  const byMonth = new Map<string, number>()
  for (const t of expenses) {
    const m = t.transaction_date.slice(0, 7)
    if (m >= month || m < addMonthsKey(month, -3)) continue
    byMonth.set(m, byMonth.get(m) ?? 0)
    if (hasTag(t, ...SCHEDULED_TAGS) || isWestPayment(t) || looksLikeBabySpend(t.merchant, t.category_id ? catName.get(t.category_id) : null)) continue
    byMonth.set(m, (byMonth.get(m) ?? 0) + txAmount(t))
  }
  const typicalVariableMonthly = owner ? 0 : Math.round(median([...byMonth.values()]))

  // Build daily series
  events.sort((a, b) => a.date.localeCompare(b.date))
  const dailyMap: Record<string, DailyPoint> = {}
  for (let i = 0; i < days; i++) {
    const d = addDaysKey(today, i)
    const [y, m] = d.split('-').map(Number)
    const variable = typicalVariableMonthly > 0 ? Math.round(typicalVariableMonthly / daysInMonth(y, m) * 100) / 100 : 0
    dailyMap[d] = { date: d, inflow: 0, outflow: variable, variable_outflow: variable, net: -variable, running_balance: 0, events: [] }
  }
  for (const ev of events) {
    const day = dailyMap[ev.date]
    if (!day) continue
    if (ev.amount_mxn > 0) day.inflow += ev.amount_mxn
    else day.outflow += Math.abs(ev.amount_mxn)
    day.net += ev.amount_mxn
    day.events.push(ev)
  }

  let running = startingBalance
  const series: DailyPoint[] = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date))
  for (const d of series) {
    running += d.net
    d.running_balance = Math.round(running * 100) / 100
  }

  const totalInflow = series.reduce((s, d) => s + d.inflow, 0)
  const totalOutflow = series.reduce((s, d) => s + d.outflow, 0)
  const minBalance = series.reduce(
    (acc, d) => (d.running_balance < acc.balance ? { date: d.date, balance: d.running_balance } : acc),
    { date: series[0]?.date, balance: series[0]?.running_balance ?? startingBalance },
  )
  const maxBalance = series.reduce(
    (acc, d) => (d.running_balance > acc.balance ? { date: d.date, balance: d.running_balance } : acc),
    { date: series[0]?.date, balance: series[0]?.running_balance ?? startingBalance },
  )
  // Highlights come from the series itself: past events can't leak in, and
  // the variable run rate counts.
  const window = (n: number) => {
    const slice = series.slice(0, n)
    return { events: slice.reduce((s, d) => s + d.events.length, 0), net: Math.round(slice.reduce((s, d) => s + d.net, 0)) }
  }

  return withDegradedHeader(NextResponse.json({
    period: { start: today, end: horizon, days },
    starting_balance: startingBalance,
    series,
    events: events.filter(e => e.date >= today && e.date <= lastDay),
    assumptions: { typical_variable_monthly: typicalVariableMonthly, variable_basis: 'median of the last 3 complete months, scheduled rows excluded' },
    summary: {
      total_inflow: Math.round(totalInflow),
      total_outflow: Math.round(totalOutflow),
      net_delta: Math.round(totalInflow - totalOutflow),
      ending_balance: Math.round(running * 100) / 100,
      min_balance: { date: minBalance.date, balance: Math.round(minBalance.balance * 100) / 100 },
      max_balance: { date: maxBalance.date, balance: Math.round(maxBalance.balance * 100) / 100 },
      next_7_days: window(7),
      next_30_days: window(30),
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } }), degraded)
}
