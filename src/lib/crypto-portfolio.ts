// Household view of the crypto portfolio: one row per coin, Bernardo's and
// Laura's holdings of that coin added together. Pure, so the tab and its
// tests share it.
import { holdingCoinId } from '@/lib/crypto-coins'
import { OWNERS, canonicalOwner, ownersEqual } from '@/lib/owners'

export interface PortfolioHolding {
  id: string
  symbol: string
  name?: string | null
  owner?: string | null
  quantity: number | string
  avg_cost_basis_usd?: number | string | null
  cost_currency?: string | null
  coingecko_id?: string | null
}

export type PortfolioPrices = Record<string, { usd: number; mxn: number; change24h?: number }>

export interface OwnerShare {
  owner: string
  /** First holding of this owner (stable key). */
  holdingId: string
  holdingIds: string[]
  quantity: number
  valueMXN: number
}

export interface CoinRow {
  symbol: string
  name: string
  /** Which coin the ticker is (its CoinGecko id), when known. */
  coingeckoId: string | null
  quantity: number
  /** Live MXN price, or null when the coin couldn't be priced. */
  priceMXN: number | null
  change24h: number | null
  valueMXN: number
  valueUSD: number
  costMXN: number
  /** Value minus cost over the holdings that have a cost basis; null when none do. */
  pl: number | null
  plPct: number | null
  /** Some held quantity has no cost basis, so P/L covers only part of the coin. */
  partialBasis: boolean
  /** Share of the portfolio's MXN value, 0–100. */
  sharePct: number
  owners: OwnerShare[]
  holdingIds: string[]
}

export interface CoinTotals {
  valueMXN: number
  valueUSD: number
  costMXN: number
  pl: number | null
  plPct: number | null
  /** Held coins with no cost basis anywhere (left out of P/L). */
  noBasis: string[]
  /** Held coins with no live price (value reads 0). */
  unpriced: string[]
}

export interface CoinBreakdown {
  rows: CoinRow[]
  totals: CoinTotals
  /** Coins whose household quantity is 0 (hidden unless includeEmpty). */
  emptyCount: number
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function holdingCost(h: PortfolioHolding, usdToMxn: number): number {
  const avg = num(h.avg_cost_basis_usd)
  if (avg <= 0) return 0
  return num(h.quantity) * ((h.cost_currency || 'MXN') === 'USD' ? avg * usdToMxn : avg)
}

const ownerRank = (owner: string) => {
  const i = OWNERS.findIndex(o => ownersEqual(o, owner))
  return i === -1 ? OWNERS.length : i
}

export function aggregateCoins(
  holdings: readonly PortfolioHolding[],
  prices: PortfolioPrices | null | undefined,
  usdToMxn: number,
  { includeEmpty = false }: { includeEmpty?: boolean } = {},
): CoinBreakdown {
  const groups = new Map<string, PortfolioHolding[]>()
  for (const h of holdings) {
    const symbol = String(h.symbol || '').toUpperCase()
    if (!symbol) continue
    groups.set(symbol, [...(groups.get(symbol) ?? []), h])
  }

  const all: Omit<CoinRow, 'sharePct'>[] = []
  for (const [symbol, rows] of groups) {
    const price = prices?.[symbol]
    const quantity = rows.reduce((s, h) => s + num(h.quantity), 0)
    const valueOf = (h: PortfolioHolding) => num(h.quantity) * (price?.mxn ?? 0)
    const valueMXN = rows.reduce((s, h) => s + valueOf(h), 0)
    const valueUSD = quantity * (price?.usd ?? 0)
    const withBasis = rows.filter(h => num(h.quantity) > 0 && num(h.avg_cost_basis_usd) > 0)
    const costMXN = withBasis.reduce((s, h) => s + holdingCost(h, usdToMxn), 0)
    const valueOnCost = withBasis.reduce((s, h) => s + valueOf(h), 0)
    const pl = costMXN > 0 && price ? valueOnCost - costMXN : null

    // One entry per owner (a duplicate holding of the same owner adds up).
    const byOwner = new Map<string, OwnerShare>()
    for (const h of rows) {
      const owner = canonicalOwner(h.owner ?? '') || OWNERS[0]
      const prev = byOwner.get(owner)
      byOwner.set(owner, {
        owner,
        holdingId: prev?.holdingId ?? h.id,
        holdingIds: [...(prev?.holdingIds ?? []), h.id],
        quantity: (prev?.quantity ?? 0) + num(h.quantity),
        valueMXN: (prev?.valueMXN ?? 0) + valueOf(h),
      })
    }

    all.push({
      symbol,
      name: rows.find(h => h.name)?.name || symbol,
      coingeckoId: rows.map(h => holdingCoinId(h)).find(Boolean) ?? null,
      quantity,
      priceMXN: price?.mxn ?? null,
      change24h: price?.change24h ?? null,
      valueMXN,
      valueUSD,
      costMXN,
      pl,
      plPct: pl !== null && costMXN > 0 ? (pl / costMXN) * 100 : null,
      partialBasis: costMXN > 0 && rows.some(h => num(h.quantity) > 0 && !(num(h.avg_cost_basis_usd) > 0)),
      owners: [...byOwner.values()].sort((a, b) => ownerRank(a.owner) - ownerRank(b.owner)),
      holdingIds: rows.map(h => h.id),
    })
  }

  const held = all.filter(r => r.quantity > 0)
  const visible = includeEmpty ? all : held
  const valueMXN = held.reduce((s, r) => s + r.valueMXN, 0)
  const valueUSD = held.reduce((s, r) => s + r.valueUSD, 0)
  const costMXN = held.reduce((s, r) => s + r.costMXN, 0)
  const valueOnCost = held.reduce((s, r) => s + (r.pl !== null ? r.pl + r.costMXN : 0), 0)
  const costPriced = held.reduce((s, r) => s + (r.pl !== null ? r.costMXN : 0), 0)
  const pl = costPriced > 0 ? valueOnCost - costPriced : null

  const rows: CoinRow[] = visible
    .map(r => ({ ...r, sharePct: valueMXN > 0 ? (r.valueMXN / valueMXN) * 100 : 0 }))
    .sort((a, b) => b.valueMXN - a.valueMXN || b.quantity - a.quantity || a.symbol.localeCompare(b.symbol))

  return {
    rows,
    totals: {
      valueMXN,
      valueUSD,
      costMXN,
      pl,
      plPct: pl !== null ? (pl / costPriced) * 100 : null,
      noBasis: held.filter(r => r.costMXN <= 0).map(r => r.symbol).sort(),
      unpriced: held.filter(r => r.priceMXN === null).map(r => r.symbol).sort(),
    },
    emptyCount: all.length - held.length,
  }
}

/**
 * The owners who actually hold some of the coin. An old holding emptied by
 * sells doesn't make its owner a holder; a coin at zero for everyone falls
 * back to every owner so it can still be removed.
 */
export function holdersOf(coin: Pick<CoinRow, 'owners'>): OwnerShare[] {
  const held = coin.owners.filter(o => o.quantity > 0)
  return held.length > 0 ? held : coin.owners
}

/** "B 1.71 · L 0.36": each owner's initial and quantity, in owner order. */
export function ownerSplitLabel(owners: readonly OwnerShare[], formatQty: (n: number) => string): string {
  return owners.filter(o => o.quantity > 0).map(o => `${o.owner.slice(0, 1).toUpperCase()} ${formatQty(o.quantity)}`).join(' · ')
}
