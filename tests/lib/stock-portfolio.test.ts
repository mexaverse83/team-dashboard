import { describe, expect, it } from 'vitest'
import { aggregateStocks, publicStockValueMXN, stockCostMXN, valuePublicStocks, type StockHoldingLike } from '@/lib/stock-portfolio'
import { computePortfolio } from '@/components/finance/investments/portfolio'
import type { StockHolding } from '@/components/finance/investments/types'

const RATE = 18.5
const quotes = {
  NVDA: { price: 160, currency: 'USD' as const, change: 2, changePct: 1.27, usd: 160, mxn: 160 * RATE },
  VOO: { price: 600, currency: 'USD' as const, change: -3, changePct: -0.5, usd: 600, mxn: 600 * RATE },
}

const nvdaB: StockHoldingLike = { id: 'nb', ticker: 'NVDA', name: 'NVIDIA Corporation', owner: 'bernardo', shares: 0.34692423, avg_cost_basis: 154.19, currency: 'USD', asset_type: 'stock' }
const nvdaL: StockHoldingLike = { id: 'nl', ticker: 'NVDA', name: 'NVIDIA Corporation', owner: 'Laura', shares: 1, avg_cost_basis: 150, currency: 'USD', asset_type: 'stock', cost_mxn: 2_700 }
const vooL: StockHoldingLike = { id: 'vl', ticker: 'VOO', name: 'Vanguard S&P 500 ETF', owner: 'Laura', shares: 0.2, avg_cost_basis: 590, currency: 'USD', asset_type: 'etf' }
const walmex: StockHoldingLike = { id: 'w', ticker: 'WALMEX.MX', name: 'Walmex', owner: 'Laura', shares: 10, avg_cost_basis: 50, currency: 'MXN', asset_type: 'stock' }
const pe: StockHoldingLike = { id: 'pe', ticker: 'NXM', owner: 'bernardo', shares: 10000, avg_cost_basis: 0.5, currency: 'USD', asset_type: 'private_equity' }

describe('public stock valuation', () => {
  it('values at live price × shares in MXN', () => {
    expect(publicStockValueMXN(nvdaB, quotes, RATE)).toEqual({ valueMXN: 0.34692423 * 160 * RATE, priced: true })
  })

  it('without a price falls back to cost (flagged), never $0', () => {
    expect(publicStockValueMXN(walmex, quotes, RATE)).toEqual({ valueMXN: 500, priced: false })
    const v = valuePublicStocks([walmex, nvdaB], quotes, RATE)
    expect(v.unpriced).toEqual(['WALMEX.MX'])
    expect(v.valueMXN).toBeCloseTo(500 + 0.34692423 * 160 * RATE, 6)
    // P/L counts only the priced stock.
    expect(v.pricedCostMXN).toBeCloseTo(0.34692423 * 154.19 * RATE, 6)
  })

  it('MXN cost prefers the ledger’s (rates actually paid) over avg × today’s rate', () => {
    expect(stockCostMXN(nvdaL, RATE)).toBe(2_700)
    expect(stockCostMXN(nvdaB, RATE)).toBeCloseTo(0.34692423 * 154.19 * RATE, 6)
    expect(stockCostMXN(walmex, RATE)).toBe(500)
  })

  it('skips private equity entirely', () => {
    expect(valuePublicStocks([pe], quotes, RATE).valueMXN).toBe(0)
    expect(aggregateStocks([pe], quotes, RATE).rows).toEqual([])
  })
})

