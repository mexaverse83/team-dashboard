import { describe, expect, it } from 'vitest'
import {
  APP_LOCALE,
  formatCoinPrice,
  formatCompact,
  formatDateShort,
  formatDelta,
  formatMoney,
  formatMonthShort,
  formatPct,
  formatRelativeDue,
  formatWeekdayShort,
  MINUS,
} from '@/lib/format'

describe('formatMoney', () => {
  it('full mode rounds to whole pesos', () => {
    expect(formatMoney(83536)).toBe('$83,536')
    expect(formatMoney(127387.9)).toBe('$127,388')
    expect(formatMoney(0)).toBe('$0')
    expect(formatMoney(-0.4)).toBe('$0')
  })

  it('negatives use the real minus sign', () => {
    expect(formatMoney(-956.29)).toBe(`${MINUS}$956`)
    expect(formatMoney(-956.29).charCodeAt(0)).toBe(0x2212)
  })

  it('compact never prints $1000k', () => {
    expect(formatMoney(92_300, { mode: 'compact' })).toBe('$92.3k')
    expect(formatMoney(13_700_000, { mode: 'compact' })).toBe('$13.7M')
    expect(formatMoney(999_960, { mode: 'compact' })).toBe('$1.0M')
    expect(formatMoney(1_000_000, { mode: 'compact' })).toBe('$1.0M')
    expect(formatMoney(9_500, { mode: 'compact' })).toBe('$9,500')
    expect(formatMoney(10_000, { mode: 'compact' })).toBe('$10.0k')
    expect(formatMoney(-5_486_000, { mode: 'compact' })).toBe(`${MINUS}$5.5M`)
  })

  it('precise keeps cents', () => {
    expect(formatMoney(1305.5, { mode: 'precise' })).toBe('$1,305.50')
    expect(formatMoney(-78.5, { mode: 'precise' })).toBe(`${MINUS}$78.50`)
  })

  it('sign modes', () => {
    expect(formatMoney(12_400, { sign: 'always' })).toBe('+$12,400')
    expect(formatMoney(-12_400, { sign: 'never' })).toBe('$12,400')
    expect(formatMoney(0, { sign: 'always' })).toBe('$0')
  })

  it('currency prefixes only when asked', () => {
    expect(formatMoney(100, { currency: 'USD' })).toBe('$100')
    expect(formatMoney(100, { currency: 'USD', showCurrency: true })).toBe('US$100')
    expect(formatMoney(100, { showCurrency: true })).toBe('MX$100')
  })

  it('missing values render an em dash', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney(Number.NaN)).toBe('—')
  })
})

describe('formatCompact / formatDelta / formatPct', () => {
  it('compact trims zeros for axes', () => {
    expect(formatCompact(20_000)).toBe('$20k')
    expect(formatCompact(1_500)).toBe('$1.5k')
    expect(formatCompact(1_000_000)).toBe('$1M')
    expect(formatCompact(999_999)).toBe('$1M')
    expect(formatCompact(950)).toBe('$950')
    expect(formatCompact(2_400, { currency: false })).toBe('2.4k')
    expect(formatCompact(-3_000)).toBe(`${MINUS}$3k`)
  })

  it('delta is always signed', () => {
    expect(formatDelta(12_400)).toBe('+$12.4k')
    expect(formatDelta(-8, { unit: 'pct' })).toBe(`${MINUS}8%`)
    expect(formatDelta(3, { unit: 'pct' })).toBe('+3%')
    expect(formatDelta(-956.29, { mode: 'full' })).toBe(`${MINUS}$956`)
    expect(formatDelta(0)).toBe('$0')
  })

  it('pct takes percentages by default, ratios on request', () => {
    expect(formatPct(55)).toBe('55%')
    expect(formatPct(0.551, { ratio: true, decimals: 1 })).toBe('55.1%')
    expect(formatPct(-12.4)).toBe(`${MINUS}12%`)
    expect(formatPct(-0.2)).toBe('0%')
    expect(formatPct(339, { sign: 'always' })).toBe('+339%')
  })
})

describe('formatCoinPrice', () => {
  it('keeps sub-dollar precision', () => {
    expect(formatCoinPrice(0.0912)).toBe('$0.0912')
    expect(formatCoinPrice(64_250.5)).toBe('$64,250.50')
    expect(formatCoinPrice(1.8, { currency: 'MXN' })).toBe('$1.80')
    expect(formatCoinPrice(1_250_000.4, { currency: 'MXN', suffix: true })).toBe('$1,250,000 MXN')
    expect(formatCoinPrice(0.5, { currency: 'MXN' })).toBe('$0.5000')
  })
})

describe('dates', () => {
  const now = new Date(2026, 9, 28, 12)

  it('short dates', () => {
    expect(formatDateShort('2026-10-28', { now })).toBe('Oct 28')
    expect(formatDateShort('2026-11-01', { now })).toBe('Nov 1')
    expect(formatDateShort('2025-12-31', { now })).toBe('Dec 31, 2025')
    expect(formatDateShort('2026-10-28', { now, withYear: true })).toBe('Oct 28, 2026')
    expect(formatDateShort('garbage')).toBe('—')
    expect(formatWeekdayShort('2026-10-31')).toBe('Sat, Oct 31')
  })

  it('month labels mark year boundaries', () => {
    expect(formatMonthShort('2026-07')).toBe('Jul')
    expect(formatMonthShort('2027-01')).toBe("Jan '27")
    expect(formatMonthShort('2026-10', { withYear: true })).toBe("Oct '26")
    expect(formatMonthShort('2027-01', { withYear: false })).toBe('Jan')
  })

  it('relative due', () => {
    expect(formatRelativeDue('2026-10-28', { now })).toBe('today')
    expect(formatRelativeDue('2026-10-29', { now })).toBe('tomorrow')
    expect(formatRelativeDue('2026-11-01', { now })).toBe('in 4 days')
    expect(formatRelativeDue('2026-10-27', { now })).toBe('yesterday')
    expect(formatRelativeDue('2026-10-25', { now })).toBe('3 days ago')
  })
})

describe('format snapshot', () => {
  it('locale is a single constant', () => {
    expect(APP_LOCALE).toBe('en-US')
  })

  it('representative outputs', () => {
    const values = [0, 0.5, 999, 9_999, 10_000, 92_345, 999_949, 999_950, 13_700_000, -83_536, 1_234_567_890]
    const table = values.map(v => ({
      v,
      full: formatMoney(v),
      compact: formatMoney(v, { mode: 'compact' }),
      precise: formatMoney(v, { mode: 'precise' }),
      axis: formatCompact(v),
      delta: formatDelta(v),
    }))
    expect(table).toMatchSnapshot()
  })
})
