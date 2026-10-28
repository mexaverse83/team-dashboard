import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addDaysKey,
  addMonthsKey,
  daysInMonth,
  daysLeftInMonth,
  diffDaysKey,
  isValidDateKey,
  localDateKey,
  mexicoCityDateParts,
  mexicoCityMonthKey,
  mexicoCityToday,
  monthEndKey,
  monthKey,
  mxNow,
  nextMonthStartKey,
  parseLocalDateKey,
} from '@/lib/dates'

// Node re-reads process.env.TZ on assignment, so each block below really runs
// on that clock. The household's evening (after 18:00 CDMX) is already the
// next UTC day; month/day keys must not move with it.
const ORIGINAL_TZ = process.env.TZ

describe.each(['UTC', 'America/Mexico_City'])('dates under TZ=%s', (tz) => {
  beforeAll(() => { process.env.TZ = tz })
  afterAll(() => { process.env.TZ = ORIGINAL_TZ })

  it('parses date-only keys as local calendar days (never UTC midnight)', () => {
    const d = parseLocalDateKey('2026-10-28')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(9)
    expect(d.getDate()).toBe(28)
    expect(d.getDay()).toBe(3) // Wednesday, in every timezone
    expect(localDateKey(d)).toBe('2026-10-28')
    expect(monthKey(d)).toBe('2026-10')
  })

  it('accepts YYYY-MM and ISO timestamps, rejects garbage', () => {
    expect(localDateKey(parseLocalDateKey('2027-01'))).toBe('2027-01-01')
    expect(localDateKey(parseLocalDateKey('2026-10-28T23:30:00Z'))).toBe('2026-10-28')
    expect(Number.isNaN(parseLocalDateKey('2026-02-30').getTime())).toBe(true)
    expect(Number.isNaN(parseLocalDateKey('nope').getTime())).toBe(true)
    expect(Number.isNaN(parseLocalDateKey(null).getTime())).toBe(true)
    expect(isValidDateKey('2028-02-29')).toBe(true)
    expect(isValidDateKey('2027-02-29')).toBe(false)
  })

  it('18:00+ CDMX on Oct 31 is still Oct 31 / October in Mexico City', () => {
    const instant = new Date('2026-11-01T01:30:00Z') // Oct 31, 19:30 CDMX
    expect(mexicoCityToday(instant)).toBe('2026-10-31')
    expect(mexicoCityMonthKey(instant)).toBe('2026-10')
    expect(mexicoCityDateParts(instant)).toEqual({ year: 2026, month: 10, day: 31, dayOfWeek: 6 })
    const anchored = mxNow(instant)
    expect(anchored.getFullYear()).toBe(2026)
    expect(anchored.getMonth()).toBe(9)
    expect(anchored.getDate()).toBe(31)
    expect(daysLeftInMonth({ now: instant })).toBe(1)
    expect(daysLeftInMonth({ now: instant, includeToday: false })).toBe(0)
  })

  it('Dec 31 evening CDMX stays in December; Jan 1 rolls the year', () => {
    expect(mexicoCityToday(new Date('2027-01-01T05:00:00Z'))).toBe('2026-12-31') // 23:00 CDMX
    expect(mexicoCityToday(new Date('2027-01-01T06:30:00Z'))).toBe('2027-01-01')
    expect(nextMonthStartKey('2026-12')).toBe('2027-01-01')
    expect(addMonthsKey('2026-12', 1)).toBe('2027-01')
    expect(addMonthsKey('2027-01', -1)).toBe('2026-12')
    expect(addMonthsKey('2026-10-28', 15)).toBe('2028-01')
    expect(addMonthsKey('2026-03', -27)).toBe('2023-12')
  })

  it('month ends are real days (no -31 in 30-day months), February included', () => {
    expect(monthEndKey('2026-11')).toBe('2026-11-30')
    expect(monthEndKey('2026-09')).toBe('2026-09-30')
    expect(monthEndKey('2026-10')).toBe('2026-10-31')
    expect(monthEndKey('2027-02')).toBe('2027-02-28')
    expect(monthEndKey('2028-02')).toBe('2028-02-29')
    expect(nextMonthStartKey('2027-02-14')).toBe('2027-03-01')
    expect(daysInMonth(2028, 2)).toBe(29)
  })

  it('days left counts today by default', () => {
    expect(daysLeftInMonth({ now: new Date('2026-10-28T18:00:00Z') })).toBe(4) // Oct 28 → 28,29,30,31
    expect(daysLeftInMonth({ now: new Date('2027-02-01T18:00:00Z') })).toBe(28)
    expect(daysLeftInMonth({ now: new Date('2028-02-29T18:00:00Z') })).toBe(1)
  })

  it('day arithmetic is calendar-based', () => {
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysKey('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDaysKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(diffDaysKey('2026-10-28', '2026-11-01')).toBe(4)
    expect(diffDaysKey('2026-11-01', '2026-10-28')).toBe(-4)
    expect(diffDaysKey('2026-03-07', '2026-03-09')).toBe(2)
  })
})

describe('addMonthsKey input validation', () => {
  it('throws on a non-month key', () => {
    expect(() => addMonthsKey('October', 1)).toThrow(RangeError)
  })
})
