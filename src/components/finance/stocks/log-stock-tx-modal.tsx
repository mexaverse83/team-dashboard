'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { needsOpeningCost } from '@/lib/stock-ledger'
import { formatCoinPrice } from '@/lib/format'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { cn } from '@/lib/utils'
import { TickerBadge, formatShares } from './ticker-badge'
import { OwnerPicker, TradeFields, emptyTrade, inputClass, labelClass, tradeNumbers, tradePayload, type TradeForm } from './trade-fields'
import type { AddStockHolding } from './add-stock-modal'

export interface LogTarget {
  ticker?: string
  owner?: string
  type?: 'buy' | 'sell'
}

interface LogStockTxModalProps {
  target: LogTarget | null
  onClose: () => void
  holdings: readonly (AddStockHolding & { exchange?: string | null })[]
  quotes: Record<string, { price?: number; currency?: string; mxn: number; usd: number }>
  usdToMxn: number
  onAddStock: () => void
  onDone: () => void | Promise<void>
}

export function LogStockTxModal(props: LogStockTxModalProps) {
  return (
    <Modal open={props.target !== null} onClose={props.onClose} title="Log transaction">
      {props.target && <LogBody key={`${props.target.ticker}:${props.target.owner}:${props.target.type}`} {...props} target={props.target} />}
    </Modal>
  )
}

function LogBody({ target, onClose, holdings, quotes, usdToMxn, onAddStock, onDone }: LogStockTxModalProps & { target: LogTarget }) {
  const tickers = [...new Set(holdings.map(h => h.ticker))]
  const [ticker, setTicker] = useState(target.ticker ?? tickers[0] ?? '')
  const [owner, setOwner] = useState(OWNERS.find(o => ownersEqual(o, target.owner)) ?? OWNERS[0])
  const [type, setType] = useState<'buy' | 'sell'>(target.type ?? 'buy')
  const sample = holdings.find(h => h.ticker === ticker)
  const listing: 'USD' | 'MXN' = sample?.currency === 'MXN' ? 'MXN' : 'USD'
  const [trade, setTrade] = useState<TradeForm>(() => emptyTrade(listing))
  const [openingCost, setOpeningCost] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const holding = holdings.find(h => h.ticker === ticker && ownersEqual(h.owner, owner))
  const unbased = type === 'buy' && needsOpeningCost(holding)
  const t = tradeNumbers(trade, type)
  const quote = quotes[ticker]
  const nowHint = quote?.price ? formatCoinPrice(quote.price, { currency: listing, suffix: true }) : null
  const tooMany = type === 'sell' && holding ? t.shares > holding.shares + 1e-9 : false
  const canSave = !!ticker && t.valid && (type === 'buy' || (!!holding && holding.shares > 0 && !tooMany)) && (!unbased || parseFloat(openingCost) > 0)

  const pickTicker = (next: string) => {
    setTicker(next)
    const cur = holdings.find(h => h.ticker === next)?.currency === 'MXN' ? 'MXN' : 'USD'
    setTrade(f => ({ ...f, currency: cur }))
  }

  const save = async () => {
    if (!canSave || !sample) return
    setSaving(true); setError(null)
    const json = { 'Content-Type': 'application/json' }
    try {
      let holdingId = holding?.id
      let created = false
      if (!holdingId) {
        // A buy for the owner who doesn't hold it yet: same stock as the other owner's.
        const res = await fetch('/api/finance/investments/stocks', {
          method: 'POST', headers: json,
          body: JSON.stringify({ ticker, name: sample.name, exchange: sample.exchange ?? undefined, asset_type: sample.asset_type ?? 'stock', currency: listing, owner, shares: 0, broker: trade.broker.trim() || null }),
        })
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error || 'Couldn’t create the holding')
        holdingId = body.id
        created = true
      }
      const res = await fetch('/api/finance/investments/stocks/transactions', {
        method: 'POST', headers: json,
        body: JSON.stringify({ holding_id: holdingId, ...tradePayload(trade, type), ...(unbased ? { opening_cost_per_share: parseFloat(openingCost) } : {}) }),
      })
      if (!res.ok) {
        if (created) await fetch('/api/finance/investments/stocks', { method: 'DELETE', headers: json, body: JSON.stringify({ id: holdingId }) }).catch(() => {})
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Couldn’t save the transaction. Try again.')
      }
      await onDone()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the transaction. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (tickers.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-fg-secondary">There are no stocks to log against yet. Add one first.</p>
        <Button className="w-full" onClick={() => { onClose(); onAddStock() }}>Add stock</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Segmented ariaLabel="Transaction type" fullWidth value={type} onChange={setType}
        options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
      <fieldset>
        <legend className="mb-1.5 text-label font-medium text-fg-secondary">Stock</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Stock">
          {tickers.map(s => (
            <button key={s} type="button" role="radio" aria-checked={ticker === s} onClick={() => pickTicker(s)}
              className={cn('flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-2 text-sm font-medium transition-colors',
                ticker === s ? 'border-border-strong bg-surface-3 text-fg' : 'border-border bg-surface-2 text-fg-secondary hover:text-fg')}>
              <TickerBadge ticker={s} size={22} /> <span className="truncate font-mono">{s}</span>
            </button>
          ))}
        </div>
        <button type="button" className="mt-2 min-h-11 text-label font-medium text-fg-secondary underline-offset-2 hover:text-fg hover:underline sm:min-h-0"
          onClick={() => { onClose(); onAddStock() }}>
          Another stock? Search and add it
        </button>
      </fieldset>
      <div>
        <p className="mb-1.5 text-label font-medium text-fg-secondary">Owner</p>
        <OwnerPicker value={owner} onChange={setOwner} />
        {holding
          ? <p className="mt-1 text-label text-fg-tertiary">{owner} holds {formatShares(holding.shares)} {ticker}.</p>
          : <p className="mt-1 text-label text-fg-tertiary">{owner} doesn’t hold {ticker} yet{type === 'buy' ? '; this buy starts the position.' : '.'}</p>}
      </div>
      {unbased && holding && (
        <div>
          <label htmlFor="log-stock-opening-cost" className={labelClass}>
            What did the {formatShares(holding.shares)} {ticker} already held cost per share ({listing})? *
          </label>
          <input id="log-stock-opening-cost" type="number" inputMode="decimal" step="any" min="0" value={openingCost}
            onChange={e => setOpeningCost(e.target.value)} className={cn(inputClass, 'tabular-nums font-mono')} />
          <p className="mt-1 text-label text-fg-tertiary">That balance has no cost yet; without it the P/L would count those shares as free.</p>
        </div>
      )}
      <TradeFields idPrefix="log-stock" form={trade} onChange={setTrade} type={type} usdToMxn={usdToMxn} nowHint={nowHint} />
      {tooMany && holding && <p role="alert" className="text-[0.8125rem] text-negative">{owner} holds only {formatShares(holding.shares)} {ticker}.</p>}
      {error && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}
      <Button className="w-full" variant={type === 'sell' ? 'danger' : 'primary'} onClick={save} disabled={saving || !canSave}>
        {saving ? 'Saving…' : type === 'sell' ? 'Log sell' : 'Log buy'}
      </Button>
    </div>
  )
}
