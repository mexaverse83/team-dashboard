// Phone widget payload, v2 (W1, W3–W5, W13, W14, O1, O2, O4).
//
// Pure: the route does the I/O (summary, WEST projection, insights cache,
// this month's transactions) and hands the results here. Every v2 field is
// derived from the same numbers the dashboard shows; the legacy v1 fields stay
// for one release because phones run whatever widget code was last cached.
import { calculateDailyPlan } from '@/lib/daily-plan'
import { controllableBudgetRows, CONTROLLABLE } from '@/lib/controllable-categories'
import { addDaysKey, mexicoCityDateParts, parseLocalDateKey } from '@/lib/dates'
import { buildDeterministicBrief, type BriefSummary } from '@/lib/deterministic-brief'
import { formatMoney } from '@/lib/format'
import { isInsightUsable } from '@/lib/insight-freshness'
import type { SummaryResponse, SummaryUpcomingItem, SummaryVariable } from '@/lib/summary/types'
import { buildToday, type WidgetToday } from '@/lib/widget/today'

export type { WidgetToday } from '@/lib/widget/today'

export const WIDGET_PAYLOAD_VERSION = 2
export const UPCOMING_WINDOW_DAYS = 14
export const UPCOMING_MAX = 3
/** Status turns 'tight' once less than this share of the everyday budget is left. */
export const TIGHT_RATIO = 0.1

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS_ES = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export interface WidgetInsight { type?: string; icon?: string; title: string; detail?: string; priority?: string; category?: string }
export interface WidgetInsightsCache { generated_at: string | null; period_month?: string | null; insights: WidgetInsight[] }
export interface WidgetTransaction { transaction_date: string; amount?: number | null; amount_mxn?: number | null; category_id?: string | null; tags?: string[] | null }

/** The parts of the WEST projection the widget reads. */
export interface WidgetWestInput {
  target?: number
  months_to_delivery?: number
  projected_at_delivery?: { total_projected?: number } | null
  savings_plan?: { months?: Array<{ month: string; target: number; capacity?: number }> } | null
}

export interface WidgetPayloadInput {
  summary: Partial<SummaryResponse> & Pick<SummaryResponse, 'current_month'>
  west: WidgetWestInput | null
  insights: WidgetInsightsCache | null
  /** This month's expense rows (any category; filtered here). */
  transactions: WidgetTransaction[] | null
  /** category_id → name, to keep only controllable categories. */
  categoryNames: Map<string, string> | Record<string, string>
  now?: Date
}

export type WidgetStatus = 'ok' | 'tight' | 'over'
export type WestTone = 'good' | 'warn'

export interface WidgetUpcoming { date: string; label: string; amount: number; count: number; kind: SummaryUpcomingItem['kind'] }

/** `through_date` (YYYY-MM-DD) lets the phone format the period end in its own language. */
export type WidgetVariable = SummaryVariable & { through_date: string | null }

export interface WidgetPayloadV2 {
  v: 2
  updated_at: string
  month: string
  day: number
  days_in_month: number
  variable: WidgetVariable
  status: WidgetStatus
  top_over: { name: string; pct: number; over_by: number } | null
  budget_pace: Array<{ name: string; spent: number; budget: number; pct: number; left: number }>
  daily_spend: number[]
  daily_budget_pace: number
  west_month: { label: string; month: string; target: number; projected_savings: number; gap: number; pct: number; tone: WestTone; surplus_so_far: number; stretch_target?: number | null } | null
  upcoming: WidgetUpcoming[]
  milestones: { baby_months: number | null; west_funded_pct: number | null; west_months_to_delivery: number | null }
  coach: { title: string; url: string; question: string; rule: string; tone: string }
  coach_es: { title: string; url: string; question: string }
  brief: { fresh: boolean; generated_at: string | null; title: string | null; detail: string | null }
  /** v3 daily plan (see src/lib/widget/today.ts); null when there is no month goal to measure against. */
  today: WidgetToday | null
  [legacy: string]: unknown
}

/** Shorten on a word boundary, never mid-word (W14). */
export function truncateWords(text: string | null | undefined, max: number): string {
  const s = String(text || '').trim().replace(/\s+/g, ' ')
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return (space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-—–]+$/, '') + '…'
}

