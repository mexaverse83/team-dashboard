'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import type { StockSearchResult } from '@/lib/stock-search'
import { needsOpeningCost } from '@/lib/stock-ledger'
import { formatCoinPrice } from '@/lib/format'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { cn } from '@/lib/utils'
import { TickerBadge, formatShares } from './ticker-badge'
import { OwnerPicker, TradeFields, emptyTrade, inputClass, labelClass, tradeNumbers, tradePayload, DEFAULT_BROKER, type TradeForm } from './trade-fields'

export interface AddStockHolding {
  id: string
  ticker: string
  name: string
  owner: string
  shares: number
  avg_cost_basis: number | null
  currency?: string | null
  asset_type?: string | null
}

interface AddStockModalProps {
  open: boolean
  onClose: () => void
  /** Public holdings (both owners), to log onto an existing one. */
  holdings: readonly AddStockHolding[]
  quotes: Record<string, { price?: number; currency?: string; mxn: number; usd: number }>
  usdToMxn: number
  defaultOwner: string
  /** False until the stock-transactions migration is applied: only balances can be added. */
  ledgerReady: boolean
  onDone: () => void | Promise<void>
}

export function AddStockModal(props: AddStockModalProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Add a stock">
      {props.open && <AddStockBody {...props} />}
    </Modal>
  )
}

type Mode = 'buy' | 'balance'

async function failWith(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => null)
  throw new Error(body?.error || fallback)
}

