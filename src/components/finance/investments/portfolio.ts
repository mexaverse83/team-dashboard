// Pure portfolio math for the Investments page. Owner comparisons go through
// ownersEqual because the DB mixes casing ('bernardo' on real estate, stock and
// retirement rows, 'Bernardo' on fixed income) — F12.
import { accruedValue } from '@/lib/fixed-income'
import { OWNERS, ownersEqual } from '@/lib/owners'
import type {
  CryptoHoldingLite, CryptoPrices, FIGroup, FixedIncomeInstrument, OwnerFilter,
  RealEstateProperty, RetirementRecordLite, StockHolding,
} from './types'

export const FALLBACK_USD_MXN = 17.13

export function matchesOwner(owner: string | null | undefined, filter: OwnerFilter): boolean {
  return filter === 'All' || ownersEqual(owner, filter)
}

export function filterByOwner<T extends { owner: string | null | undefined }>(rows: readonly T[], filter: OwnerFilter): T[] {
  return filter === 'All' ? [...rows] : rows.filter(r => ownersEqual(r.owner, filter))
}

/** USD→MXN from any live coin quote (mxn/usd), else the fallback. */
export function usdMxnRate(prices: CryptoPrices | null | undefined): number {
  for (const p of Object.values(prices ?? {})) {
    if (p.usd > 0 && p.mxn > 0) return p.mxn / p.usd
  }
  return FALLBACK_USD_MXN
}

export function stockValueMXN(s: StockHolding, fxRate: number): number {
  if (s.asset_type === 'private_equity') return s.shares * (s.current_price_usd || 0) * fxRate
  return s.shares * s.avg_cost_basis
}

export function propertyEquity(p: RealEstateProperty): number {
  return (p.current_value || 0) - (p.mortgage_balance || 0)
}

export function cryptoValueMXN(h: CryptoHoldingLite, prices: CryptoPrices | null | undefined): number {
  return h.quantity * (prices?.[h.symbol]?.mxn ?? 0)
}

export function cryptoCostMXN(h: CryptoHoldingLite, usdToMxn: number): number {
  if (!h.avg_cost_basis_usd) return 0
  return h.quantity * (h.cost_currency === 'USD' ? h.avg_cost_basis_usd * usdToMxn : h.avg_cost_basis_usd)
}

const fiKey = (i: FixedIncomeInstrument) => `${i.institution}::${i.name.trim()}::${i.instrument_type}`

/** Same fund held by several owners → one card; `filtered` respects the owner filter. */
export function groupFixedIncome(rows: readonly FixedIncomeInstrument[], filter: OwnerFilter, now?: Date): FIGroup[] {
  const groups = new Map<string, FixedIncomeInstrument[]>()
  for (const inst of rows) {
    const key = fiKey(inst)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(inst)
  }
  const out: FIGroup[] = []
  for (const members of groups.values()) {
    const filtered = filterByOwner(members, filter)
    if (filtered.length === 0) continue
    out.push({
      representative: members[0],
      allMembers: members,
      filtered,
      totalPrincipal: filtered.reduce((s, i) => s + i.principal, 0),
      totalValue: filtered.reduce((s, i) => s + accruedValue(i, now), 0),
    })
  }
  return out
}

export interface OwnerSplit { a: number; b: number; aCount: number; bCount: number }

function split<T extends { owner: string }>(rows: readonly T[], value: (row: T) => number, count?: (rows: T[]) => number): OwnerSplit {
  const a = rows.filter(r => ownersEqual(r.owner, OWNERS[0]))
  const b = rows.filter(r => ownersEqual(r.owner, OWNERS[1]))
  return {
    a: a.reduce((s, r) => s + value(r), 0),
    b: b.reduce((s, r) => s + value(r), 0),
    aCount: count ? count(a) : a.length,
    bCount: count ? count(b) : b.length,
  }
}

export interface PortfolioInput {
  stocks: readonly StockHolding[]
  fixedIncome: readonly FixedIncomeInstrument[]
  realEstate: readonly RealEstateProperty[]
  crypto: readonly CryptoHoldingLite[]
  prices: CryptoPrices | null
  retirement: readonly RetirementRecordLite[]
  ownerFilter: OwnerFilter
  now?: Date
}

export function computePortfolio({ stocks, fixedIncome, realEstate, crypto, prices, retirement, ownerFilter, now }: PortfolioInput) {
  const fxRate = usdMxnRate(prices)
  const ownedStocks = filterByOwner(stocks, ownerFilter)
  const privateEquity = ownedStocks.filter(s => s.asset_type === 'private_equity')
  const publicStocks = ownedStocks.filter(s => s.asset_type !== 'private_equity')
  const fi = filterByOwner(fixedIncome, ownerFilter)
  const re = filterByOwner(realEstate, ownerFilter)
  const coins = filterByOwner(crypto, ownerFilter)
  const ret = filterByOwner(retirement, ownerFilter)

  const peTotal = privateEquity.reduce((s, h) => s + stockValueMXN(h, fxRate), 0)
  const publicTotal = publicStocks.reduce((s, h) => s + stockValueMXN(h, fxRate), 0)
  const stocksTotal = publicTotal + peTotal
  // fiCost = confirmed principal; fiTotal = estimate accrued since confirmation
  const fiCost = fi.reduce((s, i) => s + i.principal, 0)
  const fiTotal = fi.reduce((s, i) => s + accruedValue(i, now), 0)
  const reTotal = re.reduce((s, p) => s + propertyEquity(p), 0)
  const cryptoTotal = coins.reduce((s, h) => s + cryptoValueMXN(h, prices), 0)
  const cryptoCost = coins.reduce((s, h) => s + cryptoCostMXN(h, fxRate), 0)
  const retirementTotal = ret.reduce((s, r) => s + (r.current_balance || 0), 0)

  const total = cryptoTotal + stocksTotal + fiTotal + reTotal + retirementTotal
  // P&L only over classes with a real cost basis (crypto, public stocks, FI)
  const costBase = cryptoCost + publicTotal + fiCost
  const valueOnCost = cryptoTotal + publicTotal + fiTotal
  const pl = costBase > 0 ? valueOnCost - costBase : null
  const plPct = pl !== null && costBase > 0 ? (pl / costBase) * 100 : null

  const fiGroups = groupFixedIncome(fixedIncome, ownerFilter, now)

  return {
    fxRate,
    privateEquity,
    publicStocks,
    fixedIncome: fi,
    realEstate: re,
    fiGroups,
    totals: { crypto: cryptoTotal, stocks: stocksTotal, publicStocks: publicTotal, privateEquity: peTotal, fixedIncome: fiTotal, fixedIncomeCost: fiCost, realEstate: reTotal, retirement: retirementTotal, total },
    cryptoCost,
    pl,
    plPct,
    positions: {
      crypto: coins.filter(h => h.quantity > 0).length,
      stocks: ownedStocks.length,
      fixedIncome: fiGroups.length,
      realEstate: re.length,
      retirement: ret.length,
    },
    byOwner: {
      crypto: split([...crypto], h => cryptoValueMXN(h, prices), rows => rows.filter(h => h.quantity > 0).length),
      stocks: split([...stocks], h => stockValueMXN(h, fxRate)),
      fixedIncome: split([...fixedIncome], i => accruedValue(i, now), rows => new Set(rows.map(fiKey)).size),
      realEstate: split([...realEstate], propertyEquity),
      retirement: split([...retirement], r => r.current_balance || 0),
    },
  }
}

export type Portfolio = ReturnType<typeof computePortfolio>