/** 'Sat Oct 31' from a YYYY-MM-DD key. */
export function throughLabel(dateKey: string): string {
  const d = parseLocalDateKey(dateKey)
  return `${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** YYYY-MM-DD for a 'Sat Oct 31' label, in the year that keeps it nearest to today. */
export function throughDateKey(label: string | null | undefined, today: string): string | null {
  const m = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(String(label || ''))
  if (!m) return null
  const month = MONTHS.findIndex(x => x.toLowerCase() === m[1].slice(0, 3).toLowerCase()) + 1
  const [ty, tm] = today.split('-').map(Number)
  const year = month < tm - 6 ? ty + 1 : month > tm + 6 ? ty - 1 : ty
  return `${year}-${String(month).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`
}

function lookup(names: WidgetPayloadInput['categoryNames'], id: string | null | undefined): string | undefined {
  if (!id) return undefined
  return names instanceof Map ? names.get(id) : names[id]
}

const round = (n: number) => Math.round(Number(n) || 0)

export function variableStatus(left: number, budget: number): WidgetStatus {
  if (left < 0) return 'over'
  if (budget > 0 && left < budget * TIGHT_RATIO) return 'tight'
  return 'ok'
}

/** Signed everyday-budget room through month end (W3). Uses the summary's own `variable` once WS4 provides it. */
export function deriveVariable(summary: WidgetPayloadInput['summary'], today?: string): WidgetVariable {
  const cm = summary.current_month
  if (summary.variable && Number.isFinite(summary.variable.left)) {
    const v = summary.variable as SummaryVariable & { through_date?: string | null }
    const day = String(cm.day_of_month || 1).padStart(2, '0')
    return {
      ...v,
      status: v.status || variableStatus(v.left, v.budget),
      through_date: v.through_date || throughDateKey(v.through_label, today || `${cm.month}-${day}`),
    }
  }
  const rows = controllableBudgetRows(cm.budget_vs_actual || [])
  const budget = round(rows.reduce((s, b) => s + (Number(b.budget) || 0), 0))
  const spent = round(rows.reduce((s, b) => s + (Number(b.spent) || 0), 0))
  const left = budget - spent
  const daysIn = Number(cm.days_in_month) || 30
  const day = Math.min(daysIn, Math.max(1, Number(cm.day_of_month) || 1))
  const end = `${cm.month}-${String(daysIn).padStart(2, '0')}`
  return {
    budget,
    spent,
    left,
    days_left: daysIn - day + 1,
    through_label: throughLabel(end),
    status: variableStatus(left, budget),
    through_date: end,
  }
}

function throughLabelEs(dateKey: string): string {
  const d = parseLocalDateKey(dateKey)
  return `${WEEKDAYS_ES[d.getDay()]} ${d.getDate()} ${MONTHS_ES[d.getMonth()]}`
}

/**
 * The brief's on-plan line speaks of "this week"; the widget hero is the
 * `variable` period, so reword it to the same period end (never "Sunday"
 * next to "thru Sat Oct 31").
 */
function coachTitle(directive: { title: string; rule: string }, v: WidgetVariable, lang: 'en' | 'es'): string {
  if (directive.rule !== 'on-plan') return directive.title
  const end = v.through_date ? (lang === 'es' ? throughLabelEs(v.through_date) : throughLabel(v.through_date)) : v.through_label
  // Budget wording: on the widget "plan" means only the WEST savings plan.
  if (v.left < 0) return lang === 'es' ? `Excedido — ${formatMoney(-v.left)} arriba` : `Over budget — ${formatMoney(-v.left)} over`
  const perDay = formatMoney(v.left / Math.max(1, v.days_left))
  return lang === 'es' ? `En presupuesto — ${perDay}/día hasta ${end}` : `Within budget — ${perDay}/day thru ${end}`
}

/** Per-day controllable spend for days 1..today, bucketed by the stored (Mexico City) date (O1). */
export function dailySpendSeries(
  transactions: WidgetTransaction[] | null,
  categoryNames: WidgetPayloadInput['categoryNames'],
  month: string,
  day: number,
  /** Restrict to these category names (the budget rows behind `variable`), so the line ends at variable.spent. */
  only: ReadonlySet<string> = CONTROLLABLE,
): number[] {
  const out = new Array(Math.max(1, day)).fill(0) as number[]
  for (const t of transactions || []) {
    const date = String(t.transaction_date || '')
    if (!date.startsWith(month)) continue
    if (!only.has(lookup(categoryNames, t.category_id) || '')) continue
    const d = Number(date.slice(8, 10))
    if (!(d >= 1 && d <= out.length)) continue
    out[d - 1] += Number(t.amount_mxn || t.amount) || 0
  }
  return out.map(round)
}

/** Next installment date: the end date's day of month, this month or next, never past the end. */
function nextInstallmentDate(endDate: string, today: string): string | null {
  const end = String(endDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || end < today) return null
  const payDay = Number(end.slice(8, 10))
  const [y, m] = today.split('-').map(Number)
  for (let i = 0; i < 2; i++) {
    const year = y + Math.floor((m - 1 + i) / 12)
    const month = ((m - 1 + i) % 12) + 1
    const last = new Date(year, month, 0).getDate()
    const key = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(payDay, last)).padStart(2, '0')}`
    if (key >= today && key <= end) return key
  }
  return null
}

