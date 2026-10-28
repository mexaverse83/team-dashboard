// Mona's "live plan": a brief computed from today's summary numbers, used
// whenever the LLM brief is not usable (insight-freshness). It can never be
// stale, never needs a home PC, and never invents numbers. (W1, AUTO-07)
//
// Directive rules, first match wins:
//   1. a non-fixed category over 120% of budget → "Pause <cat> — $X over"
//   2. a bill ≥ $10k due within 3 days          → "Rent $35k due Sun"
//   3. projected savings below WEST capacity     → "WEST: $Xk to go this month"
//   4. otherwise                                 → "On plan — $X left this week"
// The WEST target and the 2026 goal need are the same GBM pesos: this module
// never adds them together.
import { CONTROLLABLE } from './controllable-categories'
import { addDaysKey, diffDaysKey, mexicoCityDateParts, parseLocalDateKey } from './dates'
import { formatCompact, formatMoney } from './format'
import type { Tone } from './budget-tone'
import type { SummaryUpcomingItem, SummaryVariable, SummaryWestPlan } from './summary/types'

export type BriefRule = 'over-budget' | 'big-bill' | 'west-behind' | 'on-plan'
export type BriefLang = 'en' | 'es'

export interface DeterministicBrief {
  directive: { title: string; detail: string; url: string; rule: BriefRule; tone: Tone }
  coach: { title: string; url: string }
  week: { title: string; detail: string; left: number; through_label: string }
  household: { title: string; detail: string }
  source: 'live'
  generated_at: string
}

/** The subset of the summary the brief reads; everything is optional. */
export interface BriefSummary {
  current_month?: {
    month?: string
    day_of_month?: number
    days_in_month?: number
    total_spent?: number
    budget_vs_actual?: Array<{ category: string; spent: number; budget: number; is_fixed?: boolean; is_non_monthly?: boolean }>
  } | null
  month_projection?: { projected_savings?: number } | null
  subscriptions?: { active?: Array<{ name: string; amount: number; last_charge?: string | null }> } | null
  income?: { current_month_actual?: number } | null
  variable?: Partial<SummaryVariable> | null
  upcoming?: SummaryUpcomingItem[] | null
  west_plan?: Partial<SummaryWestPlan> | null
}

export interface BuildBriefOptions {
  now?: Date
  lang?: BriefLang
}

export const OVER_BUDGET_PAUSE_RATIO = 1.2
export const BIG_BILL_MIN = 10_000
export const BIG_BILL_WINDOW_DAYS = 3

const WEEKDAYS: Record<BriefLang, string[]> = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
}
const MONTHS: Record<BriefLang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
}

const T = {
  en: {
    pause: (cat: string, over: string) => `Pause ${cat} — ${over} over`,
    pauseDetail: (spent: string, budget: string) => `${spent} spent of a ${budget} budget this month.`,
    bill: (name: string, amount: string, day: string) => `${name} ${amount} due ${day}`,
    billDetail: 'Keep it in the account before it posts.',
    west: (gap: string) => `WEST: ${gap} to go this month`,
    westDetail: (projected: string, capacity: string) => `Projected savings ${projected} vs ${capacity} capacity.`,
    onPlan: (left: string) => `On plan — ${left} left this week`,
    overWeek: (over: string) => `Over plan — ${over} past this week's room`,
    weekTitle: (left: string) => `${left} left this week`,
    weekOver: (over: string) => `${over} over this week`,
    weekDetail: (through: string, perDay: string) => `Through ${through} · about ${perDay}/day`,
    householdTitle: (projected: string) => `Projected savings ${projected} this month`,
    householdWest: (pct: number, capacity: string) => `${pct}% of the ${capacity} WEST capacity.`,
    householdPlain: (income: string, spent: string) => `Income ${income} · spent ${spent} so far.`,
    coachOver: (cat: string) => `How do we get ${cat} back on budget?`,
    coachBill: (name: string) => `Are we covered for ${name}?`,
    coachWest: 'How do we close the WEST gap this month?',
    coachOnPlan: 'Can we spend a little extra this weekend?',
  },
  es: {
    pause: (cat: string, over: string) => `Pausa ${cat} — ${over} arriba`,
    pauseDetail: (spent: string, budget: string) => `${spent} gastado de ${budget} este mes.`,
    bill: (name: string, amount: string, day: string) => `${name} ${amount} vence ${day}`,
    billDetail: 'Tenlo en la cuenta antes de que se cobre.',
    west: (gap: string) => `WEST: faltan ${gap} este mes`,
    westDetail: (projected: string, capacity: string) => `Ahorro proyectado ${projected} vs capacidad ${capacity}.`,
    onPlan: (left: string) => `En plan — quedan ${left} esta semana`,
    overWeek: (over: string) => `Fuera de plan — ${over} arriba esta semana`,
    weekTitle: (left: string) => `Quedan ${left} esta semana`,
    weekOver: (over: string) => `${over} arriba esta semana`,
    weekDetail: (through: string, perDay: string) => `Hasta ${through} · ~${perDay}/día`,
    householdTitle: (projected: string) => `Ahorro proyectado ${projected} este mes`,
    householdWest: (pct: number, capacity: string) => `${pct}% de la capacidad WEST de ${capacity}.`,
    householdPlain: (income: string, spent: string) => `Ingreso ${income} · gastado ${spent}.`,
    coachOver: (cat: string) => `¿Cómo regresamos ${cat} al presupuesto?`,
    coachBill: (name: string) => `¿Tenemos cubierto ${name}?`,
    coachWest: '¿Cómo cerramos la brecha de WEST este mes?',
    coachOnPlan: '¿Podemos gastar un poco extra este fin?',
  },
} as const

