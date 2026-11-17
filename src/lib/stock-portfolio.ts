// Valuation of public stocks, shared by the Stocks tab, the Portfolio tab,
// the net-worth snapshot and the investments audit. Pure.
//
// A public stock is worth shares × the live price (in MXN). Without a price
// it falls back to its cost and says so ("at cost"), never $0. Private equity
// (asset_type 'private_equity') is valued elsewhere and never live-priced.
import { OWNERS, canonicalOwner, ownersEqual } from '@/lib/owners'
import type { StockQuote } from '@/lib/stock-prices'
import { SHARE_EPSILON } from '@/lib/stock-ledger'

export interface StockHoldingLike {
  id: string
  ticker: string
  name?: string | null
  owner?: string | null
  shares: number | string
  /** Cost per share in `currency`, commission included. */
  avg_cost_basis?: number | string | null
  currency?: string | null
  asset_type?: string | null
  exchange?: string | null
  /** MXN cost at the rates actually paid, from the ledger (stocks GET); else derived. */
  cost_mxn?: number | string | null
}

export type QuoteMap = Record<string, Pick<StockQuote, 'mxn' | 'usd'> & Partial<StockQuote>>

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export const isPrivateEquity = (h: { asset_type?: string | null }) => h.asset_type === 'private_equity'
export const isPublicStock = (h: { asset_type?: string | null }) => !isPrivateEquity(h)

export function quoteFor(h: Pick<StockHoldingLike, 'ticker' | 'asset_type'>, quotes: QuoteMap | null | undefined) {
  if (isPrivateEquity(h)) return null
  const q = quotes?.[String(h.ticker || '').toUpperCase()]
  return q && q.mxn > 0 ? q : null
}

/** What the held shares cost, in MXN; 0 when there is no cost basis. */
export function stockCostMXN(h: StockHoldingLike, usdMxn: number): number {
  const shares = num(h.shares)
  if (!(shares > SHARE_EPSILON)) return 0
  const ledger = num(h.cost_mxn)
  if (ledger > 0) return ledger
  const avg = num(h.avg_cost_basis)
  if (!(avg > 0)) return 0
  return shares * avg * (h.currency === 'USD' ? usdMxn : 1)
}

export interface PublicStockValue {
  valueMXN: number
  /** True when valued at a live price; false = at cost (or 0 without a cost). */
  priced: boolean
}

export function publicStockValueMXN(h: StockHoldingLike, quotes: QuoteMap | null | undefined, usdMxn: number): PublicStockValue {
  const q = quoteFor(h, quotes)
  const shares = num(h.shares)
  if (q) return { valueMXN: shares * q.mxn, priced: true }
  return { valueMXN: stockCostMXN(h, usdMxn), priced: false }
}

export interface PublicStocksValuation {
  valueMXN: number
  costMXN: number
  /** Value and cost of the priced holdings only (for P/L). */
  pricedValueMXN: number
  pricedCostMXN: number
  /** Held tickers without a live price: valued at cost. */
  unpriced: string[]
}

export function valuePublicStocks(rows: readonly StockHoldingLike[], quotes: QuoteMap | null | undefined, usdMxn: number): PublicStocksValuation {
  const out: PublicStocksValuation = { valueMXN: 0, costMXN: 0, pricedValueMXN: 0, pricedCostMXN: 0, unpriced: [] }
  const unpriced = new Set<string>()
  for (const h of rows) {
    if (!isPublicStock(h) || !(num(h.shares) > SHARE_EPSILON)) continue
    const { valueMXN, priced } = publicStockValueMXN(h, quotes, usdMxn)
    const cost = stockCostMXN(h, usdMxn)
    out.valueMXN += valueMXN
    out.costMXN += cost
    if (priced && cost > 0) { out.pricedValueMXN += valueMXN; out.pricedCostMXN += cost }
    if (!priced) unpriced.add(String(h.ticker).toUpperCase())
  }
  out.unpriced = [...unpriced].sort()
  return out
}

// ─── Household view: one row per ticker ───────────────────────────────────

export interface StockOwnerShare {
  owner: string
  holdingId: string
  holdingIds: string[]
  shares: number
  valueMXN: number
  costMXN: number
}

export interface StockRow {
  ticker: string
  name: string
  exchange: string | null
  /** The holding's (listing's) currency. */
  currency: 'USD' | 'MXN'
  assetType: string
  shares: number
  priceMXN: number | null
  priceUSD: number | null
  /** Day change in percent, and in MXN for the shares held. */
  changePct: number | null
  dayChangeMXN: number | null
  /** Live value, or cost when unpriced (see `priced`). */
  valueMXN: number
  priced: boolean
  costMXN: number
  pl: number | null
  plPct: number | null
  /** Cost of the priced holdings that have a basis (the P/L base). */
  plCostMXN: number
  /** Share of the household's public-stock value, 0–100. */
  sharePct: number
  owners: StockOwnerShare[]
  holdingIds: string[]
}

export interface StockTotals {
  valueMXN: number
  costMXN: number
  pl: number | null
  plPct: number | null
  dayChangeMXN: number | null
  unpriced: string[]
  noBasis: string[]
}

export interface StockBreakdown {
  rows: StockRow[]
  totals: StockTotals
}

