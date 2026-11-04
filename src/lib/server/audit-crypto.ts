// The investments audit's crypto summary. A coin with no live price is left
// out of value, cost and P&L (as the Crypto tab and the home summary do): its
// cost against a $0 value would read as an unrealized loss during a price
// outage, and would raise a false "large loss" finding.

export interface AuditCryptoRow {
  symbol: string
  quantity: number | string | null
  avg_cost_basis_usd?: number | string | null
  cost_currency?: string | null
}

export function summarizeAuditCrypto(
  holdings: readonly AuditCryptoRow[],
  prices: Record<string, { mxn?: number } | undefined>,
  usdMxn: number,
) {
  let totalMXN = 0; let totalCost = 0
  const unpriced = new Set<string>()
  const holdingsSummary = holdings.map(h => {
    const qty = Number(h.quantity) || 0
    const price = prices[h.symbol]?.mxn || 0
    const priced = price > 0
    if (!priced && qty > 0) unpriced.add(h.symbol)
    const basis = Number(h.avg_cost_basis_usd) || 0
    const value = qty * price
    // The basis is in cost_currency (MXN unless the row says USD).
    const cost = priced ? qty * (h.cost_currency === 'USD' ? basis * usdMxn : basis) : 0
    totalMXN += value; totalCost += cost
    return { symbol: h.symbol, qty: h.quantity, value, cost, priced, allocation_pct: 0 }
  })
  holdingsSummary.forEach(h => { h.allocation_pct = totalMXN > 0 ? (h.value / totalMXN) * 100 : 0 })
  const pnlPct = totalCost > 0 ? ((totalMXN - totalCost) / totalCost) * 100 : 0
  // A share of only part of the coins would overstate one coin's weight.
  const maxCoin = unpriced.size > 0 ? undefined : holdingsSummary.reduce((a, b) => a.allocation_pct > b.allocation_pct ? a : b, holdingsSummary[0])

  return {
    total_value_mxn: totalMXN,
    total_cost_mxn: totalCost,
    pnl_mxn: totalMXN - totalCost,
    pnl_pct: pnlPct.toFixed(1),
    holdings: holdingsSummary,
    /** Held coins with no live price: valued at 0 and left out of cost and P&L. */
    unpriced: [...unpriced].sort(),
    risks: {
      concentration: maxCoin && maxCoin.allocation_pct > 70 ? { symbol: maxCoin.symbol, pct: maxCoin.allocation_pct.toFixed(1) } : null,
      large_loss: pnlPct < -25 ? { pnl_pct: pnlPct.toFixed(1) } : null,
    },
  }
}
