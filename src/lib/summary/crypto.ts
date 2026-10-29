import type { CryptoPrices } from '@/lib/crypto-prices'
import { OWNERS, ownersEqual } from '@/lib/owners'

export interface CryptoHoldingRow {
  symbol: string
  quantity: number
  owner?: string | null
  avg_cost_basis_usd?: number | null
  cost_currency?: string | null
}

/** Coin quantity per symbol across both owners (drives crypto goal progress). */
export function cryptoQuantities(holdings: CryptoHoldingRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const h of holdings) {
    const sym = String(h.symbol || '').toUpperCase()
    if (!sym) continue
    out[sym] = (out[sym] || 0) + Number(h.quantity || 0)
  }
  return out
}

export function buildCryptoSummary(rows: CryptoHoldingRow[], prices: CryptoPrices | null) {
  const holdings = rows.filter(h => Number(h.quantity) > 0)
  if (holdings.length === 0) return null
  const p = prices ?? {}
  const ref = Object.values(p).find(x => x.usd > 0 && x.mxn > 0)
  const usdToMxn = ref ? ref.mxn / ref.usd : 17

  let totalValueMXN = 0, totalValueUSD = 0, totalCostMXN = 0
  const summaries = holdings.map(h => {
    const qty = Number(h.quantity)
    const costBasis = h.avg_cost_basis_usd
    const valueMXN = qty * (p[h.symbol]?.mxn ?? 0)
    const valueUSD = qty * (p[h.symbol]?.usd ?? 0)
    const costMXN = costBasis ? qty * ((h.cost_currency || 'MXN') === 'USD' ? costBasis * usdToMxn : costBasis) : 0
    totalValueMXN += valueMXN
    totalValueUSD += valueUSD
    totalCostMXN += costMXN
    return { symbol: h.symbol, qty, value_mxn: Math.round(valueMXN), owner: h.owner ?? null }
  })

  const bySymbol: Record<string, { qty: number; value_mxn: number }> = {}
  for (const h of summaries) {
    bySymbol[h.symbol] = bySymbol[h.symbol] || { qty: 0, value_mxn: 0 }
    bySymbol[h.symbol].qty += h.qty
    bySymbol[h.symbol].value_mxn += h.value_mxn
  }
  const agg = Object.entries(bySymbol).map(([symbol, d]) => ({
    symbol, qty: d.qty, value_mxn: d.value_mxn,
    allocation_pct: totalValueMXN > 0 ? Math.round(d.value_mxn / totalValueMXN * 100) : 0,
  })).sort((a, b) => b.value_mxn - a.value_mxn)

  const pnlMXN = totalCostMXN > 0 ? totalValueMXN - totalCostMXN : 0
  const pnlPct = totalCostMXN > 0 ? Math.round(pnlMXN / totalCostMXN * 1000) / 10 : 0
  const concentration = agg.find(h => h.allocation_pct > 80)

  return {
    total_value_mxn: Math.round(totalValueMXN),
    total_value_usd: Math.round(totalValueUSD * 100) / 100,
    total_cost_mxn: Math.round(totalCostMXN),
    pnl_mxn: Math.round(pnlMXN),
    pnl_pct: pnlPct,
    prices_available: prices != null,
    holdings: agg,
    by_owner: Object.fromEntries(OWNERS.map(owner => [owner, {
      value_mxn: summaries.filter(h => ownersEqual(h.owner, owner)).reduce((s, h) => s + h.value_mxn, 0),
    }])),
    risks: {
      concentration: concentration ? { symbol: concentration.symbol, pct: concentration.allocation_pct } : null,
      large_loss: pnlPct < -20 ? { pnl_pct: pnlPct } : null,
    },
  }
}
