// The one source of number and date formatting for the UI.
// Rules (VIS-04 / CH-13 / MOB-14):
//  - full    '$83,536'    hero KPIs and tables (0 decimals)
//  - compact '$92.3k' / '$13.7M'  secondary KPIs and chips (never '$1000k')
//  - precise '$1,305.50'  transaction detail and edit views only
//  - negatives use the real minus sign U+2212; missing values render '—'
//  - no 'MXN' suffix unless USD appears in the same view (then 'MX$' / 'US$')
import { localDateKey, parseLocalDateKey, diffDaysKey } from './dates'

/** UI locale (NU-2: chrome stays English). Change here, nowhere else. */
export const APP_LOCALE = 'en-US'

export const MINUS = '−'
export const EMPTY_VALUE = '—'

export type MoneyMode = 'full' | 'compact' | 'precise'
export type SignMode = 'auto' | 'always' | 'never'
export type Currency = 'MXN' | 'USD'

export interface FormatMoneyOptions {
  mode?: MoneyMode
  sign?: SignMode
  currency?: Currency
  /** Prefix 'MX$' / 'US$' instead of '$' (only when both currencies share a view). */
  showCurrency?: boolean
}

const numberFormats = new Map<string, Intl.NumberFormat>()
function numberFormat(min: number, max: number): Intl.NumberFormat {
  const key = `${min}:${max}`
  let nf = numberFormats.get(key)
  if (!nf) {
    nf = new Intl.NumberFormat(APP_LOCALE, { minimumFractionDigits: min, maximumFractionDigits: max })
    numberFormats.set(key, nf)
  }
  return nf
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function signPrefix(n: number, sign: SignMode): string {
  if (sign === 'never') return ''
  if (n < 0) return MINUS
  if (sign === 'always' && n > 0) return '+'
  return ''
}

function symbol(currency: Currency, showCurrency: boolean): string {
  if (!showCurrency) return '$'
  return currency === 'USD' ? 'US$' : 'MX$'
}

/** Compact magnitude for an absolute value, rounding before choosing the unit so 999,960 → '1.0M'. */
function compactAbs(abs: number, decimals: number, trimZeros: boolean): string {
  const units: Array<[number, string]> = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']]
  const factor = 10 ** decimals
  for (let i = 0; i < units.length; i++) {
    const [size, suffix] = units[i]
    if (abs >= size) {
      const scaled = Math.round((abs / size) * factor) / factor
      // 999.95k rounds to 1000.0k → promote to the next unit up.
      if (scaled >= 1000 && i > 0) {
        const [bigSize, bigSuffix] = units[i - 1]
        const big = Math.round((abs / bigSize) * factor) / factor
        return `${trim(big.toFixed(decimals), trimZeros)}${bigSuffix}`
      }
      return `${trim(scaled.toFixed(decimals), trimZeros)}${suffix}`
    }
  }
  return numberFormat(0, 0).format(Math.round(abs))
}

function trim(s: string, trimZeros: boolean): string {
  return trimZeros && s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

/** Money: formatMoney(83536) → '$83,536'; ({mode:'compact'}) → '$83.5k'; (-12.5,{mode:'precise'}) → '−$12.50'. */
export function formatMoney(n: number | null | undefined, opts: FormatMoneyOptions = {}): string {
  if (!isFiniteNumber(n)) return EMPTY_VALUE
  const { mode = 'full', sign = 'auto', currency = 'MXN', showCurrency = false } = opts
  const abs = Math.abs(n)
  // A value that displays as zero ('$0', '$0.00') never carries a sign.
  const shown = mode === 'precise' ? Math.round(n * 100) / 100 : Math.round(n)
  const prefix = signPrefix(shown === 0 ? 0 : n, sign)
  const sym = symbol(currency, showCurrency)
  if (mode === 'precise') return `${prefix}${sym}${numberFormat(2, 2).format(abs)}`
  if (mode === 'compact' && abs >= 9_999.5) return `${prefix}${sym}${compactAbs(abs, 1, false)}`
  return `${prefix}${sym}${numberFormat(0, 0).format(Math.round(abs))}`
}

export interface FormatCompactOptions {
  /** Prefix with '$' (default true). */
  currency?: boolean
  decimals?: number
  /** '20k' instead of '20.0k' (default true — chart axes and chips). */
  trimZeros?: boolean
  sign?: SignMode
}

/** Always-compact number for axes and chips: 1500 → '$1.5k', 20000 → '$20k', 1e6 → '$1M', 950 → '$950'. */
export function formatCompact(n: number | null | undefined, opts: FormatCompactOptions = {}): string {
  if (!isFiniteNumber(n)) return EMPTY_VALUE
  const { currency = true, decimals = 1, trimZeros = true, sign = 'auto' } = opts
  return `${signPrefix(n, sign)}${currency ? '$' : ''}${compactAbs(Math.abs(n), decimals, trimZeros)}`
}

export interface FormatDeltaOptions {
  unit?: 'money' | 'pct'
  mode?: MoneyMode
  decimals?: number
}

/** Always-signed change: formatDelta(12400) → '+$12.4k'; formatDelta(-8, {unit:'pct'}) → '−8%'; 0 → '$0'. */
export function formatDelta(n: number | null | undefined, opts: FormatDeltaOptions = {}): string {
  if (!isFiniteNumber(n)) return EMPTY_VALUE
  const { unit = 'money', mode = 'compact', decimals = 0 } = opts
  if (unit === 'pct') return formatPct(n, { decimals, sign: 'always' })
  return formatMoney(n, { mode, sign: 'always' })
}

export interface FormatPctOptions {
  decimals?: number
  sign?: SignMode
  /** Input is a 0–1 ratio instead of a 0–100 percentage. */
  ratio?: boolean
}

/** Percentages: formatPct(55) → '55%'; formatPct(0.551, {ratio:true, decimals:1}) → '55.1%'. */
export function formatPct(n: number | null | undefined, opts: FormatPctOptions = {}): string {
  if (!isFiniteNumber(n)) return EMPTY_VALUE
  const { decimals = 0, sign = 'auto', ratio = false } = opts
  const value = ratio ? n * 100 : n
  const factor = 10 ** decimals
  const rounded = Math.round(Math.abs(value) * factor) / factor
  const signed = rounded === 0 ? 0 : value
  return `${signPrefix(signed, sign)}${numberFormat(decimals, decimals).format(rounded)}%`
}

/**
 * Crypto unit prices keep their precision so sub-dollar coins don't read $0:
 * USD 2 decimals (4 below $1); MXN 0 decimals ≥ $100, 2 ≥ $1, else 4.
 */
export function formatCoinPrice(n: number | null | undefined, opts: { currency?: Currency; suffix?: boolean } = {}): string {
  if (!isFiniteNumber(n)) return EMPTY_VALUE
  const { currency = 'USD', suffix = false } = opts
  const abs = Math.abs(n)
  const decimals = currency === 'MXN'
    ? (abs >= 100 ? 0 : abs >= 1 ? 2 : 4)
    : (abs >= 1 ? 2 : 4)
  return `${n < 0 ? MINUS : ''}$${numberFormat(decimals, decimals).format(abs)}${suffix ? ` ${currency}` : ''}`
}

type DateInput = string | Date | null | undefined

function toLocalDate(input: DateInput): Date | null {
  if (input == null || input === '') return null
  const d = input instanceof Date ? input : parseLocalDateKey(input)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 'Oct 28' (adds ', 2025' when `withYear` or, with 'auto', when the year differs from `now`). */
export function formatDateShort(input: DateInput, opts: { withYear?: boolean | 'auto'; now?: Date } = {}): string {
  const d = toLocalDate(input)
  if (!d) return EMPTY_VALUE
  const { withYear = 'auto', now = new Date() } = opts
  const showYear = withYear === true || (withYear === 'auto' && d.getFullYear() !== now.getFullYear())
  return d.toLocaleDateString(APP_LOCALE, { month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}) })
}

/** 'Wed, Oct 28' — for day group headers and due dates. */
export function formatWeekdayShort(input: DateInput): string {
  const d = toLocalDate(input)
  if (!d) return EMPTY_VALUE
  return d.toLocaleDateString(APP_LOCALE, { weekday: 'short', month: 'short', day: 'numeric' })
}

/**
 * Month label for axes and headers: '2026-07' → 'Jul'. With `withYear: 'auto'`
 * (default) January carries the year ("Jan '27") so year boundaries read; pass
 * true to always show it ("Oct '26") or false to never.
 */
export function formatMonthShort(input: DateInput, opts: { withYear?: boolean | 'auto' } = {}): string {
  const d = toLocalDate(input)
  if (!d) return EMPTY_VALUE
  const { withYear = 'auto' } = opts
  const name = d.toLocaleDateString(APP_LOCALE, { month: 'short' })
  const showYear = withYear === true || (withYear === 'auto' && d.getMonth() === 0)
  return showYear ? `${name} '${String(d.getFullYear()).slice(2)}` : name
}

/** 'today' · 'tomorrow' · 'in 4 days' · 'yesterday' · '3 days ago', by local calendar day. */
export function formatRelativeDue(input: DateInput, opts: { now?: Date } = {}): string {
  const d = toLocalDate(input)
  if (!d) return EMPTY_VALUE
  const days = diffDaysKey(localDateKey(opts.now ?? new Date()), localDateKey(d))
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}