function AddStockBody({ onClose, holdings, quotes, usdToMxn, defaultOwner, ledgerReady, onDone }: AddStockModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [picked, setPicked] = useState<StockSearchResult | null>(null)
  const [owner, setOwner] = useState(OWNERS.find(o => ownersEqual(o, defaultOwner)) ?? OWNERS[0])
  const [mode, setMode] = useState<Mode>(ledgerReady ? 'buy' : 'balance')
  const [trade, setTrade] = useState<TradeForm>(() => emptyTrade())
  const [balanceShares, setBalanceShares] = useState('')
  const [avgCost, setAvgCost] = useState('')
  const [broker, setBroker] = useState(DEFAULT_BROKER)
  const [openingCost, setOpeningCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Debounced search; a newer keystroke aborts the older request.
  useEffect(() => {
    const q = query.trim()
    if (!q) return
    const ctrl = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true); setSearchError(null)
      try {
        const res = await fetch(`/api/finance/investments/stocks/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error || 'Search failed')
        setResults(body?.results ?? [])
      } catch (e) {
        if (ctrl.signal.aborted) return
        setSearchError(e instanceof Error ? e.message : 'Search failed')
        setResults(null)
      } finally {
        if (!ctrl.signal.aborted) setSearching(false)
      }
    }, 300)
    return () => { ctrl.abort(); window.clearTimeout(timer) }
  }, [query])

  // Before typing: the tickers you already hold.
  const held: StockSearchResult[] = [...new Map(holdings.map(h => [h.ticker, {
    symbol: h.ticker, name: h.name || h.ticker, exchange: h.ticker.endsWith('.MX') ? 'Mexico' : 'US',
    type: h.asset_type === 'etf' ? 'etf' as const : 'stock' as const, currency: h.currency === 'MXN' ? 'MXN' as const : 'USD' as const,
  }])).values()]

  const pick = (r: StockSearchResult) => {
    setPicked(r); setError(null)
    setTrade(t => ({ ...t, currency: r.currency }))
  }

  const existing = picked ? holdings.find(h => h.ticker === picked.symbol && ownersEqual(h.owner, owner)) : undefined
  const effectiveMode: Mode = existing ? 'buy' : mode
  const existingUnbased = needsOpeningCost(existing)
  const quote = picked ? quotes[picked.symbol] : undefined
  const nowHint = quote?.price && picked ? formatCoinPrice(quote.price, { currency: picked.currency, suffix: true }) : null

  const t = tradeNumbers(trade, 'buy')
  const sharesNum = parseFloat(balanceShares)
  const openingCostNum = parseFloat(openingCost)
  const canSave = !!picked && (effectiveMode === 'buy'
    ? ledgerReady && t.valid && (!existingUnbased || openingCostNum > 0)
    : sharesNum > 0)

  const save = async () => {
    if (!picked || !canSave) return
    setSaving(true); setError(null)
    const json = { 'Content-Type': 'application/json' }
    try {
      let holdingId = existing?.id
      let created = false
      if (!holdingId) {
        const avg = parseFloat(avgCost)
        const res = await fetch('/api/finance/investments/stocks', {
          method: 'POST', headers: json,
          body: JSON.stringify({
            ticker: picked.symbol,
            name: picked.name,
            exchange: picked.exchange,
            asset_type: picked.type,
            currency: picked.currency,
            owner,
            shares: effectiveMode === 'balance' ? sharesNum : 0,
            broker: (effectiveMode === 'balance' ? broker : trade.broker).trim() || null,
            ...(effectiveMode === 'balance' && avg > 0 ? { avg_cost_basis: avg } : {}),
          }),
        })
        if (!res.ok) await failWith(res, 'Couldn’t add the stock')
        holdingId = (await res.json()).id
        created = true
      }
      if (effectiveMode === 'buy') {
        const res = await fetch('/api/finance/investments/stocks/transactions', {
          method: 'POST', headers: json,
          body: JSON.stringify({ holding_id: holdingId, ...tradePayload(trade, 'buy'), ...(existingUnbased ? { opening_cost_per_share: openingCostNum } : {}) }),
        })
        if (!res.ok) {
          // Don't leave an empty position behind when the first buy failed.
          if (created) await fetch('/api/finance/investments/stocks', { method: 'DELETE', headers: json, body: JSON.stringify({ id: holdingId }) }).catch(() => {})
          await failWith(res, 'Couldn’t log the buy')
        }
      }
      await onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!picked) {
    const list = query.trim() ? results : held
    return (
      <div className="space-y-3">
        <label htmlFor="stock-search" className="sr-only">Search stocks</label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-tertiary" />
          <input id="stock-search" type="search" autoFocus autoComplete="off" placeholder="Search a company or ticker (e.g. Nvidia, VOO)"
            value={query} onChange={e => setQuery(e.target.value)} className={cn(inputClass, 'pl-9')} />
        </div>
        {!query.trim() && (
          <p className="text-label text-fg-tertiary">
            {held.length > 0 ? 'Your stocks, or search any US or Mexican listed stock or ETF.' : 'Search any US or Mexican listed stock or ETF (Yahoo Finance).'}
          </p>
        )}
        {searching && <p role="status" className="text-label text-fg-secondary">Searching…</p>}
        {searchError && <p role="alert" className="text-label text-negative">{searchError}</p>}
        {query.trim() && list && list.length === 0 && !searching && <p className="text-label text-fg-secondary">No US or Mexican stocks match “{query.trim()}”.</p>}
        {list && list.length > 0 && (
          <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label="Stocks">
            {list.map(r => (
              <li key={r.symbol}>
                <button type="button" onClick={() => pick(r)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                  <TickerBadge ticker={r.symbol} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{r.name}</span>
                    <span className="block text-label text-fg-tertiary">{r.symbol} · {r.exchange}{r.type === 'etf' ? ' · ETF' : ''}</span>
                  </span>
                  <span className="shrink-0 text-label text-fg-tertiary">{r.currency}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <TickerBadge ticker={picked.symbol} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{picked.name}</p>
          <p className="text-label text-fg-tertiary">{picked.symbol} · {picked.exchange}{nowHint ? ` · now ${nowHint}` : ''}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setError(null) }}>Change</Button>
      </div>

      <div>
        <p className="mb-1.5 text-label font-medium text-fg-secondary">Whose is it?</p>
        <OwnerPicker value={owner} onChange={setOwner} label="Owner" />
      </div>

      {existing ? (
        <>
          <p className="text-label text-fg-secondary">{owner} already holds {formatShares(existing.shares)} {picked.symbol}; this logs another buy.</p>
          {existingUnbased && (
            <div>
              <label htmlFor="add-stock-opening-cost" className={labelClass}>
                What did the {formatShares(existing.shares)} {picked.symbol} already held cost per share ({existing.currency === 'MXN' ? 'MXN' : 'USD'})? *
              </label>
              <input id="add-stock-opening-cost" type="number" inputMode="decimal" step="any" min="0" value={openingCost}
                onChange={e => setOpeningCost(e.target.value)} className={cn(inputClass, 'tabular-nums font-mono')} />
              <p className="mt-1 text-label text-fg-tertiary">That balance has no cost yet; without it the P/L would count those shares as free.</p>
            </div>
          )}
        </>
      ) : (
        <Segmented ariaLabel="How to add it" fullWidth value={mode} onChange={setMode}
          options={[{ value: 'buy', label: 'Log the first buy', disabled: !ledgerReady }, { value: 'balance', label: 'Enter a balance' }]} />
      )}

      {!ledgerReady && (
        <p role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-label text-warning">
          Logging buys needs a database update (supabase-2026-11-stock-transactions.sql). For now, enter the shares you hold as a balance.
        </p>
      )}

      {effectiveMode === 'buy' ? (
        ledgerReady && <TradeFields idPrefix="add-stock" form={trade} onChange={setTrade} type="buy" usdToMxn={usdToMxn} nowHint={nowHint} showNotes={false} />
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="add-stock-shares" className={labelClass}>Shares held *</label>
            <input id="add-stock-shares" type="number" inputMode="decimal" step="any" min="0" placeholder="0.34692423" value={balanceShares}
              onChange={e => setBalanceShares(e.target.value)} className={cn(inputClass, 'num font-mono')} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="add-stock-cost" className={labelClass}>Average cost per share ({picked.currency})</label>
              <input id="add-stock-cost" type="number" inputMode="decimal" step="any" min="0" placeholder="Optional — needed for P/L" value={avgCost}
                onChange={e => setAvgCost(e.target.value)} className={cn(inputClass, 'tabular-nums font-mono')} />
            </div>
            <div>
              <label htmlFor="add-stock-broker" className={labelClass}>Broker</label>
              <input id="add-stock-broker" type="text" value={broker} onChange={e => setBroker(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={save} disabled={saving || !canSave}>
          {saving ? 'Saving…' : effectiveMode === 'buy' ? (existing ? 'Log buy' : 'Add & log buy') : 'Add stock'}
        </Button>
      </div>
    </div>
  )
}