const money = (n: number) => formatMoney(n)
const compact = (n: number) => formatCompact(n)

function dayLabel(dateKey: string, lang: BriefLang): string {
  const d = parseLocalDateKey(dateKey)
  return `${WEEKDAYS[lang][d.getDay()]} ${MONTHS[lang][d.getMonth()]} ${d.getDate()}`
}

function dueWord(today: string, date: string, lang: BriefLang): string {
  const days = diffDaysKey(today, date)
  if (days === 0) return lang === 'es' ? 'hoy' : 'today'
  if (days === 1) return lang === 'es' ? 'mañana' : 'tomorrow'
  return (lang === 'es' ? 'el ' : '') + WEEKDAYS[lang][parseLocalDateKey(date).getDay()]
}

interface WeekRoom { left: number; through: string; days: number }

/** Signed controllable room from today through Sunday (or month end, whichever is first). */
function weekRoom(summary: BriefSummary, today: string, dayOfWeek: number, lang: BriefLang): WeekRoom {
  const cm = summary.current_month
  const daysInMonth = Number(cm?.days_in_month) || 0
  const dayOfMonth = Number(cm?.day_of_month) || Number(today.slice(8, 10))
  const daysLeftMonth = Math.max(1, daysInMonth ? daysInMonth - dayOfMonth + 1 : 1)
  const daysThroughSunday = Math.min(daysLeftMonth, dayOfWeek === 0 ? 1 : 8 - dayOfWeek)
  const through = summary.variable?.through_label || dayLabel(addDaysKey(today, daysThroughSunday - 1), lang)

  if (summary.variable && typeof summary.variable.left === 'number') {
    return { left: summary.variable.left, through, days: Math.max(1, Number(summary.variable.days_left) || daysThroughSunday) }
  }
  const rows = (cm?.budget_vs_actual || []).filter(b => CONTROLLABLE.has(b.category) && !b.is_non_monthly)
  const monthRoom = rows.reduce((s, b) => s + (Number(b.budget) || 0) - (Number(b.spent) || 0), 0)
  const left = monthRoom > 0 ? Math.round((monthRoom / daysLeftMonth) * daysThroughSunday) : Math.round(monthRoom)
  return { left, through, days: daysThroughSunday }
}

