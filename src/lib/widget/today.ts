// The widget's daily plan (payload.today, v3): what today's everyday spending
// can take while the month's WEST savings target (the capacity target, not the
// stretch target and not the 2026 goals) stays on target.
//
// Pure: buildWidgetPayload() hands in the summary, this month's expense rows
// and the category names. The phone writes every sentence itself (EN/ES) from
// the kinds and numbers here, so nothing in this block is pre-worded.
//
// ── Definition (all MXN, Mexico City dates) ──
//   today's spend ("spent") = expense rows dated today in an everyday
//       (controllable) category, minus the planned tags (auto-recurring,
//       auto-msi, fertility, baby). The same set as payload.daily_spend, so
//       fixed bills, utilities and savings transfers never count as the day's spend.
//   days_left  = days_in_month − day + 1                         (today included)
//   pool       = expected_income − target − (spent_so_far − spent) − committed
//     target    = west_plan.capacity_target (the month's WEST savings target)
//     committed = what the rest of the month still owes outside the everyday
//                 categories: the larger of
//                   scheduled_left — every subscription occurrence due this month
//                     that has not posted (overdue ones too: the processor may be
//                     behind), MSI payments until the processor has posted this
//                     month's (any auto-msi row this month), and the treatment
//                     and baby events still owed; and
//                   fixed_left — the non-everyday budget rows' projected month
//                     total minus what they have spent (Maintenance, Electricity…).
//                 Never their sum: subscriptions sit inside those budget rows.
//   reserve    = RESERVE_SHARE × max(0, pool − everyday budgets left this morning)
//                (the cushion over target if the everyday budgets are used as
//                planned; budgets left is signed like `variable` and floored at
//                0 in total, so with the budgets spent the whole pool is cushion.
//                Every input is fixed for the day, so the allowance doesn't
//                drift as the day's spending comes in)
//   room       = pool − reserve
//   allowance  = max(0, floor(room / days_left / 10) × 10)
//   left       = allowance − spent
//
// A planned bill posting today moves the same amount from `committed` into
// spent_so_far, so the pool holds. Spend outside the everyday categories that
// no plan expected (an unbudgeted lump) lowers the pool once it posts.
// Spending exactly the allowance every remaining day lands the month at
// target + reserve.
//
// state: 'risk' when room ≤ 0 (even a no-spend day leaves the target short),
// 'over' when spent > allowance, 'tight' when under TIGHT_SHARE of the
// allowance is left, else 'ok'.
//
// Past days (week, streak, yesterday) rebuild that morning's pool from today's:
// pool(d) = pool(today) + everyday spend from d to yesterday. Income, target
// and the reserve are taken as today's, so earlier rooms are a close
// approximation. Only this month's days count (the ledger read is this month).
//
// Returns null without a target or projection, or when the ledger or category
// read failed: without them today's spend is unknown, and a full-looking
// allowance would quietly shrink as the day's purchases land in spent_so_far.
import { addDaysKey, addMonthsKey, parseLocalDateKey } from '@/lib/dates'
import { CONTROLLABLE } from '@/lib/controllable-categories'
import { UNTRENDED_TAGS } from '@/lib/summary/projection'
import type { SummaryResponse } from '@/lib/summary/types'

/** Share of the morning's cushion over target that the allowance holds back. */
export const RESERVE_SHARE = 0.2
/** Today turns 'tight' once less than this share of its allowance is left. */
export const TIGHT_SHARE = 0.25
/** A bill this close (days) becomes today's nudge. */
export const DUE_SOON_DAYS = 1
/** On a no-spend day, the next bill within this many days is the nudge. */
export const DUE_WEEK_DAYS = 7

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
  | { kind: 'year'; year: number; amount: number; url: string }

