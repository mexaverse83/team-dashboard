// Crypto holding ledger maths, shared by the transactions route and its tests.

export interface HoldingTx { type: string; quantity: number | string; price_per_coin_mxn: number | string; total_mxn?: number | string | null }

/** Replays a holding's transactions (oldest first) into its quantity and MXN cost basis. */
export function replayHolding(txs: HoldingTx[]) {
  let qty = 0
  let totalCost = 0
  for (const tx of txs) {
    const q = Number(tx.quantity) || 0
    if (tx.type === 'buy') {
      // total_mxn is the exact amount paid; price_per_coin_mxn may be rounded
      totalCost += Number(tx.total_mxn ?? q * Number(tx.price_per_coin_mxn))
      qty += q
    } else {
      // sell — proportionally reduce cost basis
      if (qty > 0) totalCost -= (totalCost / qty) * q
      qty -= q
      if (qty <= 0) { qty = 0; totalCost = 0 }
    }
  }
  return { qty, totalCost }
}