const ownerRank = (owner: string) => {
  const i = OWNERS.findIndex(o => ownersEqual(o, owner))
  return i === -1 ? OWNERS.length : i
}

/** Public holdings (private equity is skipped) grouped by ticker, sorted by value. */
export function aggregateStocks(holdings: readonly StockHoldingLike[], quotes: QuoteMap | null | undefined, usdMxn: number): StockBreakdown {
  const groups = new Map<string, StockHoldingLike[]>()
  for (const h of holdings) {
    if (!isPublicStock(h)) continue
    const ticker = String(h.ticker || '').toUpperCase()
    if (!ticker) continue
    groups.set(ticker, [...(groups.get(ticker) ?? []), h])
  }

  const all: Array<Omit<StockRow, 'sharePct'>> = []
  for (const [ticker, rows] of groups) {
    // Holdings sold down to 0 stay listed (muted) so their history can be removed.
    const held = rows.filter(h => num(h.shares) > SHARE_EPSILON)
    const q = quoteFor(rows[0], quotes)
    const shares = held.reduce((s, h) => s + num(h.shares), 0)
    const costMXN = held.reduce((s, h) => s + stockCostMXN(h, usdMxn), 0)
    const valueMXN = held.reduce((s, h) => s + publicStockValueMXN(h, quotes, usdMxn).valueMXN, 0)
    const pricedCost = q ? held.filter(h => stockCostMXN(h, usdMxn) > 0) : []
    const plCost = pricedCost.reduce((s, h) => s + stockCostMXN(h, usdMxn), 0)
    const plValue = pricedCost.reduce((s, h) => s + num(h.shares) * (q?.mxn ?? 0), 0)
    const pl = q && plCost > 0 ? plValue - plCost : null
    const changePct = q?.changePct ?? null
    // Day change in MXN: today's move on the shares held, at today's rate.
    const dayChangeMXN = q && q.change != null && q.price ? shares * q.change * (q.mxn / q.price) : null

    const byOwner = new Map<string, StockOwnerShare>()
    for (const h of rows) {
      const owner = canonicalOwner(h.owner ?? '') || OWNERS[0]
      const prev = byOwner.get(owner)
      byOwner.set(owner, {
        owner,
        holdingId: prev?.holdingId ?? h.id,
        holdingIds: [...(prev?.holdingIds ?? []), h.id],
        shares: (prev?.shares ?? 0) + Math.max(0, num(h.shares)),
        valueMXN: (prev?.valueMXN ?? 0) + (num(h.shares) > SHARE_EPSILON ? publicStockValueMXN(h, quotes, usdMxn).valueMXN : 0),
        costMXN: (prev?.costMXN ?? 0) + stockCostMXN(h, usdMxn),
      })
    }

    const first = rows.find(h => h.name) ?? rows[0]
    all.push({
      ticker,
      name: first.name || ticker,
      exchange: first.exchange ?? null,
      currency: (q?.currency ?? first.currency) === 'MXN' ? 'MXN' : 'USD',
      assetType: first.asset_type || 'stock',
      shares,
      priceMXN: q?.mxn ?? null,
      priceUSD: q && q.usd > 0 ? q.usd : null,
      changePct,
      dayChangeMXN,
      valueMXN,
      priced: !!q,
      costMXN,
      pl,
      plPct: pl !== null && plCost > 0 ? (pl / plCost) * 100 : null,
      plCostMXN: pl !== null ? plCost : 0,
      owners: [...byOwner.values()].sort((a, b) => ownerRank(a.owner) - ownerRank(b.owner)),
      holdingIds: rows.map(h => h.id),
    })
  }

  const valueMXN = all.reduce((s, r) => s + r.valueMXN, 0)
  const costMXN = all.reduce((s, r) => s + r.costMXN, 0)
  const plRows = all.filter(r => r.pl !== null)
  const plCost = plRows.reduce((s, r) => s + r.plCostMXN, 0)
  const pl = plRows.length > 0 ? plRows.reduce((s, r) => s + r.pl!, 0) : null
  const held = all.filter(r => r.shares > SHARE_EPSILON)
  const dayRows = all.filter(r => r.dayChangeMXN !== null)

  const rows: StockRow[] = all
    .map(r => ({ ...r, sharePct: valueMXN > 0 ? (r.valueMXN / valueMXN) * 100 : 0 }))
    .sort((a, b) => b.valueMXN - a.valueMXN || b.shares - a.shares || a.ticker.localeCompare(b.ticker))

  return {
    rows,
    totals: {
      valueMXN,
      costMXN,
      pl,
      plPct: pl !== null && plCost > 0 ? (pl / plCost) * 100 : null,
      dayChangeMXN: dayRows.length > 0 ? dayRows.reduce((s, r) => s + r.dayChangeMXN!, 0) : null,
      unpriced: held.filter(r => !r.priced).map(r => r.ticker).sort(),
      noBasis: held.filter(r => r.costMXN <= 0).map(r => r.ticker).sort(),
    },
  }
}

/** The owners who hold some of the ticker (every owner of its rows when none does). */
export function stockHolders(row: Pick<StockRow, 'owners'>): StockOwnerShare[] {
  const held = row.owners.filter(o => o.shares > SHARE_EPSILON)
  return held.length > 0 ? held : row.owners
}
