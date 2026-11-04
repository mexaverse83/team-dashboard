import { describe, expect, it } from 'vitest'
import { aggregateCoins, holdersOf, ownerSplitLabel, type PortfolioHolding } from '@/lib/crypto-portfolio'

const prices = {
  BTC: { usd: 100_000, mxn: 2_000_000, change24h: 1 },
  SOL: { usd: 150, mxn: 3_000, change24h: -2 },
  ETH: { usd: 3_000, mxn: 60_000 },
}

const h = (id: string, symbol: string, owner: string, quantity: number, avg: number | null = null, extra: Partial<PortfolioHolding> = {}): PortfolioHolding =>
  ({ id, symbol, name: symbol, owner, quantity, avg_cost_basis_usd: avg, cost_currency: 'MXN', ...extra })

describe('aggregateCoins', () => {
  it('adds both owners into ONE row per coin, sorted by value, with a grand total', () => {
    const { rows, totals } = aggregateCoins([
      h('s-b', 'SOL', 'Bernardo', 1.71, 2_500),
      h('b-b', 'BTC', 'bernardo', 0.1, 1_500_000),
      h('s-l', 'SOL', 'Laura', 0.36, 2_000),
      h('b-l', 'BTC', 'Laura', 0.05, 1_800_000),
    ], prices, 20)

    expect(rows.map(r => r.symbol)).toEqual(['BTC', 'SOL'])
    const [btc, sol] = rows
    expect(btc.quantity).toBeCloseTo(0.15)
    expect(btc.valueMXN).toBeCloseTo(300_000)
    expect(btc.costMXN).toBeCloseTo(150_000 + 90_000)
    expect(btc.pl).toBeCloseTo(60_000)
    expect(btc.plPct).toBeCloseTo(25)
    // Canonical owner names in owner order, whatever the stored casing.
    expect(btc.owners.map(o => [o.owner, o.quantity])).toEqual([['Bernardo', 0.1], ['Laura', 0.05]])
    expect(sol.quantity).toBeCloseTo(2.07)
    expect(sol.valueMXN).toBeCloseTo(6_210)
    expect(sol.sharePct + btc.sharePct).toBeCloseTo(100)
    expect(btc.sharePct).toBeCloseTo((300_000 / 306_210) * 100)

    expect(totals.valueMXN).toBeCloseTo(306_210)
    expect(totals.costMXN).toBeCloseTo(240_000 + 4_275 + 720)
    expect(totals.pl).toBeCloseTo(306_210 - 244_995)
    expect(totals.noBasis).toEqual([])
  })

  it('leaves coins without a cost basis out of P/L, and flags a coin with only part of one', () => {
    const { rows, totals } = aggregateCoins([
      h('e', 'ETH', 'Bernardo', 1),
      h('s-b', 'SOL', 'Bernardo', 1, 2_000),
      h('s-l', 'SOL', 'Laura', 1),
    ], prices, 20)
    const eth = rows.find(r => r.symbol === 'ETH')!
    const sol = rows.find(r => r.symbol === 'SOL')!
    expect(eth.pl).toBeNull()
    expect(eth.plPct).toBeNull()
    expect(sol.pl).toBeCloseTo(1_000) // only Bernardo's coin, which has a basis
    expect(sol.partialBasis).toBe(true)
    expect(totals.pl).toBeCloseTo(1_000)
    expect(totals.noBasis).toEqual(['ETH'])
  })

  it('converts a USD cost basis at the given rate', () => {
    const { rows } = aggregateCoins([h('b', 'BTC', 'Laura', 1, 90_000, { cost_currency: 'USD' })], prices, 20)
    expect(rows[0].costMXN).toBe(1_800_000)
  })

  it('hides zero-balance coins unless asked, and counts them', () => {
    const holdings = [h('b', 'BTC', 'Bernardo', 0.1), h('k', 'KAS', 'Laura', 0), h('a', 'AERO', 'Bernardo', 0)]
    const hidden = aggregateCoins(holdings, prices, 20)
    expect(hidden.rows.map(r => r.symbol)).toEqual(['BTC'])
    expect(hidden.emptyCount).toBe(2)
    const shown = aggregateCoins(holdings, prices, 20, { includeEmpty: true })
    expect(shown.rows.map(r => r.symbol)).toEqual(['BTC', 'AERO', 'KAS'])
    expect(shown.rows[1].sharePct).toBe(0)
  })

  it('keeps an unpriced coin visible with no value and no P/L', () => {
    const { rows, totals } = aggregateCoins([h('p', 'PEPE', 'Laura', 1_000_000, 0.0002)], prices, 20)
    expect(rows[0]).toMatchObject({ symbol: 'PEPE', priceMXN: null, valueMXN: 0, pl: null })
    expect(totals.unpriced).toEqual(['PEPE'])
    expect(totals.pl).toBeNull()
  })

  it('merges two holdings of the same owner and keeps every id for removal', () => {
    const { rows } = aggregateCoins([h('x1', 'BTC', 'Bernardo', 0.1), h('x2', 'BTC', 'bernardo', 0.2)], prices, 20)
    expect(rows[0].owners).toHaveLength(1)
    expect(rows[0].owners[0]).toMatchObject({ owner: 'Bernardo', holdingIds: ['x1', 'x2'] })
    expect(rows[0].owners[0].quantity).toBeCloseTo(0.3)
    expect(rows[0].holdingIds).toEqual(['x1', 'x2'])
  })

  it('labels the owner split', () => {
    const { rows } = aggregateCoins([h('a', 'SOL', 'Bernardo', 1.71), h('b', 'SOL', 'Laura', 0.36), h('c', 'BTC', 'Laura', 0.2), h('d', 'BTC', 'Bernardo', 0)], prices, 20)
    const fmt = (n: number) => n.toFixed(2)
    expect(ownerSplitLabel(rows.find(r => r.symbol === 'SOL')!.owners, fmt)).toBe('B 1.71 · L 0.36')
    expect(ownerSplitLabel(rows.find(r => r.symbol === 'BTC')!.owners, fmt)).toBe('L 0.20')
  })

  it('counts only owners who hold some of the coin as holders', () => {
    const { rows } = aggregateCoins([
      { id: 'x-b', symbol: 'X', owner: 'Bernardo', quantity: 0 },
      { id: 'x-l', symbol: 'X', owner: 'Laura', quantity: 5 },
      { id: 'y-b', symbol: 'Y', owner: 'Bernardo', quantity: 0 },
    ], null, 18, { includeEmpty: true })
    expect(holdersOf(rows.find(r => r.symbol === 'X')!).map(o => o.owner)).toEqual(['Laura'])
    // A coin at zero for everyone still has someone to remove it from.
    expect(holdersOf(rows.find(r => r.symbol === 'Y')!).map(o => o.owner)).toEqual(['Bernardo'])
  })
})