/** Outflows in the next 14 days, grouped by date, biggest first within a day (O2). */
export function buildUpcoming(summary: WidgetPayloadInput['summary'], today: string): WidgetUpcoming[] {
  const horizon = addDaysKey(today, UPCOMING_WINDOW_DAYS)
  const items: SummaryUpcomingItem[] = []
  if (Array.isArray(summary.upcoming)) {
    items.push(...summary.upcoming.filter(u => u.kind !== 'income'))
  } else {
    for (const s of summary.subscriptions?.active || []) {
      if (s.last_charge) items.push({ date: String(s.last_charge).slice(0, 10), label: s.name, amount: Number(s.amount) || 0, kind: 'bill' })
    }
    for (const m of summary.installments?.active || summary.msi_timeline || []) {
      const date = nextInstallmentDate(m.end_date, today)
      if (date) items.push({ date, label: m.name, amount: Number(m.monthly_payment) || 0, kind: 'msi' })
    }
  }
  const byDate = new Map<string, SummaryUpcomingItem[]>()
  for (const it of items) {
    const date = String(it.date || '').slice(0, 10)
    if (!(date >= today && date <= horizon) || !(Number(it.amount) > 0)) continue
    // The summary may pre-group a day ("Rent + 7 more", items/count): keep the
    // first name and the real count so the widget renders a localised "+N more".
    const label = it.items?.length ? String(it.items[0]) : it.label
    const count = Math.max(1, Number(it.count) || it.items?.length || 1)
    byDate.set(date, [...(byDate.get(date) || []), { ...it, date, label, count }])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, UPCOMING_MAX)
    .map(([date, group]) => {
      const sorted = [...group].sort((a, b) => Number(b.amount) - Number(a.amount))
      return {
        date,
        label: sorted[0].label,
        amount: round(sorted.reduce((s, g) => s + (Number(g.amount) || 0), 0)),
        count: sorted.reduce((n, g) => n + (g.count || 1), 0),
        kind: sorted[0].kind,
      }
    })
}

export function westTone(pct: number): WestTone {
  // projected_savings is already a month-end forecast, so this is never a
  // to-date pace and never scolding red (W5 corrected).
  return pct >= 100 ? 'good' : 'warn'
}

function usableBrief(insights: WidgetInsightsCache | null, now: Date) {
  const generatedAt = insights?.generated_at || null
  const fresh = !!insights && isInsightUsable(generatedAt, { now, category: 'WIDGET', periodMonth: insights.period_month })
  const pick = fresh ? (insights!.insights || []).find(i => String(i.category || '').toUpperCase() === 'WIDGET') : undefined
  return {
    fresh: fresh && !!pick,
    generated_at: generatedAt,
    title: pick ? truncateWords(pick.title, 90) : null,
    detail: pick ? truncateWords(pick.detail, 160) : null,
    all: fresh ? insights!.insights || [] : [],
  }
}

function legacyDailyPlan(summary: WidgetPayloadInput['summary'], westTarget: number | null, weekday: number) {
  try {
    return calculateDailyPlan(summary as Parameters<typeof calculateDailyPlan>[0], westTarget, weekday)
  } catch {
    return { safe_to_spend_day: 0 }
  }
}