export function buildDeterministicBrief(summary: BriefSummary, { now = new Date(), lang = 'en' }: BuildBriefOptions = {}): DeterministicBrief {
  const t = T[lang]
  const mx = mexicoCityDateParts(now)
  const today = `${mx.year}-${String(mx.month).padStart(2, '0')}-${String(mx.day).padStart(2, '0')}`
  const month = summary.current_month?.month || today.slice(0, 7)
  const room = weekRoom(summary, today, mx.dayOfWeek, lang)
  const askUrl = (q: string) => `/finance/ask?prompt=${encodeURIComponent(q)}`

  // 1. Category well over budget.
  const overRows = (summary.current_month?.budget_vs_actual || [])
    // Only monthly, controllable categories: fixed bills can't be paused, and
    // non-monthly rows carry a full-cycle budget the summary rates 'warning' up to 150%.
    .filter(b => !b.is_fixed && !b.is_non_monthly && CONTROLLABLE.has(String(b.category))
      && Number(b.budget) > 0 && Number(b.spent) > Number(b.budget) * OVER_BUDGET_PAUSE_RATIO)
    .sort((a, b) => (Number(b.spent) - Number(b.budget)) - (Number(a.spent) - Number(a.budget)))
  let directive: DeterministicBrief['directive']
  let coachQuestion: string
  if (overRows[0]) {
    const row = overRows[0]
    const category = String(row.category)
    directive = {
      title: t.pause(category, compact(Number(row.spent) - Number(row.budget))),
      detail: t.pauseDetail(money(Number(row.spent)), money(Number(row.budget))),
      url: `/finance/budgets?month=${month}`,
      rule: 'over-budget',
      tone: 'negative',
    }
    coachQuestion = t.coachOver(category)
  } else {
    // 2. Big bill within the window.
    const bill = upcomingBigBill(summary, today)
    if (bill) {
      directive = {
        title: t.bill(bill.label, compact(bill.amount), dueWord(today, bill.date, lang)),
        detail: t.billDetail,
        url: '/finance/subscriptions',
        rule: 'big-bill',
        tone: 'warning',
      }
      coachQuestion = t.coachBill(bill.label)
    } else if (summary.west_plan && Number(summary.west_plan.capacity_target) > Number(summary.west_plan.projected_savings)) {
      // 3. WEST behind its capacity pace.
      const wp = summary.west_plan
      directive = {
        title: t.west(compact(Number(wp.capacity_target) - Number(wp.projected_savings))),
        detail: t.westDetail(money(Number(wp.projected_savings)), money(Number(wp.capacity_target))),
        url: '/finance/investments?tab=Real%20Estate',
        rule: 'west-behind',
        tone: 'warning',
      }
      coachQuestion = t.coachWest
    } else {
      // 4. On plan.
      directive = {
        title: room.left >= 0 ? t.onPlan(money(room.left)) : t.overWeek(money(-room.left)),
        detail: t.weekDetail(room.through, money(Math.max(0, room.left) / room.days)),
        url: `/finance/budgets?month=${month}`,
        rule: 'on-plan',
        tone: room.left >= 0 ? 'positive' : 'negative',
      }
      coachQuestion = t.coachOnPlan
    }
  }

  const projected = Number(summary.month_projection?.projected_savings) || 0
  const wp = summary.west_plan
  const household = {
    title: t.householdTitle(compact(projected)),
    detail: wp && Number(wp.capacity_target) > 0
      ? t.householdWest(Math.round((projected / Number(wp.capacity_target)) * 100), compact(Number(wp.capacity_target)))
      : t.householdPlain(compact(Number(summary.income?.current_month_actual) || 0), compact(Number(summary.current_month?.total_spent) || 0)),
  }

  return {
    directive,
    coach: { title: coachQuestion, url: askUrl(coachQuestion) },
    week: {
      title: room.left >= 0 ? t.weekTitle(money(room.left)) : t.weekOver(money(-room.left)),
      detail: t.weekDetail(room.through, money(Math.max(0, room.left) / room.days)),
      left: room.left,
      through_label: room.through,
    },
    household,
    source: 'live',
    generated_at: now.toISOString(),
  }
}

function upcomingBigBill(summary: BriefSummary, today: string): { label: string; amount: number; date: string } | null {
  const inWindow = (date: string | null | undefined) => {
    if (!date) return false
    const days = diffDaysKey(today, String(date).slice(0, 10))
    return days >= 0 && days <= BIG_BILL_WINDOW_DAYS
  }
  const candidates: Array<{ label: string; amount: number; date: string }> = []
  if (Array.isArray(summary.upcoming)) {
    for (const item of summary.upcoming) {
      if ((item.kind === 'bill' || item.kind === 'msi' || item.kind === 'west') && Number(item.amount) >= BIG_BILL_MIN && inWindow(item.date)) {
        candidates.push({ label: String(item.label), amount: Number(item.amount), date: String(item.date).slice(0, 10) })
      }
    }
  } else {
    for (const sub of summary.subscriptions?.active || []) {
      if (Number(sub.amount) >= BIG_BILL_MIN && inWindow(sub.last_charge)) {
        candidates.push({ label: String(sub.name), amount: Number(sub.amount), date: String(sub.last_charge).slice(0, 10) })
      }
    }
  }
  candidates.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount)
  return candidates[0] || null
}

/** Insight-shaped rows (WIDGET / WEEK / HOUSEHOLD) so routes can serve the live plan in place of a stale LLM brief. */
export function deterministicBriefToInsights(brief: DeterministicBrief) {
  const priority = brief.directive.tone === 'negative' ? 'high' : brief.directive.tone === 'warning' ? 'medium' : 'low'
  return [
    { type: brief.directive.tone === 'positive' ? 'win' : 'alert', icon: '', title: brief.directive.title, detail: brief.directive.detail, priority, category: 'WIDGET', url: brief.directive.url, source: 'live' as const },
    { type: 'forecast', icon: '', title: brief.week.title, detail: brief.week.detail, priority: 'medium', category: 'WEEK', source: 'live' as const },
    { type: 'forecast', icon: '', title: brief.household.title, detail: brief.household.detail, priority: 'medium', category: 'HOUSEHOLD', source: 'live' as const },
  ]
}
