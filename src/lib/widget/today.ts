// The widget's daily plan (payload.today, v3): what today can take while the
// month's goal (the WEST savings plan) stays on target.
//
// Pure: buildWidgetPayload() hands in the summary and this month's expense
// rows. The phone writes every sentence itself (EN/ES) from the kinds and
// numbers here, so nothing in this block is pre-worded.
//
// ── Definition (all MXN, Mexico City dates) ──
//   days_left  = days_in_month − day + 1                         (today included)
//   pool       = expected_income − target − spent_before_today − scheduled_left
//     target              = west_plan.capacity_target (the month's WEST savings goal)
//     spent_before_today  = month_projection.spent_so_far − every expense dated today
//     scheduled_left      = charges the plan already knows about from today to month
//                           end that are not posted yet (subscriptions, MSI, the
//                           treatment and baby events still owed), plus the planned
//                           rows (auto-recurring, auto-msi, fertility, baby) that
//                           posted today, since they were still pending this morning
//   reserve    = RESERVE_SHARE × max(0, cushion), cushion = projected_savings + spent − target
//                (the morning's cushion over target; part of it is held back so
//                following the allowance every day still lands above target)
//   allowance  = max(0, floor((pool − reserve) / days_left / 10) × 10)
//   spent      = discretionary expenses dated today (every expense row minus the
//                planned tags above: those are in scheduled_left, not in the day)
//   left       = allowance − spent
//
// pool equals the cushion over target plus the spend the projection still
// expects this month; dividing only the cushion by the days left would count
// the expected spend twice. The allowance is fixed from the morning's numbers,
// so it doesn't move as the day's spending comes in. Spending exactly the
// allowance every remaining day lands the month at target + reserve.
//
// state: 'risk' when pool − reserve ≤ 0 (even a no-spend day leaves the goal
// short), 'over' when spent > allowance, 'tight' when under TIGHT_SHARE of the
// allowance is left, else 'ok'.
//
// Past days (week, streak, yesterday) rebuild that morning's pool from today's:
// pool(d) = pool(today) + discretionary spend from d to yesterday (the planned
// rows that posted in between were in scheduled_left that morning). Income and
// target are taken as today's, so earlier rooms are a close approximation.
// Only this month's days count (the ledger read is this month).
import { addDaysKey, parseLocalDateKey } from '@/lib/dates'
import { CONTROLLABLE } from '@/lib/controllable-categories'
import { UNTRENDED_TAGS } from '@/lib/summary/projection'
import type { SummaryResponse } from '@/lib/summary/types'

/** Share of the morning's cushion over target that the allowance holds back. */
export const RESERVE_SHARE = 0.2
/** Today turns 'tight' once less than this share of its allowance is left. */
export const TIGHT_SHARE = 0.25
/** A bill this close (days) becomes today's nudge. */
export const DUE_SOON_DAYS = 1

export type TodayState = 'ok' | 'tight' | 'over' | 'risk'

export interface TodayTransaction {
  transaction_date: string
  amount?: number | null
  amount_mxn?: number | null
  category_id?: string | null
  tags?: string[] | null
}

export interface TodayDay { date: string; spent: number; room: number; ok: boolean | null; today?: boolean }

export type TodayNudge =
  | { kind: 'due'; label: string; count: number; amount: number; date: string; days: number; url: string }
  | { kind: 'skip'; category: string; over_by: number; url: string }
  | { kind: 'easy'; category: string; left: number; days: number; url: string }
  | { kind: 'fits'; category: string; left: number; url: string }
  | { kind: 'ahead'; amount: number; url: string }
  | { kind: 'short'; amount: number; url: string }

export type TodayGoalRow =
  | { kind: 'west_month'; month: string; pct: number; buffer: number; url: string }
  | { kind: 'year'; year: number; pct: number; covered_pct: number | null; on_track: boolean; url: string }
  | { kind: 'west_home'; pct: number; months: number | null; url: string }
  | { kind: 'emergency'; pct: number; months: number; url: string }

