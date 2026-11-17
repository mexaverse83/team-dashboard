import { describe, expect, it } from 'vitest'
import { isMissingStockTxTable, needsOpeningCost, replayStockLedger, roundShares, txTotal } from '@/lib/stock-ledger'

// The household's first GBM buy (Nov 17 2026): NVDA, market order.
const GBM_NVDA = { type: 'buy', shares: 0.34692423, price: 153.81, price_currency: 'USD', commission: 0.13, fx_usd_mxn: 18.5 }

describe('stock ledger', () => {
  it('keeps 8-decimal fractional shares and puts the commission into the cost', () => {
    const r = replayStockLedger([GBM_NVDA], { currency: 'USD' })
    expect(r.shares).toBe(0.34692423)
    const paid = 0.34692423 * 153.81 + 0.13
    expect(r.cost).toBeCloseTo(paid, 9)
    expect(r.avgCost).toBeCloseTo(paid / 0.34692423, 9)
    expect(r.avgCost).toBeGreaterThan(153.81)
    expect(r.costMXN).toBeCloseTo(paid * 18.5, 6)
  })

  it('adds fractional buys without float drift', () => {
    const r = replayStockLedger([
      { type: 'buy', shares: 0.1, price: 10 },
      { type: 'buy', shares: 0.2, price: 10 },
    ])
    expect(r.shares).toBe(0.3)
    expect(roundShares(0.1 + 0.2)).toBe(0.3)
  })

  it('a sell takes its share of the cost out and keeps the average', () => {
    const r = replayStockLedger([
      { type: 'buy', shares: 2, price: 100, commission: 1 },
      { type: 'sell', shares: 0.5, price: 120, commission: 0.3 },
    ])
    expect(r.shares).toBe(1.5)
    expect(r.avgCost).toBeCloseTo(100.5, 9)
    expect(r.cost).toBeCloseTo(150.75, 9)
  })

  it('selling everything resets shares and cost to zero', () => {
    const r = replayStockLedger([
      { type: 'buy', shares: 0.34692423, price: 153.81 },
      { type: 'sell', shares: 0.34692423, price: 160 },
    ])
    expect(r).toEqual({ shares: 0, cost: 0, costMXN: 0, avgCost: 0 })
  })

  it('converts an MXN-priced buy into a USD holding at that day’s rate', () => {
    const r = replayStockLedger([{ type: 'buy', shares: 1, price: 2000, price_currency: 'MXN', fx_usd_mxn: 20 }], { currency: 'USD' })
    expect(r.cost).toBeCloseTo(100, 9)
    expect(r.costMXN).toBeCloseTo(2000, 9)
  })

  it('an opening lot without its own rate uses the fallback rate for MXN', () => {
    const r = replayStockLedger([{ type: 'buy', shares: 1, price: 100, price_currency: 'USD', total: 100 }], { currency: 'USD', fallbackFx: 19 })
    expect(r.costMXN).toBeCloseTo(1900, 9)
  })

  it('txTotal: buys add the commission, sells subtract it, a stored total wins', () => {
    expect(txTotal({ type: 'buy', shares: 2, price: 10, commission: 1 })).toBe(21)
    expect(txTotal({ type: 'sell', shares: 2, price: 10, commission: 1 })).toBe(19)
    expect(txTotal({ type: 'buy', shares: 2, price: 10, commission: 1, total: '20.5' })).toBe(20.5)
  })

  it('needsOpeningCost: a balance with shares but no cost', () => {
    expect(needsOpeningCost({ shares: 3, avg_cost_basis: null })).toBe(true)
    expect(needsOpeningCost({ shares: 3, avg_cost_basis: 10 })).toBe(false)
    expect(needsOpeningCost({ shares: 0, avg_cost_basis: null })).toBe(false)
    expect(needsOpeningCost(undefined)).toBe(false)
  })

  it('recognises the missing-table answers from Postgres and PostgREST', () => {
    expect(isMissingStockTxTable({ code: '42P01', message: 'relation "finance_stock_transactions" does not exist' })).toBe(true)
    expect(isMissingStockTxTable({ code: 'PGRST205', message: "Could not find the table 'public.finance_stock_transactions' in the schema cache" })).toBe(true)
    expect(isMissingStockTxTable({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingStockTxTable(null)).toBe(false)
  })
})
