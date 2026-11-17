// Server-side inputs for valuing public stocks: live quotes, the USD/MXN rate
// and each holding's MXN cost from its ledger. One loader for the stocks API,
// the net-worth snapshot and the investments audit, so they agree.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchStockQuotes, type StockQuotes } from '@/lib/stock-prices'
import { SHARE_EPSILON, isMissingStockTxTable, replayStockLedger, type StockTx } from '@/lib/stock-ledger'
import { isPublicStock } from '@/lib/stock-portfolio'

type Row = Record<string, unknown> & { id: string; ticker?: string | null; shares?: unknown; currency?: string | null; asset_type?: string | null }

export interface StockInputs<T extends Row> {
  /** The rows, public ones carrying `cost_mxn` when their ledger explains their shares. */
  rows: Array<T & { cost_mxn?: number | null }>
  quotes: StockQuotes
  usdMxn: number | null
  usdMxnSource: 'yahoo' | 'crypto' | null
  /** False until supabase-2026-11-stock-transactions.sql is applied. */
  ledgerReady: boolean
}

export async function loadStockInputs<T extends Row>(
  client: SupabaseClient,
  rows: readonly T[],
  { bust = false, withLedger = true }: { bust?: boolean; withLedger?: boolean } = {},
): Promise<StockInputs<T>> {
  const publicRows = rows.filter(r => isPublicStock(r))
  const tickers = publicRows.filter(r => Number(r.shares) > SHARE_EPSILON).map(r => String(r.ticker ?? '')).filter(Boolean)
  const none = { quotes: {} as StockQuotes, usdMxn: null, usdMxnSource: null }
  const quotesP = tickers.length === 0 ? Promise.resolve(none) : fetchStockQuotes(tickers, { bust }).catch(e => {
    console.error('Stock quotes failed:', e)
    return none
  })

  let ledgerReady = true
  const txsByHolding = new Map<string, StockTx[]>()
  if (withLedger && publicRows.length > 0) {
    try {
      const { data, error } = await client
        .from('finance_stock_transactions')
        .select('*')
        .in('holding_id', publicRows.map(r => r.id))
        .order('transaction_date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) {
        if (isMissingStockTxTable(error)) ledgerReady = false
        else console.error('Stock ledger read failed (MXN cost falls back to today’s rate):', error.message)
      } else {
        for (const tx of (data || []) as Array<StockTx & { holding_id: string }>) {
          txsByHolding.set(tx.holding_id, [...(txsByHolding.get(tx.holding_id) ?? []), tx])
        }
      }
    } catch (e) {
      // The MXN cost is a refinement: without the ledger it is derived from the average cost.
      console.error('Stock ledger read failed:', e)
    }
  }

  const { quotes, usdMxn, usdMxnSource } = await quotesP
  const out = rows.map(r => {
    const txs = txsByHolding.get(r.id)
    if (!txs || !isPublicStock(r)) return r
    const replay = replayStockLedger(txs, { currency: r.currency === 'MXN' ? 'MXN' : 'USD', fallbackFx: usdMxn ?? 0 })
    // Only when the ledger explains the shares held (a hand-edited balance doesn't).
    const consistent = Math.abs(replay.shares - (Number(r.shares) || 0)) <= 1e-6
    return { ...r, cost_mxn: consistent && replay.costMXN > 0 ? replay.costMXN : null }
  })
  return { rows: out, quotes, usdMxn, usdMxnSource, ledgerReady }
}