export interface WidgetToday {
  date: string
  basis: 'goal'
  state: TodayState
  allowance: number
  spent: number
  left: number
  days_left: number
  /** Even split of what's left after today over the remaining days; null on the month's last day. */
  tomorrow: number | null
  /** The room before the reserve (can be negative). */
  pool: number
  reserve: number
  /** The month's usual remaining spend per day (projection), for the no-spend estimate. */
  usual: number
  goal: {
    label: 'WEST'
    month: string
    target: number
    projected: number
    pct: number
    /** projected − target: + ahead, − short. */
    buffer: number
    /** Where the month lands after a no-spend day. */
    no_spend_pct: number
    stretch_target: number | null
    stretch_pct: number | null
  }
  /** Finished days in a row this month at or under that day's room. */
  streak: number | null
  yesterday: { date: string; spent: number; room: number; diff: number } | null
  /** Up to 7 days ending today (this month only). */
  week: TodayDay[]
  nudge: TodayNudge | null
  goals: TodayGoalRow[]
}

export interface TodayInput {
  summary: Partial<SummaryResponse> & Pick<SummaryResponse, 'current_month'>
  /** This month's expense rows; null when the ledger read failed. */
  transactions: TodayTransaction[] | null
  /** The month's goal: west_plan.capacity_target, or the WEST plan's capacity. */
  target: number | null
  stretchTarget: number | null
  /** Upcoming outflows already grouped by date (payload.upcoming). */
  upcoming: Array<{ date: string; label: string; amount: number; count: number }>
  westFundedPct: number | null
  westMonthsToDelivery: number | null
}

const URL_BUDGETS = '/finance/budgets'
const URL_BILLS = '/finance/subscriptions'
const URL_WEST = '/finance/investments?tab=Real%20Estate'
const URL_GOALS = '/finance/goals'
const URL_HOME = '/finance'

const num = (n: unknown) => Number(n) || 0
const round = (n: number) => Math.round(num(n))
const floor10 = (n: number) => Math.max(0, Math.floor(n / 10) * 10)
const amountOf = (t: TodayTransaction) => num(t.amount_mxn || t.amount)
const isPlanned = (t: TodayTransaction) => Array.isArray(t.tags) && t.tags.some(tag => UNTRENDED_TAGS.includes(tag))
const pad2 = (n: number) => String(n).padStart(2, '0')

