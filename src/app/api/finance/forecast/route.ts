import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { getRemainingTreatmentEvents } from '@/lib/fertility-plan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

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
  net: number
  running_balance: number
  events: ForecastEvent[]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function advanceByFrequency(date: Date, frequency: string): Date {
  const r = new Date(date)
  switch (frequency) {
    case 'weekly': r.setUTCDate(r.getUTCDate() + 7); break
    case 'biweekly': r.setUTCDate(r.getUTCDate() + 14); break
    case 'monthly': r.setUTCMonth(r.getUTCMonth() + 1); break
    case 'quarterly': r.setUTCMonth(r.getUTCMonth() + 3); break
    case 'semi-annual': r.setUTCMonth(r.getUTCMonth() + 6); break
    case 'yearly':
    case 'annual': r.setUTCFullYear(r.getUTCFullYear() + 1); break
    default: r.setUTCMonth(r.getUTCMonth() + 1)
  }
  return r
}

const FREQ_DIVISOR: Record<string, number> = {
  weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12,
}

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('days') || '60'), 7), 365)
  const startingBalance = parseFloat(req.nextUrl.searchParams.get('balance') || '0')
  const owner = req.nextUrl.searchParams.get('owner') // optional filter

  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const horizon = addDays(today, days)

  const [
    { data: recurring },
    { data: recurringIncome },
    { data: incomeSources },
    { data: installments },
    { data: debts },
  ] = await Promise.all([
    supabase.from('finance_recurring').select('*').eq('is_active', true),
    supabase.from('finance_recurring_income').select('*').eq('active', true),
    supabase.from('finance_income_sources').select('*').eq('is_active', true),
    supabase.from('finance_installments').select('*').eq('is_active', true),
    supabase.from('finance_debts').select('*').eq('is_active', true),
  ])

  const events: ForecastEvent[] = []

  // 1. Subscriptions / recurring expenses — walk next_due_date forward to horizon
  for (const sub of recurring || []) {
    if (owner && sub.owner && sub.owner !== owner) continue
    if (!sub.next_due_date) continue
    let due = new Date(sub.next_due_date + 'T00:00:00Z')
    // Skip already-past due dates (process-recurring would have caught those)
    if (due < today) {
      // advance until in the future
      let safety = 0
      while (due < today && safety++ < 50) {
        due = advanceByFrequency(due, sub.frequency)
      }
    }
    let safety = 0
    while (due <= horizon && safety++ < 365) {
      events.push({
        date: isoDate(due),
        type: 'subscription',
        amount_mxn: -Math.abs(sub.amount),
        name: sub.name,
        category_id: sub.category_id,
        owner: sub.owner,
        source_id: sub.id,
      })
      due = advanceByFrequency(due, sub.frequency)
    }
  }

  // 2. Recurring income (finance_recurring_income — monthly with day_of_month)
  for (const ri of recurringIncome || []) {
    if (owner && ri.owner && ri.owner !== owner) continue
    if (ri.recurrence !== 'monthly') {
      // Monthly only for now; bimonthly/annual could be approximated similarly
      continue
    }
    const day = Math.min(Math.max(ri.day_of_month || 1, 1), 28)
    let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), day))
    if (cursor < today) {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, day))
    }
    let safety = 0
    while (cursor <= horizon && safety++ < 24) {
      events.push({
        date: isoDate(cursor),
        type: 'recurring_income',
        amount_mxn: Math.abs(ri.amount),
        name: ri.name,
        owner: ri.owner,
        source_id: ri.id,
      })
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, day))
    }
  }

  // 3. Income sources (finance_income_sources by frequency — assume "around the 1st" if unspecified)
  for (const inc of incomeSources || []) {
    // Skip if already covered by recurring_income with same name
    if ((recurringIncome || []).some(ri => ri.name === inc.name && ri.active)) continue
    const freq = inc.frequency || 'monthly'
    const monthly = inc.amount / (FREQ_DIVISOR[freq] || 1)
    // Schedule at the start of each cycle within horizon
    let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    if (cursor < today) cursor = new Date(today)
    let safety = 0
    while (cursor <= horizon && safety++ < 365) {
      events.push({
        date: isoDate(cursor),
        type: 'income',
        amount_mxn: Math.abs(monthly),
        name: inc.name,
        source_id: inc.id,
      })
      cursor = advanceByFrequency(cursor, freq)
    }
  }

  // 4. MSI installments — monthly until payments_remaining == 0 (or end_date)
  for (const msi of installments || []) {
    if (owner && msi.owner && msi.owner !== owner) continue
    const remaining = msi.installment_count - (msi.payments_made || 0)
    if (remaining <= 0) continue
    // Use start_date + payments_made months as next due, or 1st of next month if missing
    const start = msi.start_date ? new Date(msi.start_date + 'T00:00:00Z') : today
    let next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + (msi.payments_made || 0), start.getUTCDate()))
    if (next < today) next = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, start.getUTCDate() || 1))
    let posted = 0
    while (posted < remaining && next <= horizon) {
      events.push({
        date: isoDate(next),
        type: 'msi',
        amount_mxn: -Math.abs(msi.installment_amount),
        name: `MSI: ${msi.name}`,
        category_id: msi.category_id,
        owner: msi.owner,
        source_id: msi.id,
      })
      next = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()))
      posted++
    }
  }

  // 5. Debt minimums — monthly on the 1st (only if not already covered by a linked subscription)
  const debtIdsCoveredBySubs = new Set(
    (recurring || []).filter((r: { debt_id?: string }) => r.debt_id).map((r: { debt_id?: string }) => r.debt_id)
  )
  for (const debt of debts || []) {
    if (owner && debt.owner && debt.owner !== owner) continue
    if (debt.balance <= 0) continue
    if (debtIdsCoveredBySubs.has(debt.id)) continue // already counted as a subscription
    let cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    if (cursor < today) cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
    let safety = 0
    while (cursor <= horizon && safety++ < 24) {
      events.push({
        date: isoDate(cursor),
        type: 'debt',
        amount_mxn: -Math.abs(debt.minimum_payment),
        name: `${debt.name} (min)`,
        owner: debt.owner,
        source_id: debt.id,
      })
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    }
  }

  // 6. Planned fertility treatment expense — one-time temporary commitment.
  for (const treatmentEvent of getRemainingTreatmentEvents(today)) {
    const due = new Date(treatmentEvent.date + 'T00:00:00Z')
    if (due > horizon) continue
    events.push({
      date: treatmentEvent.date,
      type: 'planned_expense',
      amount_mxn: -Math.abs(treatmentEvent.amount),
      name: treatmentEvent.label,
      category_id: null,
      owner: null,
      source_id: 'fertility-treatment',
    })
  }

  // Build daily series
  events.sort((a, b) => a.date.localeCompare(b.date))
  const dailyMap: Record<string, DailyPoint> = {}
  for (let i = 0; i < days; i++) {
    const d = isoDate(addDays(today, i))
    dailyMap[d] = { date: d, inflow: 0, outflow: 0, net: 0, running_balance: 0, events: [] }
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

  // Aggregates
  const totalInflow = series.reduce((s, d) => s + d.inflow, 0)
  const totalOutflow = series.reduce((s, d) => s + d.outflow, 0)
  const netDelta = totalInflow - totalOutflow
  const minBalance = series.reduce(
    (acc, d) => (d.running_balance < acc.balance ? { date: d.date, balance: d.running_balance } : acc),
    { date: series[0]?.date, balance: series[0]?.running_balance ?? startingBalance }
  )
  const maxBalance = series.reduce(
    (acc, d) => (d.running_balance > acc.balance ? { date: d.date, balance: d.running_balance } : acc),
    { date: series[0]?.date, balance: series[0]?.running_balance ?? startingBalance }
  )

  // Upcoming highlights — next 7 / 30 days
  const upcoming7 = events.filter(e => e.date <= isoDate(addDays(today, 7)))
  const upcoming30 = events.filter(e => e.date <= isoDate(addDays(today, 30)))
  const next7Net = upcoming7.reduce((s, e) => s + e.amount_mxn, 0)
  const next30Net = upcoming30.reduce((s, e) => s + e.amount_mxn, 0)

  return NextResponse.json({
    period: { start: isoDate(today), end: isoDate(horizon), days },
    starting_balance: startingBalance,
    series,
    events,
    summary: {
      total_inflow: Math.round(totalInflow),
      total_outflow: Math.round(totalOutflow),
      net_delta: Math.round(netDelta),
      ending_balance: Math.round(running * 100) / 100,
      min_balance: { date: minBalance.date, balance: Math.round(minBalance.balance * 100) / 100 },
      max_balance: { date: maxBalance.date, balance: Math.round(maxBalance.balance * 100) / 100 },
      next_7_days: { events: upcoming7.length, net: Math.round(next7Net) },
      next_30_days: { events: upcoming30.length, net: Math.round(next30Net) },
    },
  })
}
