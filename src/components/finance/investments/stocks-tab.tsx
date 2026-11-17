'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Plus, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/stat'
import { Segmented } from '@/components/ui/segmented'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { ErrorState } from '@/components/ui/error-state'
import { PrivateEquityCard, type PrivateEquityHolding } from '@/components/finance/private-equity-card'
import { AddStockModal } from '@/components/finance/stocks/add-stock-modal'
import { LogStockTxModal, type LogTarget } from '@/components/finance/stocks/log-stock-tx-modal'
import { RemoveStockModal, type RemoveStockTarget } from '@/components/finance/stocks/remove-stock-modal'
import { EditStockModal, type EditableStock } from '@/components/finance/stocks/edit-stock-modal'
import { StockBreakdown, moneyMode } from '@/components/finance/stocks/stock-breakdown'
import { StockHistory, type StockTxRow } from '@/components/finance/stocks/stock-history'
import { tickerColor } from '@/components/finance/stocks/ticker-badge'
import { useFinanceData } from '@/hooks/use-finance-data'
import { moneyDisplay, readDisplayCurrency, saveDisplayCurrency, STOCKS_CURRENCY_KEY } from '@/lib/crypto-display'
import { aggregateStocks, isPublicStock, stockHolders, type StockRow } from '@/lib/stock-portfolio'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { formatDelta, formatMoney, formatPct, type Currency } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SectionLabel } from './shared'
import type { Portfolio } from './portfolio'
import type { StockHolding } from './types'

interface Props {
  portfolio: Portfolio
  /** Every stock row (both owners, private equity included) for the add/log pickers. */
  allStocks?: readonly StockHolding[]
  /** False until supabase-2026-11-stock-transactions.sql is applied. */
  ledgerReady?: boolean
  ownerFilter: string
  failed: boolean
  onRetry: () => void
  onChanged: () => Promise<void>
}

interface TxData { transactions: StockTxRow[]; pending: boolean }

