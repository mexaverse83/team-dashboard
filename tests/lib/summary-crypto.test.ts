import { describe, expect, it } from 'vitest'
import { buildCryptoSummary } from '@/lib/summary/crypto'

describe('buildCryptoSummary', () => {
  const rows = [
    { symbol: 'BTC', quantity: 0.1, owner: 'Bernardo', avg_cost_basis_usd: 1_500_000, cost_currency: 'MXN' },
    { symbol: 'KAS', quantity: 10_000, owner: 'Laura', avg_cost_basis_usd: 2, cost_currency: 'MXN' },
  ]

  it('leaves a coin with no live price out of cost and P/L (never a fake loss)', () => {
    const s = buildCryptoSummary(rows, { BTC: { usd: 100_000, mxn: 2_000_000, change24h: 0 } })!
    expect(s.total_value_mxn).toBe(200_000)
    expect(s.total_cost_mxn).toBe(150_000)
    expect(s.pnl_mxn).toBe(50_000)
    expect(s.pnl_pct).toBe(33.3)
    expect(s.risks.large_loss).toBeNull()
    expect(s.unpriced).toEqual(['KAS'])
    expect(s.prices_available).toBe(true)
  })

  it('says prices are unavailable when no held coin has one', () => {
    const s = buildCryptoSummary(rows, { ETH: { usd: 3000, mxn: 54_000, change24h: 0 } })!
    expect(s.prices_available).toBe(false)
    expect(s.pnl_mxn).toBe(0)
    expect(s.risks.large_loss).toBeNull()
    expect(s.unpriced).toEqual(['BTC', 'KAS'])
  })
})