export type TodayGoalRow =
  | { kind: 'west_month'; month: string; pct: number; buffer: number; room: number; days_left: number; url: string }
  | { kind: 'year'; year: number; pct: number; covered_pct: number | null; on_track: boolean; shortfall: number; monthly_extra: number; url: string }
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
  /** pool − reserve: what the days left can spend (allowance ≈ room ÷ days_left). */
  room: number
  /** What the rest of the month still owes outside the everyday categories. */
  committed: number
  /** The month's usual remaining everyday spend per day (projection), for the no-spend estimate. */
  usual: number
  goal: {
    label: 'WEST'
    /** Which WEST figure `target` is: the month's capacity target. */
    basis: 'capacity'
    month: string
    target: number
    projected: number
    /** Forecast at the usual pace (projected ÷ target). */
    pct: number
    /** projected − target at the usual pace: + ahead, − short. */
    buffer: number
    /** Where the month lands if every day spends exactly its allowance (target + reserve). */
    plan_pct: number
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
  /** category_id → name, to tell everyday spend from bills and savings moves. */
  categoryNames: Map<string, string> | Record<string, string>
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
const hasTag = (t: TodayTransaction, ...tags: string[]) => Array.isArray(t.tags) && t.tags.some(tag => tags.includes(tag))
const isPlanned = (t: TodayTransaction) => hasTag(t, ...UNTRENDED_TAGS)
const pad2 = (n: number) => String(n).padStart(2, '0')
const daysBetween = (a: string, b: string) => Math.round((parseLocalDateKey(b).getTime() - parseLocalDateKey(a).getTime()) / 86400000)

function lookup(names: TodayInput['categoryNames'], id: string | null | undefined): string | undefined {
  if (!id) return undefined
  return names instanceof Map ? names.get(id) : names[id]
}
const namesSize = (names: TodayInput['categoryNames']) => (names instanceof Map ? names.size : Object.keys(names || {}).length)

/** Months between charges for month-based plans; weekly plans are handled in days. */
const MONTH_STEP: Record<string, number> = {
  monthly: 1, bimonthly: 2, quarterly: 3, 'semi-annual': 6, semiannual: 6, yearly: 12, annual: 12,
}

/**
 * Unposted charge dates of a subscription inside this month. `next` is the
 * next charge the processor has not posted yet, so an occurrence dated before
 * today is overdue (the processor is behind), not paid: it still counts.
 */
function chargeDates(next: string | null | undefined, frequency: string, monthStart: string, monthEnd: string): string[] {
  let due = String(next || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return []
  const f = String(frequency || '').toLowerCase()
  const days = /^bi-?weekly$/.test(f) ? 14 : /^weekly$/.test(f) ? 7 : 0
  const months = days ? 0 : MONTH_STEP[f] || 1
  const dueDay = Number(due.slice(8, 10))
  const out: string[] = []
  for (let guard = 0; guard < 60 && due <= monthEnd; guard++) {
    if (due >= monthStart) out.push(due)
    if (days) due = addDaysKey(due, days)
    else {
      const m = addMonthsKey(due.slice(0, 7), months)
      const last = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate()
      due = `${m}-${pad2(Math.min(dueDay, last))}`
    }
  }
  return out
}

/**
 * Charges the plan knows about this month that have not posted yet.
 * MSI: the processor posts every active plan's payment for the month on its
 * first run (dated today when the due day is still ahead), so they are pending
 * only until this month's first auto-msi row exists.
 */
export function scheduledLeft(summary: TodayInput['summary'], monthStart: string, monthEnd: string, msiPosted: boolean): number {
  let total = 0
  for (const s of summary.subscriptions?.active || []) {
    total += chargeDates(s.next_charge ?? s.last_charge, s.frequency, monthStart, monthEnd).length * Math.abs(num(s.amount))
  }
  if (!msiPosted) {
    for (const m of summary.installments?.active || []) {
      if (String(m.end_date || '').slice(0, 10) >= monthStart) total += Math.abs(num(m.monthly_payment))
    }
  }
  total += num(summary.month_projection?.known_upcoming_treatment) + num(summary.month_projection?.known_upcoming_baby)
  return round(total)
}

/**
 * Still to come in the budget rows outside the everyday categories (fixed
 * bills, utilities, non-monthly cycles): the projection's expected remaining.
 * Savings-type categories are not budget rows (the summary moves them out).
 */
export function fixedLeft(summary: TodayInput['summary']): number {
  return round((summary.current_month.budget_vs_actual || [])
    .filter(b => !CONTROLLABLE.has(b.category))
    .reduce((s, b) => s + Math.max(0, b.expected_remaining ?? num(b.projected_month_total ?? b.budget) - num(b.spent)), 0))
}

/** Everyday (controllable, untagged) spend per day of the month (index 0 = day 1), plus today's by category. */
function everydayByDay(transactions: TodayTransaction[], names: TodayInput['categoryNames'], month: string, days: number) {
  const perDay = new Array(days).fill(0) as number[]
  const todayByCategory = new Map<string, number>()
  for (const t of transactions) {
    const date = String(t.transaction_date || '')
    if (!date.startsWith(month) || isPlanned(t)) continue
    const name = lookup(names, t.category_id)
    if (!name || !CONTROLLABLE.has(name)) continue
    const d = Number(date.slice(8, 10))
    if (!(d >= 1 && d <= days)) continue
    perDay[d - 1] += amountOf(t)
    if (d === days) todayByCategory.set(name, (todayByCategory.get(name) || 0) + amountOf(t))
  }
  return { perDay: perDay.map(round), todayByCategory }
}

function pickNudge(input: TodayInput, state: TodayState, allowance: number, daysLeft: number, today: string, buffer: number, year: TodayGoalRow | undefined): TodayNudge | null {
  const { summary, upcoming } = input
  const dueNudge = (u: TodayInput['upcoming'][number]): TodayNudge =>
    ({ kind: 'due', label: u.label, count: u.count, amount: round(u.amount), date: u.date, days: daysBetween(today, u.date), url: URL_BILLS })
  // A no-spend day already says "spend nothing": the nudge is the next bill to keep the money for.
  if (state === 'risk') {
    const next = upcoming.find(u => u.date >= today && u.date <= addDaysKey(today, DUE_WEEK_DAYS) && u.amount >= 500)
    return next ? dueNudge(next) : null
  }
  // A big bill tomorrow (or today) is today's job: keep the money in the account.
  const soon = upcoming.find(u => u.date >= today && u.date <= addDaysKey(today, DUE_SOON_DAYS) && u.amount >= Math.max(500, allowance))
  if (soon) return dueNudge(soon)
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
  if (buffer < 0) return { kind: 'short', amount: round(-buffer), url: URL_WEST }
  // The month is fine; when the year's goals are not, say where today's savings go.
  if (year && year.kind === 'year' && !year.on_track && year.shortfall > 0) return { kind: 'year', year: year.year, amount: year.shortfall, url: URL_GOALS }
  return { kind: 'ahead', amount: round(buffer), url: URL_WEST }
}

function goalRows(input: TodayInput, month: string, pct: number, buffer: number, room: number, daysLeft: number): TodayGoalRow[] {
  const { summary } = input
  const rows: TodayGoalRow[] = [{ kind: 'west_month', month, pct, buffer: round(buffer), room: round(Math.max(0, room)), days_left: daysLeft, url: URL_WEST }]
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
      shortfall: round(num(plan.shortfall_by_december)),
      monthly_extra: round(num(plan.monthly_extra_needed)),
      url: URL_GOALS,
    })
  }
  if (input.westFundedPct != null) rows.push({ kind: 'west_home', pct: input.westFundedPct, months: input.westMonthsToDelivery, url: URL_WEST })
  const ef = summary.emergency_fund
  if (ef && Number.isFinite(ef.funded_pct)) rows.push({ kind: 'emergency', pct: num(ef.funded_pct), months: num(ef.months_covered), url: URL_HOME })
  return rows
}