/** Next charge dates of a subscription inside [from, to] (weekly plans repeat). */
function chargeDates(next: string | null | undefined, frequency: string, from: string, to: string): string[] {
  let due = String(next || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return []
  const step = /^bi-?weekly$/i.test(frequency) ? 14 : /^weekly$/i.test(frequency) ? 7 : 0
  const out: string[] = []
  for (let guard = 0; guard < 6 && due <= to; guard++) {
    if (due >= from) out.push(due)
    if (!step) break
    due = addDaysKey(due, step)
  }
  return out
}

/** An MSI plan's charge this month: its end date's day of month, if still ahead and not past the end. */
function installmentDate(endDate: string, from: string, to: string): string | null {
  const end = String(endDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) return null
  const lastDay = Number(to.slice(8, 10))
  const key = `${from.slice(0, 7)}-${pad2(Math.min(Number(end.slice(8, 10)), lastDay))}`
  return key >= from && key <= to && key <= end ? key : null
}

/** Charges the plan knows about from `from` to month end that are not posted yet. */
export function scheduledLeft(summary: TodayInput['summary'], from: string, monthEnd: string): number {
  let total = 0
  for (const s of summary.subscriptions?.active || []) {
    total += chargeDates(s.next_charge ?? s.last_charge, s.frequency, from, monthEnd).length * Math.abs(num(s.amount))
  }
  for (const m of summary.installments?.active || []) {
    if (installmentDate(m.end_date, from, monthEnd)) total += Math.abs(num(m.monthly_payment))
  }
  total += num(summary.month_projection?.known_upcoming_treatment) + num(summary.month_projection?.known_upcoming_baby)
  return round(total)
}

/** Discretionary and planned spend per day of the month (index 0 = day 1). */
function spendByDay(transactions: TodayTransaction[], month: string, days: number) {
  const discretionary = new Array(days).fill(0) as number[]
  const planned = new Array(days).fill(0) as number[]
  for (const t of transactions) {
    const date = String(t.transaction_date || '')
    if (!date.startsWith(month)) continue
    const d = Number(date.slice(8, 10))
    if (!(d >= 1 && d <= days)) continue
    if (isPlanned(t)) planned[d - 1] += amountOf(t)
    else discretionary[d - 1] += amountOf(t)
  }
  return { discretionary: discretionary.map(round), planned: planned.map(round) }
}

function pickNudge(input: TodayInput, state: TodayState, allowance: number, daysLeft: number, today: string, buffer: number): TodayNudge | null {
  const { summary, upcoming } = input
  // A big bill tomorrow (or today) is today's job: keep the money in the account.
  const soon = upcoming.find(u => u.date >= today && u.date <= addDaysKey(today, DUE_SOON_DAYS) && u.amount >= Math.max(500, allowance))
  if (soon) {
    const days = Math.round((parseLocalDateKey(soon.date).getTime() - parseLocalDateKey(today).getTime()) / 86400000)
    return { kind: 'due', label: soon.label, count: soon.count, amount: round(soon.amount), date: soon.date, days, url: URL_BILLS }
  }
  const rows = (summary.current_month.budget_vs_actual || [])
    .filter(b => CONTROLLABLE.has(b.category) && !b.is_non_monthly && num(b.budget) > 0)
    .map(b => ({ name: b.category, left: round(num(b.budget) - num(b.spent)), budget: num(b.budget) }))
  const worst = rows.filter(r => r.left < 0).sort((a, b) => a.left - b.left)[0]
  if (worst) return { kind: 'skip', category: worst.name, over_by: -worst.left, url: URL_BUDGETS }
  const tight = rows.filter(r => r.left > 0 && r.left < r.budget * TIGHT_SHARE).sort((a, b) => a.left / a.budget - b.left / b.budget)[0]
  if (tight) return { kind: 'easy', category: tight.name, left: tight.left, days: daysLeft, url: URL_BUDGETS }
  if (state === 'ok') {
    const roomy = rows.filter(r => r.left >= Math.max(allowance, 1)).sort((a, b) => b.left - a.left)[0]
    if (roomy) return { kind: 'fits', category: roomy.name, left: roomy.left, url: URL_BUDGETS }
  }
  if (buffer >= 0) return { kind: 'ahead', amount: round(buffer), url: URL_WEST }
  return { kind: 'short', amount: round(-buffer), url: URL_WEST }
}

function goalRows(input: TodayInput, month: string, pct: number, buffer: number): TodayGoalRow[] {
  const { summary } = input
  const rows: TodayGoalRow[] = [{ kind: 'west_month', month, pct, buffer: round(buffer), url: URL_WEST }]
  // One line for the year-end goals (never their monthly needs next to the
  // WEST target: they are the same GBM pesos, and adding them double-counts).
  const plan = (summary.year_end_goal_plan || {}) as Record<string, unknown>
  const goalTarget = num(plan.target_amount)
  if (goalTarget > 0) {
    const needed = num(plan.total_needed_by_december)
    rows.push({
      kind: 'year',
      year: num(plan.target_year) || Number(month.slice(0, 4)),
      pct: Math.round((num(plan.current_saved) / goalTarget) * 100),
      covered_pct: needed > 0 ? Math.min(100, Math.round((num(plan.projected_free_cash_by_december) / needed) * 100)) : null,
      on_track: plan.on_track === true,
      url: URL_GOALS,
    })
  }
  if (input.westFundedPct != null) rows.push({ kind: 'west_home', pct: input.westFundedPct, months: input.westMonthsToDelivery, url: URL_WEST })
  const ef = summary.emergency_fund
  if (ef && Number.isFinite(ef.funded_pct)) rows.push({ kind: 'emergency', pct: num(ef.funded_pct), months: num(ef.months_covered), url: URL_HOME })
  return rows
}

/** payload.today, or null when the month has no goal or projection to measure against. */
export function buildToday(input: TodayInput): WidgetToday | null {
  const { summary, target } = input
  const cm = summary.current_month
  const mp = summary.month_projection
  if (!mp || !target || !(target > 0)) return null
  const daysIn = num(cm.days_in_month) || 30
  const day = Math.min(daysIn, Math.max(1, num(cm.day_of_month) || 1))
  const month = cm.month
  const today = `${month}-${pad2(day)}`
  const monthEnd = `${month}-${pad2(daysIn)}`
  const daysLeft = daysIn - day + 1

  const series = input.transactions ? spendByDay(input.transactions, month, day) : null
  const spentToday = series ? series.discretionary[day - 1] : 0
  const plannedToday = series ? series.planned[day - 1] : 0
  const spentBefore = num(mp.spent_so_far) - spentToday - plannedToday
  const scheduledFuture = scheduledLeft(summary, today, monthEnd)
  const scheduled = scheduledFuture + plannedToday
  const projected = num(mp.projected_savings)

  const pool = round(num(mp.expected_income) - target - spentBefore - scheduled)
  const cushion = projected + spentToday - target
  const reserve = round(RESERVE_SHARE * Math.max(0, cushion))
  const room = pool - reserve
  const allowance = room > 0 ? floor10(room / daysLeft) : 0
  const left = allowance - spentToday
  const state: TodayState = room <= 0 ? 'risk' : spentToday > allowance ? 'over' : left < allowance * TIGHT_SHARE ? 'tight' : 'ok'
  const tomorrow = daysLeft > 1 ? floor10((room - spentToday) / (daysLeft - 1)) : null

  // What a no-spend day adds: one day of the spend the projection still expects.
  const usual = Math.max(0, num(mp.projected_spend) - num(mp.spent_so_far) - scheduledFuture) / daysLeft
  const pct = Math.round((projected / target) * 100)
  const buffer = projected - target

  const week: TodayDay[] = []
  let streak: number | null = null
  let yesterday: WidgetToday['yesterday'] = null
  if (series) {
    // Morning room of each earlier day, newest first.
    const rooms: number[] = new Array(day).fill(0)
    rooms[day - 1] = allowance
    let poolD = pool
    for (let d = day - 1; d >= 1; d--) {
      poolD += series.discretionary[d - 1]
      rooms[d - 1] = floor10((poolD - reserve) / (daysIn - d + 1))
    }
    const okOn = (d: number) => series.discretionary[d - 1] <= rooms[d - 1]
    streak = 0
    for (let d = day - 1; d >= 1 && okOn(d); d--) streak++
    for (let d = Math.max(1, day - 6); d <= day; d++) {
      const isToday = d === day
      week.push({ date: `${month}-${pad2(d)}`, spent: series.discretionary[d - 1], room: rooms[d - 1], ok: isToday ? null : okOn(d), ...(isToday ? { today: true } : {}) })
    }
    if (day > 1) {
      const d = day - 1
      yesterday = { date: `${month}-${pad2(d)}`, spent: series.discretionary[d - 1], room: rooms[d - 1], diff: rooms[d - 1] - series.discretionary[d - 1] }
    }
  }

  const stretch = input.stretchTarget && input.stretchTarget > 0 ? round(input.stretchTarget) : null
  return {
    date: today,
    basis: 'goal',
    state,
    allowance,
    spent: spentToday,
    left,
    days_left: daysLeft,
    tomorrow,
    pool,
    reserve,
    usual: round(usual),
    goal: {
      label: 'WEST',
      month,
      target: round(target),
      projected: round(projected),
      pct,
      buffer: round(buffer),
      no_spend_pct: Math.round(((projected + usual) / target) * 100),
      stretch_target: stretch,
      stretch_pct: stretch ? Math.round((projected / stretch) * 100) : null,
    },
    streak,
    yesterday,
    week,
    nudge: pickNudge(input, state, allowance, daysLeft, today, buffer),
    goals: goalRows(input, month, pct, buffer),
  }
}
