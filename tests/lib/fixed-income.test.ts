import { describe, it, expect } from 'vitest'
import { accruedValue, effectiveNetRate, normalizeRate, monthsSinceConfirmed } from '@/lib/fixed-income'

const GBM = {
  principal: 5_650_000,
  annual_rate: 0.1026,        // 10.26% gross
  commission_rate: 0.0125,    // → 9.01% net
  net_annual_rate: 0.0901,
  updated_at: '2026-06-17T00:00:00Z',
}

describe('normalizeRate', () => {
  it('passes through decimals and converts percents', () => {
    expect(normalizeRate(0.1026)).toBeCloseTo(0.1026, 6)
    expect(normalizeRate(10.26)).toBeCloseTo(0.1026, 6)
    expect(normalizeRate(null)).toBe(0)
  })
})

describe('effectiveNetRate', () => {
  it('computes gross − commission when a commission exists', () => {
    expect(effectiveNetRate(GBM)).toBeCloseTo(0.0901, 6)
  })
  it('falls back to stored net, then gross', () => {
    expect(effectiveNetRate({ annual_rate: 0.1, commission_rate: null, net_annual_rate: 0.09 })).toBeCloseTo(0.09, 6)
    expect(effectiveNetRate({ annual_rate: 0.08, commission_rate: null, net_annual_rate: null })).toBeCloseTo(0.08, 6)
  })
})

describe('monthsSinceConfirmed', () => {
  it('counts whole calendar months, never negative', () => {
    expect(monthsSinceConfirmed(GBM, new Date('2026-06-30T00:00:00Z'))).toBe(0)
    expect(monthsSinceConfirmed(GBM, new Date('2026-07-01T00:00:00Z'))).toBe(1)
    expect(monthsSinceConfirmed(GBM, new Date('2027-06-17T00:00:00Z'))).toBe(12)
    expect(monthsSinceConfirmed(GBM, new Date('2026-01-01T00:00:00Z'))).toBe(0)
  })
})

describe('accruedValue', () => {
  it('returns bare principal in the confirmation month', () => {
    expect(accruedValue(GBM, new Date('2026-06-20T00:00:00Z'))).toBe(5_650_000)
  })

  it('steps up by the net monthly rate once per month', () => {
    const mr = Math.pow(1 + 0.0901, 1 / 12) - 1
    const oneMonth = accruedValue(GBM, new Date('2026-07-05T00:00:00Z'))
    expect(oneMonth).toBeCloseTo(5_650_000 * (1 + mr), 2)
  })

  it('compounds to ~the net annual rate over 12 months', () => {
    const twelve = accruedValue(GBM, new Date('2027-06-17T00:00:00Z'))
    expect(twelve).toBeCloseTo(5_650_000 * 1.0901, 0)
  })

  it('does not accrue without a rate', () => {
    expect(accruedValue({ principal: 1000, annual_rate: 0, updated_at: '2025-01-01' }, new Date('2026-01-01'))).toBe(1000)
  })

  it('does not accrue without an anchor date', () => {
    expect(accruedValue({ principal: 1000, annual_rate: 0.1 })).toBe(1000)
  })
})