/** payload.today, or null when there is no goal or projection to measure against, or the ledger read failed. */
export function buildToday(input: TodayInput): WidgetToday | null {
  const { summary, target, transactions } = input
  const cm = summary.current_month
  const mp = summary.month_projection
  if (!mp || !target || !(target > 0)) return null
  if (!transactions || !namesSize(input.categoryNames)) return null
  const daysIn = num(cm.days_in_month) || 30
  const day = Math.min(daysIn, Math.max(1, num(cm.day_of_month) || 1))
  const month = cm.month
  const today = `${month}-${pad2(day)}`
  const monthStart = `${month}-01`
  const monthEnd = `${month}-${pad2(daysIn)}`
  const daysLeft = daysIn - day + 1

  const series = everydayByDay(transactions, input.categoryNames, month, day)
  const spentToday = series.perDay[day - 1]
  const msiPosted = transactions.some(t => String(t.transaction_date || '').startsWith(month) && hasTag(t, 'auto-msi'))
  const scheduled = scheduledLeft(summary, monthStart, monthEnd, msiPosted)
  const committed = Math.max(scheduled, fixedLeft(summary))
  const projected = num(mp.projected_savings)

  const pool = round(num(mp.expected_income) - target - (num(mp.spent_so_far) - spentToday) - committed)
  // The everyday budgets still unspent this morning, signed like `variable`
  // (an overrun in one category eats the others' room).
  const budgetLeft = Math.max(0, (cm.budget_vs_actual || [])
    .filter(b => CONTROLLABLE.has(b.category) && !b.is_non_monthly)
    .reduce((s, b) => s + num(b.budget) - (num(b.spent) - (series.todayByCategory.get(b.category) || 0)), 0))
  const reserve = round(RESERVE_SHARE * Math.max(0, pool - budgetLeft))
  const room = pool - reserve
  const allowance = room > 0 ? floor10(room / daysLeft) : 0
  const left = allowance - spentToday
  const state: TodayState = room <= 0 ? 'risk' : spentToday > allowance ? 'over' : left < allowance * TIGHT_SHARE ? 'tight' : 'ok'
  const tomorrow = daysLeft > 1 ? floor10((room - spentToday) / (daysLeft - 1)) : null

  // What a no-spend day adds: one day of the everyday spend the projection still expects.
  const usual = Math.max(0, num(mp.projected_spend) - num(mp.spent_so_far) - committed) / daysLeft
  const pct = Math.round((projected / target) * 100)
  const buffer = projected - target

  // Morning room of each earlier day, newest first.
  const rooms: number[] = new Array(day).fill(0)
  rooms[day - 1] = allowance
  let poolD = pool
  for (let d = day - 1; d >= 1; d--) {
    poolD += series.perDay[d - 1]
    rooms[d - 1] = floor10((poolD - reserve) / (daysIn - d + 1))
  }
  const okOn = (d: number) => series.perDay[d - 1] <= rooms[d - 1]
  let streak = 0
  for (let d = day - 1; d >= 1 && okOn(d); d--) streak++
  const week: TodayDay[] = []
  for (let d = Math.max(1, day - 6); d <= day; d++) {
    const isToday = d === day
    week.push({ date: `${month}-${pad2(d)}`, spent: series.perDay[d - 1], room: rooms[d - 1], ok: isToday ? null : okOn(d), ...(isToday ? { today: true } : {}) })
  }
  const yesterday: WidgetToday['yesterday'] = day > 1
    ? { date: `${month}-${pad2(day - 1)}`, spent: series.perDay[day - 2], room: rooms[day - 2], diff: rooms[day - 2] - series.perDay[day - 2] }
    : null

  const stretch = input.stretchTarget && input.stretchTarget > 0 ? round(input.stretchTarget) : null
  const goals = goalRows(input, month, pct, buffer, room, daysLeft)
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
    room,
    committed,
    usual: round(usual),
    goal: {
      label: 'WEST',
      basis: 'capacity',
      month,
      target: round(target),
      projected: round(projected),
      pct,
      buffer: round(buffer),
      plan_pct: Math.round(((target + Math.max(0, room > 0 ? reserve : 0)) / target) * 100),
      no_spend_pct: Math.round(((projected + usual) / target) * 100),
      stretch_target: stretch,
      stretch_pct: stretch ? Math.round((projected / stretch) * 100) : null,
    },
    streak,
    yesterday,
    week,
    nudge: pickNudge(input, state, allowance, daysLeft, today, buffer, goals.find(g => g.kind === 'year')),
    goals,
  }
}
