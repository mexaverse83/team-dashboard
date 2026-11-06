import { describe, expect, it } from 'vitest'
import { cryptoDisplay } from '@/lib/crypto-display'

describe('cryptoDisplay', () => {
  it('keeps MXN as is', () => {
    const d = cryptoDisplay('MXN', 18.5)
    expect(d.money(185_000)).toBe('$185,000')
    expect(d.price({ mxn: 1_850_000, usd: 100_000 })).toBe('$1,850,000')
    expect(d.textProps).toEqual({ currency: 'MXN', showCurrency: false })
  })

  it('converts MXN amounts to USD at the live rate and uses the USD quote for prices', () => {
    const d = cryptoDisplay('USD', 18.5)
    expect(d.amount(185_000)).toBe(10_000)
    expect(d.money(185_000)).toBe('US$10,000')
    expect(d.money(-1850, { sign: 'always' })).toBe('−US$100')
    expect(d.price({ mxn: 1_850_000, usd: 100_000 })).toBe('$100,000.00')
  })

  it('shows a dash for a missing amount or an unpriced coin', () => {
    const d = cryptoDisplay('USD', 18.5)
    expect(d.money(null)).toBe('—')
    expect(d.price(null)).toBe('—')
    expect(d.price({ mxn: 10, usd: 0 })).toBe('—')
  })
})