async function fetchStockTxs(signal: AbortSignal): Promise<TxData> {
  const res = await fetch('/api/finance/investments/stocks/transactions', { signal, cache: 'no-store' })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`)
  return { transactions: body?.transactions ?? [], pending: !!body?.migration_pending }
}

export function StocksTab({ portfolio, allStocks = [], ledgerReady = true, ownerFilter, failed, onRetry, onChanged }: Props) {
  const { publicStocks, privateEquity, fxRate, stockRate, stockQuotes, totals } = portfolio
  const [currency, setCurrencyState] = useState<Currency>('MXN')
  const [addOpen, setAddOpen] = useState(false)
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null)
  const [removeTarget, setRemoveTarget] = useState<RemoveStockTarget | null>(null)
  const [editTarget, setEditTarget] = useState<EditableStock[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const txs = useFinanceData('investments:stock-transactions', fetchStockTxs)

  useEffect(() => {
    const id = window.setTimeout(() => setCurrencyState(readDisplayCurrency(STOCKS_CURRENCY_KEY)), 0)
    return () => window.clearTimeout(id)
  }, [])
  const setCurrency = (next: Currency) => { setCurrencyState(next); saveDisplayCurrency(STOCKS_CURRENCY_KEY, next) }

  const display = useMemo(() => moneyDisplay(currency, stockRate), [currency, stockRate])
  // Display-currency money with cents for small amounts (a fraction of a share).
  const money = (mxn: number, sign?: 'always') => display.money(mxn, { mode: moneyMode(display, mxn), ...(sign ? { sign } : {}) })
  const quotes = useMemo(() => stockQuotes ?? {}, [stockQuotes])
  const allPublic = useMemo(() => allStocks.filter(isPublicStock), [allStocks])
  const breakdown = useMemo(() => aggregateStocks(publicStocks, quotes, stockRate), [publicStocks, quotes, stockRate])
  const { totals: t } = breakdown
  const held = breakdown.rows.filter(r => r.shares > 0)
  const pending = !ledgerReady || !!txs.data?.pending

  const ownerTotals = useMemo(() => Object.fromEntries(OWNERS.map(o => {
    const b = aggregateStocks(allPublic.filter(h => ownersEqual(h.owner, o)), quotes, stockRate)
    return [o, { ...b.totals, count: b.rows.filter(r => r.shares > 0).length }]
  })), [allPublic, quotes, stockRate])

  const transactions = useMemo(() => {
    const list = txs.data?.transactions ?? []
    return ownerFilter === 'All' ? list : list.filter(tx => ownersEqual(tx.owner, ownerFilter))
  }, [txs.data, ownerFilter])
  const txCount = useCallback((ids: string[]) => (txs.data?.transactions ?? []).filter(tx => ids.includes(tx.holding_id)).length, [txs.data])

  const reload = useCallback(async () => {
    await Promise.all([onChanged(), txs.refresh()])
  }, [onChanged, txs])

  const refresh = async () => {
    setRefreshing(true)
    try { await reload() } finally { setRefreshing(false) }
  }

  const defaultOwner = ownerFilter !== 'All' ? ownerFilter : OWNERS[0]
  const openLog = (row?: StockRow) => {
    setActionError(null)
    if (pending) { setActionError('Logging buys and sells needs the database update first (see above). Use Edit to change a balance.'); return }
    if (!row) { setLogTarget({ owner: defaultOwner }); return }
    const holders = stockHolders(row)
    setLogTarget({ ticker: row.ticker, owner: ownerFilter !== 'All' ? ownerFilter : holders.length === 1 ? holders[0].owner : OWNERS[0] })
  }
  const openRemove = (row: StockRow) => {
    setActionError(null)
    setRemoveTarget({ row, initial: 'all' })
  }
  const openEdit = (row: StockRow) => {
    setActionError(null)
    const rows = allPublic.filter(h => row.holdingIds.includes(h.id))
    setEditTarget(rows.map(h => ({ id: h.id, ticker: h.ticker, name: h.name, owner: OWNERS.find(o => ownersEqual(o, h.owner)) ?? h.owner, shares: Number(h.shares) || 0, avg_cost_basis: h.avg_cost_basis ?? null, currency: h.currency, broker: h.broker, notes: h.notes })))
  }

  const deleteTx = async (tx: StockTxRow) => {
    if (!confirm(`Delete this ${tx.ticker} ${tx.type}? The holding will be recalculated.`)) return
    setActionError(null)
    try {
      const res = await fetch('/api/finance/investments/stocks/transactions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: tx.id, holding_id: tx.holding_id }) })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Delete failed')
      }
      await reload()
    } catch (e) {
      setActionError(e instanceof Error && e.message !== 'Delete failed' ? e.message : 'Couldn’t delete the transaction.')
    }
  }

  if (failed) return <Card><ErrorState title="Couldn’t load stocks" body="Your holdings are safe; the list just didn’t load." onRetry={onRetry} /></Card>

  const anyPrice = Object.keys(quotes).length > 0
  const other = currency === 'USD' ? 'MXN' : 'USD'
  const plHint = [
    t.unpriced.length > 0 ? `excl. ${t.unpriced.join(', ')} (no price)` : '',
    t.noBasis.length > 0 ? `excl. ${t.noBasis.join(', ')} (no cost)` : '',
  ].filter(Boolean).join(' · ')
  const pickerHoldings = allPublic.map(h => ({ ...h, shares: Number(h.shares) || 0, avg_cost_basis: h.avg_cost_basis ?? null }))

  return (
    <div className="space-y-4">
      <section className="space-y-4" aria-labelledby="stocks-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="stocks-heading" className="text-[0.9375rem] font-semibold text-fg">Public stocks</h2>
            <p className="text-label text-fg-secondary">
              {held.length === 0 ? 'US and Mexican stocks and ETFs, priced live' : anyPrice ? 'Live prices (Yahoo Finance, Nasdaq fallback)' : 'Prices unavailable: values shown at cost'}
              {transactions.length > 0 && (
                <> · <a href="#stock-transactions" className="font-medium text-fg underline-offset-2 hover:underline">History ({transactions.length})</a></>
              )}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
            {/* Phones: the currency switch gets its own row under the actions. */}
            <div className="order-last w-full sm:order-none sm:w-auto">
              <Segmented ariaLabel="Show amounts in" size="sm" value={currency} onChange={setCurrency}
                options={[{ value: 'MXN', label: 'MXN' }, { value: 'USD', label: 'USD' }]} />
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={refresh} disabled={refreshing} aria-label={refreshing ? 'Refreshing prices' : 'Refresh prices'}>
              <RefreshCw aria-hidden className={cn('h-4 w-4 shrink-0', refreshing && 'animate-spin')} /><span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </Button>
            <Button variant="secondary" size="sm" className="min-w-0 flex-1 whitespace-nowrap sm:flex-none" onClick={() => { setActionError(null); setAddOpen(true) }}>
              <Plus aria-hidden className="h-4 w-4 shrink-0" />Add stock
            </Button>
            <Button size="sm" className="min-w-0 flex-1 whitespace-nowrap sm:flex-none" onClick={() => openLog()} disabled={allPublic.length === 0}>
              <Plus aria-hidden className="h-4 w-4 shrink-0" />Log transaction
            </Button>
          </div>
        </div>

        {pending && (
          <p role="status" className="rounded-xl border border-border bg-surface-2 p-3 text-label text-warning">
            Database update pending: buys and sells can be logged once supabase-2026-11-stock-transactions.sql is applied. Until then, add stocks as a balance.
          </p>
        )}
        {txs.error && !txs.data && <p role="status" className="text-label text-warning">Transaction history didn’t load.</p>}
        {actionError && <p role="alert" className="text-[0.8125rem] text-negative">{actionError}</p>}

        {breakdown.rows.length === 0 ? (
          <Card variant="subtle">
            <ErrorState variant="empty" title="No public stocks yet"
              body={ownerFilter === 'All' ? 'Search a stock or ETF, pick whose it is, and log the first buy from GBM or any broker.' : `${ownerFilter} has no public stocks yet.`}
              action={<Button variant="secondary" size="sm" onClick={() => { setActionError(null); setAddOpen(true) }}><BarChart3 aria-hidden className="h-4 w-4" />Add stock</Button>} />
          </Card>
        ) : (
          <Card>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat money label={`Value (${currency})`} value={money(t.valueMXN)}
                hint={t.unpriced.length > 0 ? `${t.unpriced.join(', ')} at cost (no price)` : formatMoney(display.currency === 'USD' ? t.valueMXN : t.valueMXN / (stockRate || 1), { currency: other, showCurrency: true, mode: 'precise' })}
                tone={t.unpriced.length > 0 ? 'warning' : 'neutral'} />
              <Stat money label="Today" value={t.dayChangeMXN !== null ? money(t.dayChangeMXN, 'always') : '—'}
                tone={t.dayChangeMXN === null || t.dayChangeMXN === 0 ? 'neutral' : t.dayChangeMXN > 0 ? 'positive' : 'negative'} />
              <Stat money label="Cost" value={t.costMXN > 0 ? money(t.costMXN) : '—'} hint="incl. commissions" />
              <Stat money label="P/L" value={t.pl !== null ? money(t.pl, 'always') : '—'}
                delta={t.plPct !== null ? formatDelta(t.plPct, { unit: 'pct', decimals: 1 }) : undefined}
                hint={plHint || undefined}
                tone={t.pl === null ? 'neutral' : t.pl >= 0 ? 'positive' : 'negative'} />
            </div>
            {held.length > 1 && t.valueMXN > 0 && (
              <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-surface-3" role="img"
                aria-label={`Allocation: ${held.map(r => `${r.ticker} ${formatPct(r.sharePct)}`).join(', ')}`}>
                {held.map(r => r.sharePct < 0.5 ? null : <div key={r.ticker} className="h-full" style={{ width: `${r.sharePct}%`, background: tickerColor(r.ticker) }} />)}
              </div>
            )}
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="mb-2 text-[0.9375rem] font-semibold text-fg">
                {ownerFilter === 'All' ? `By stock · ${OWNERS.join(' + ')}` : `By stock · ${ownerFilter}`}
              </h3>
              <StockBreakdown breakdown={breakdown} showOwners={ownerFilter === 'All'} display={display}
                onLog={openLog} onEdit={openEdit} onRemove={openRemove} />
            </div>
          </Card>
        )}

        {ownerFilter === 'All' && held.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {OWNERS.map(name => {
              const o = ownerTotals[name]
              return (
                <Card key={name}>
                  <div className="flex items-center justify-between gap-2">
                    <OwnerAvatar owner={name} size={20} showName />
                    {o.plPct !== null && <StatusPill tone={o.pl! >= 0 ? 'positive' : 'negative'}>{formatDelta(o.plPct, { unit: 'pct', decimals: 1 })}</StatusPill>}
                  </div>
                  <p className="tabular-nums mt-2 text-2xl font-semibold" data-money="">{o.count > 0 ? money(o.valueMXN) : '—'}</p>
                  <p className="text-label text-fg-secondary">
                    {o.count > 0 ? <>Cost {o.costMXN > 0 ? money(o.costMXN) : '—'}</> : 'No public stocks yet'}
                    {o.pl !== null && <> · P/L <span className={o.pl >= 0 ? 'text-positive' : 'text-negative'}>{money(o.pl, 'always')}</span></>}
                  </p>
                  {o.count > 0 && (
                    <p className="mt-1 text-label text-fg-tertiary">
                      {o.count} {o.count === 1 ? 'stock' : 'stocks'}{t.valueMXN > 0 ? ` · ${formatPct((o.valueMXN / t.valueMXN) * 100)} of the household’s stocks` : ''}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        )}

        {transactions.length > 0 && (
          <Card>
            <StockHistory transactions={transactions} onLog={() => openLog()} onDelete={deleteTx} />
          </Card>
        )}
      </section>

      {privateEquity.length > 0 && (
        <section className="space-y-3" aria-label="Private equity">
          <SectionLabel>Private equity</SectionLabel>
          {privateEquity.map(h => (
            <PrivateEquityCard key={h.id} holding={h as StockHolding & PrivateEquityHolding} fxRate={fxRate} />
          ))}
          {totals.privateEquity > 0 && (
            <p className="text-label text-fg-tertiary">
              The Stocks total on Portfolio includes {formatMoney(totals.privateEquity)} of estimated private equity (illiquid until exit).
            </p>
          )}
        </section>
      )}

      <AddStockModal open={addOpen} onClose={() => setAddOpen(false)} holdings={pickerHoldings} quotes={quotes} usdToMxn={stockRate}
        defaultOwner={defaultOwner} ledgerReady={!pending} onDone={reload} />
      <LogStockTxModal target={logTarget} onClose={() => setLogTarget(null)} holdings={pickerHoldings} quotes={quotes} usdToMxn={stockRate}
        onAddStock={() => setAddOpen(true)} onDone={reload} />
      <RemoveStockModal target={removeTarget} txCount={txCount} onClose={() => setRemoveTarget(null)} onRemoved={reload} />
      <EditStockModal holdings={editTarget} txCount={txCount} onClose={() => setEditTarget(null)} onSaved={reload} />
    </div>
  )
}