export function buildWidgetPayload(input: WidgetPayloadInput): WidgetPayloadV2 {
  const now = input.now || new Date()
  const { summary, west } = input
  const cm = summary.current_month
  const mx = mexicoCityDateParts(now)
  const today = `${mx.year}-${String(mx.month).padStart(2, '0')}-${String(mx.day).padStart(2, '0')}`
  const month = cm.month
  const daysInMonth = Number(cm.days_in_month) || 30
  const day = Math.min(daysInMonth, Math.max(1, Number(cm.day_of_month) || mx.day))

  const variable = deriveVariable(summary, today)
  const ctrl = controllableBudgetRows(cm.budget_vs_actual || [])
  const pace = ctrl
    .map(b => {
      const spent = round(b.spent), budget = round(b.budget)
      return { name: b.category, spent, budget, pct: budget > 0 ? Math.round((spent / budget) * 100) : 0, left: budget - spent }
    })
    .sort((a, b) => b.pct - a.pct)
  const worst = pace.find(p => p.budget > 0 && p.spent > p.budget)

  const projected = Number(summary.month_projection?.projected_savings) || 0
  const planMonth = west?.savings_plan?.months?.find(m => m.month === month)
  // The bar measures against capacity, like home's month-projection card
  // (UX-03/W5): the stretch target is only a marker.
  const target = summary.west_plan?.capacity_target ?? planMonth?.capacity ?? summary.west_plan?.month_target ?? planMonth?.target ?? null
  const stretch = summary.west_plan?.month_target ?? planMonth?.target ?? null
  const westPct = target && target > 0 ? Math.min(999, Math.max(0, Math.round((projected / target) * 100))) : 0
  const funded = summary.west_plan?.funded_pct
    ?? (west?.target ? Math.round(((west.projected_at_delivery?.total_projected || 0) / west.target) * 1000) / 10 : null)

  // Same period as the hero: the brief reads `variable` instead of prorating its own week.
  const briefSummary = { ...summary, variable } as unknown as BriefSummary
  const coachEn = buildDeterministicBrief(briefSummary, { now, lang: 'en' })
  const coachEs = buildDeterministicBrief(briefSummary, { now, lang: 'es' })
  const coachEnTitle = coachTitle(coachEn.directive, variable, 'en')
  const coachEsTitle = coachTitle(coachEs.directive, variable, 'es')
  const brief = usableBrief(input.insights, now)

  const upcoming = buildUpcoming(summary, today)
  const westMonthsToDelivery = summary.west_plan?.months_to_delivery ?? west?.months_to_delivery ?? null
  const todayPlan = buildToday({
    summary,
    transactions: input.transactions,
    categoryNames: input.categoryNames,
    target,
    stretchTarget: stretch,
    upcoming,
    westFundedPct: funded,
    westMonthsToDelivery,
  })

  // ── legacy (v1) fields, kept one release ──
  const goalNeed = Number(summary.goal_funding?.total_monthly_needed) || 0
  const findCat = (c: string) => brief.all.find(i => String(i.category || '').toUpperCase() === c)
  const legacyTrim = (i: WidgetInsight | undefined, len = 140) => i ? { icon: i.icon || '', title: i.title, detail: truncateWords(i.detail, len) } : null
  const weekItems = brief.all.filter(i => String(i.category || '').toUpperCase() === 'WEEK')
  const live = { icon: '', title: coachEnTitle, detail: coachEn.directive.detail }

  return {
    v: WIDGET_PAYLOAD_VERSION,
    updated_at: now.toISOString(),
    month,
    day,
    days_in_month: daysInMonth,
    ...legacyDailyPlan(summary, planMonth?.target ?? null, mx.dayOfWeek),
    variable,
    status: variable.status,
    top_over: worst ? { name: worst.name, pct: worst.pct, over_by: worst.spent - worst.budget } : null,
    budget_pace: pace.slice(0, 4),
    daily_spend: dailySpendSeries(input.transactions, input.categoryNames, month, day, new Set(ctrl.map(b => b.category))),
    daily_budget_pace: round(variable.budget / daysInMonth),
    west_month: target && target > 0 ? {
      label: MONTHS[Number(month.slice(5, 7)) - 1] || '',
      month,
      target: round(target),
      projected_savings: round(projected),
      // Legacy alias of projected_savings for cached v1 code.
      surplus_so_far: round(projected),
      gap: round(Math.max(0, target - projected)),
      pct: westPct,
      tone: westTone(westPct),
      stretch_target: stretch != null && stretch > 0 ? round(stretch) : null,
    } : null,
    upcoming,
    milestones: {
      baby_months: Number.isFinite(summary.baby_plan?.months_to_birth) ? Number(summary.baby_plan!.months_to_birth) : null,
      west_funded_pct: funded,
      west_months_to_delivery: westMonthsToDelivery,
    },
    coach: { title: coachEnTitle, url: coachEn.coach.url, question: coachEn.coach.title, rule: coachEn.directive.rule, tone: coachEn.directive.tone },
    coach_es: { title: coachEsTitle, url: coachEs.coach.url, question: coachEs.coach.title },
    brief: { fresh: brief.fresh, generated_at: brief.generated_at, title: brief.title, detail: brief.detail },
    today: todayPlan,

    week_envelope_basis: 'remaining planned category spending from today through Sunday',
    net_this_month: round((summary.income?.current_month_actual ?? 0) - (cm.total_spent ?? 0)),
    projected_savings: round(projected),
    goal_gap: round(Math.max(0, goalNeed - projected)),
    goal_monthly_needed: round(goalNeed),
    emergency_months: summary.emergency_fund?.months_covered || 0,
    west: west ? { month_target: planMonth?.target ?? null, funded_pct: funded, months_to_delivery: west.months_to_delivery ?? null } : null,
    // Only today's brief, otherwise the live rule text — never a stale LLM line (W1).
    wolff: {
      top: legacyTrim(findCat('HOUSEHOLD') || findCat('WIDGET')) || live,
      weekend: legacyTrim(weekItems.find(i => i.type === 'alert') || weekItems[1] || weekItems[0]),
      directive: legacyTrim(findCat('WIDGET'), 110) || live,
    },
  } as WidgetPayloadV2
}
