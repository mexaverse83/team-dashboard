// Stock holding ledger maths, shared by the transactions route, the stocks
// GET (MXN cost) and their tests. Pure.
//
// A holding keeps its cost in its own currency (the listing's: USD for NVDA,
// MXN for WALMEX.MX). Each transaction is priced in its own price_currency and
// carries the USD/MXN rate of its day, so the replay yields both the cost in
// the holding's currency (avg_cost_basis) and the cost in MXN at the rates
// actually paid (for MXN P/L).

export type PriceCurrency = 'USD' | 'MXN'

export interface StockTx {
  type: string
  shares: number | string
  price: number | string
  price_currency?: string | null
  fx_usd_mxn?: number | string | null
  commission?: number | string | null
  /** What was paid (buy) or received (sell), commission included, in price_currency. */
  total?: number | string | null
}

export interface StockReplay {
  shares: number
  /** Cost of the shares still held, in the holding's currency (commission included). */
  cost: number
  /** The same cost in MXN, each lot at its own day's rate. */
  costMXN: number
  /** Cost per share in the holding's currency; 0 when nothing is held. */
  avgCost: number
}

/** Shares are kept to 8 decimals (GBM sells 0.34692423 of a share). */
export const SHARE_DECIMALS = 8
export const SHARE_EPSILON = 1e-9

export const roundShares = (n: number) => Math.round(n * 1e8) / 1e8

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** The amount paid or received, commission included, in the transaction's currency. */
export function txTotal(tx: Pick<StockTx, 'type' | 'shares' | 'price' | 'commission' | 'total'>): number {
  if (tx.total !== undefined && tx.total !== null && tx.total !== '') return num(tx.total)
  const gross = num(tx.shares) * num(tx.price)
  const commission = num(tx.commission)
  return tx.type === 'sell' ? gross - commission : gross + commission
}

function convert(amount: number, from: PriceCurrency, to: PriceCurrency, fx: number): number {
  if (from === to) return amount
  if (!(fx > 0)) return 0
  return from === 'USD' ? amount * fx : amount / fx
}

const currencyOf = (c: unknown, fallback: PriceCurrency): PriceCurrency => (c === 'USD' || c === 'MXN' ? c : fallback)

/**
 * Replays a holding's transactions (oldest first) into shares and average
 * cost. Buys add their total (commission included) to the cost; sells take
 * out their share of the cost, leaving the average unchanged. `fallbackFx`
 * converts lots that carry no rate of their own (an opening balance).
 */
export function replayStockLedger(
  txs: readonly StockTx[],
  { currency = 'USD', fallbackFx = 0 }: { currency?: PriceCurrency; fallbackFx?: number } = {},
): StockReplay {
  let shares = 0
  let cost = 0
  let costMXN = 0
  for (const tx of txs) {
    const q = num(tx.shares)
    if (!(q > 0)) continue
    if (tx.type === 'buy') {
      const from = currencyOf(tx.price_currency, currency)
      const fx = num(tx.fx_usd_mxn) || fallbackFx
      const total = txTotal(tx)
      cost += convert(total, from, currency, fx)
      costMXN += convert(total, from, 'MXN', fx)
      shares = roundShares(shares + q)
    } else if (tx.type === 'sell') {
      if (shares > SHARE_EPSILON) {
        const frac = Math.min(1, q / shares)
        cost -= cost * frac
        costMXN -= costMXN * frac
      }
      shares = roundShares(shares - q)
      if (shares <= SHARE_EPSILON) { shares = 0; cost = 0; costMXN = 0 }
    }
  }
  return { shares, cost, costMXN, avgCost: shares > 0 ? cost / shares : 0 }
}

/**
 * A holding whose shares have no recorded cost (a balance entered without
 * one). Logging a buy against it would blend those shares in at 0 and show a
 * gain that doesn't exist, so the buy needs their cost first.
 */
export function needsOpeningCost(h: { shares: number | string | null; avg_cost_basis?: number | string | null } | null | undefined): boolean {
  if (!h) return false
  return num(h.shares) > SHARE_EPSILON && !(num(h.avg_cost_basis) > 0)
}

export const OPENING_COST_REQUIRED = 'opening_cost_required'
export const MIGRATION_PENDING = 'migration_pending'
export const PENDING_STOCK_MIGRATION_MESSAGE =
  'Database update pending: logging stock transactions needs supabase-2026-11-stock-transactions.sql applied first. You can still add a stock as a balance.'

interface DbError { code?: string | null; message?: string | null; details?: string | null; hint?: string | null }

/** PostgREST's answer when finance_stock_transactions doesn't exist yet. */
export function isMissingStockTxTable(error: DbError | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42P01' || error.code === 'PGRST205') return true
  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase()
  return text.includes('finance_stock_transactions') && (text.includes('does not exist') || text.includes('could not find'))
}
