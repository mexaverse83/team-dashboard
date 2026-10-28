// One home for calendar keys. Two rules this module exists to enforce:
//  1. Date-only strings ('YYYY-MM-DD') are LOCAL calendar days. Never run
//     them through `new Date('YYYY-MM-DD')` (that is UTC midnight, i.e. the
//     previous evening in Mexico City) or `toISOString().slice(...)`.
//  2. "Today" / "this month" for household logic is the America/Mexico_City
//     calendar, not the server clock (Vercel runs in UTC, which is already
//     tomorrow after ~18:00 local).
import { monthKey } from './finance-utils'

export { monthKey }

export const MX_TIME_ZONE = 'America/Mexico_City'

const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD in the device's local timezone (never shifted through UTC). */
export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Local-midnight Date for a 'YYYY-MM-DD' key (also accepts 'YYYY-MM', which
 * means day 1, and full ISO timestamps, whose date part is used). Built from
 * local components, so `getDay()` / `getDate()` return the calendar day that
 * was written. Returns an Invalid Date for unparseable input.
 */
export function parseLocalDateKey(key: string | null | undefined): Date {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:$|T)/.exec(String(key ?? '').trim())
  if (!match) return new Date(NaN)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = match[3] ? Number(match[3]) : 1
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return new Date(NaN)
  return new Date(year, month - 1, day)
}

export function isValidDateKey(key: string | null | undefined): boolean {
  return !Number.isNaN(parseLocalDateKey(key).getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(String(key ?? ''))
}

/** Days in a month. `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export interface MexicoCityDateParts {
  year: number
  /** 1-12 */
  month: number
  day: number
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number
}

/** Calendar components of `now` on the Mexico City clock. */
export function mexicoCityDateParts(now: Date = new Date()): MexicoCityDateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MX_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)
  const anchor = new Date(Date.UTC(year, month - 1, day, 12))
  return { year, month, day, dayOfWeek: anchor.getUTCDay() }
}

/** Today's 'YYYY-MM-DD' on the Mexico City calendar. */
export function mexicoCityToday(now: Date = new Date()): string {
  const mx = mexicoCityDateParts(now)
  return `${mx.year}-${pad(mx.month)}-${pad(mx.day)}`
}

/** This month's 'YYYY-MM' on the Mexico City calendar. */
export function mexicoCityMonthKey(now: Date = new Date()): string {
  return mexicoCityToday(now).slice(0, 7)
}

/**
 * A Date pinned to 12:00 UTC of the current Mexico City calendar day. Its
 * local getters (getFullYear/getMonth/getDate/getDay) return the MX date in
 * any timezone between UTC−11 and UTC+11, so it can be handed to legacy
 * helpers that read local components (baby-plan, fertility-plan, …).
 */
export function mxNow(now: Date = new Date()): Date {
  const mx = mexicoCityDateParts(now)
  return new Date(Date.UTC(mx.year, mx.month - 1, mx.day, 12))
}

function splitMonth(month: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})/.exec(month)
  if (!match) throw new RangeError(`Invalid month key: ${month}`)
  return { year: Number(match[1]), month: Number(match[2]) }
}

/** 'YYYY-MM' shifted by `n` months (negative goes back). Accepts 'YYYY-MM-DD'. */
export function addMonthsKey(month: string, n: number): string {
  const { year, month: m } = splitMonth(month)
  const index = year * 12 + (m - 1) + n
  return `${Math.floor(index / 12)}-${pad((((index % 12) + 12) % 12) + 1)}`
}

/** First day of the month after `month`: '2026-12' → '2027-01-01'. Use with `.lt()`. */
export function nextMonthStartKey(month: string): string {
  return `${addMonthsKey(month, 1)}-01`
}

/** Real last day of `month`: '2026-11' → '2026-11-30' (never '-31'). Use with `.lte()`. */
export function monthEndKey(month: string): string {
  const { year, month: m } = splitMonth(month)
  return `${year}-${pad(m)}-${pad(daysInMonth(year, m))}`
}

/** 'YYYY-MM-DD' shifted by `days` calendar days (DST-safe, pure string math). */
export function addDaysKey(dateKey: string, days: number): string {
  const d = parseLocalDateKey(dateKey)
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date key: ${dateKey}`)
  const shifted = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** Whole calendar days from `from` to `to` (both 'YYYY-MM-DD'); negative when `to` is earlier. */
export function diffDaysKey(from: string, to: string): number {
  const a = parseLocalDateKey(from)
  const b = parseLocalDateKey(to)
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000,
  )
}

export interface DaysLeftOptions {
  now?: Date
  /** Count today as a remaining day (default true — "3 days left" on the 29th of a 31-day month). */
  includeToday?: boolean
  /** Which calendar decides "today" (default 'mexico'). */
  calendar?: 'mexico' | 'local'
}

/** Days remaining in the current month. On the 31st of a 31-day month: 1 (or 0 without today). */
export function daysLeftInMonth({ now = new Date(), includeToday = true, calendar = 'mexico' }: DaysLeftOptions = {}): number {
  const { year, month, day } = calendar === 'mexico'
    ? mexicoCityDateParts(now)
    : { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  return daysInMonth(year, month) - day + (includeToday ? 1 : 0)
}