describe('aggregateStocks: one row per ticker', () => {
  const b = aggregateStocks([nvdaB, nvdaL, vooL, pe], quotes, RATE)

  it('adds both owners’ shares into one row with a B/L split, sorted by value', () => {
    expect(b.rows.map(r => r.ticker)).toEqual(['NVDA', 'VOO'])
    const nvda = b.rows[0]
    expect(nvda.shares).toBeCloseTo(1.34692423, 8)
    expect(nvda.owners.map(o => [o.owner, o.shares])).toEqual([['Bernardo', 0.34692423], ['Laura', 1]])
    expect(nvda.valueMXN).toBeCloseTo(1.34692423 * 160 * RATE, 6)
    expect(nvda.costMXN).toBeCloseTo(0.34692423 * 154.19 * RATE + 2_700, 6)
    expect(nvda.pl).toBeCloseTo(nvda.valueMXN - nvda.costMXN, 6)
    expect(nvda.changePct).toBe(1.27)
    expect(nvda.dayChangeMXN).toBeCloseTo(1.34692423 * 2 * RATE, 6)
  })

  it('totals add up and shares of the total sum to 100%', () => {
    expect(b.totals.valueMXN).toBeCloseTo(b.rows.reduce((s, r) => s + r.valueMXN, 0), 6)
    expect(b.rows.reduce((s, r) => s + r.sharePct, 0)).toBeCloseTo(100, 6)
    expect(b.totals.pl).toBeCloseTo(b.totals.valueMXN - b.totals.costMXN, 6)
    expect(b.totals.plPct).toBeCloseTo((b.totals.pl! / b.totals.costMXN) * 100, 6)
  })

  it('an unpriced ticker shows at cost and stays out of P/L', () => {
    const x = aggregateStocks([nvdaB, walmex], quotes, RATE)
    const w = x.rows.find(r => r.ticker === 'WALMEX.MX')!
    expect(w).toMatchObject({ priced: false, valueMXN: 500, pl: null, priceMXN: null })
    expect(x.totals.unpriced).toEqual(['WALMEX.MX'])
    expect(x.totals.pl).toBeCloseTo(x.rows.find(r => r.ticker === 'NVDA')!.pl!, 9)
  })

  it('keeps a ticker sold to 0 as a row (for its history) without counting it', () => {
    const x = aggregateStocks([{ ...vooL, shares: 0 }, nvdaB], quotes, RATE)
    expect(x.rows.map(r => r.ticker)).toEqual(['NVDA', 'VOO'])
    expect(x.rows[1]).toMatchObject({ shares: 0, valueMXN: 0 })
    expect(x.totals.unpriced).toEqual([])
  })
})

describe('computePortfolio with live stock quotes', () => {
  const asHolding = (h: StockHoldingLike): StockHolding => ({ exchange: 'US', broker: 'GBM', notes: null, name: h.ticker, ...h, owner: String(h.owner), shares: Number(h.shares), avg_cost_basis: Number(h.avg_cost_basis), currency: String(h.currency), asset_type: String(h.asset_type) } as StockHolding)
  const peRow = { ...asHolding(pe), current_price_usd: 2 } as StockHolding
  const base = { fixedIncome: [], realEstate: [], crypto: [], prices: { BTC: { usd: 1, mxn: 18 } }, retirement: [], ownerFilter: 'All' }

  it('values public stocks live and keeps private equity at its own estimate', () => {
    const p = computePortfolio({ ...base, stocks: [asHolding(nvdaB), peRow], stockQuotes: quotes, stockFx: RATE })
    expect(p.totals.publicStocks).toBeCloseTo(0.34692423 * 160 * RATE, 6)
    // PE: shares × current_price_usd × the crypto-implied rate, exactly as before.
    expect(p.totals.privateEquity).toBe(10000 * 2 * 18)
    expect(p.pl).toBeCloseTo(0.34692423 * (160 - 154.19) * RATE, 6)
    expect(p.stocksUnpriced).toEqual([])
    expect(p.byOwner.stocks.a).toBeCloseTo(p.totals.stocks, 6)
  })

  it('without quotes a public stock counts at cost and is named', () => {
    const p = computePortfolio({ ...base, stocks: [asHolding(nvdaB)], stockQuotes: {}, stockFx: RATE })
    expect(p.totals.publicStocks).toBeCloseTo(0.34692423 * 154.19 * RATE, 6)
    expect(p.stocksUnpriced).toEqual(['NVDA'])
    expect(p.pl).toBeNull()
  })
})
