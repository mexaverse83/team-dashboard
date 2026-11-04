'use client'

import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { BUILTIN_COINS, builtinCoin, holdingCoinId } from '@/lib/crypto-coins'
import { needsOpeningCost } from '@/lib/crypto-ledger'
import type { CoinSearchResult } from '@/lib/crypto-search'
import { localDateKey } from '@/lib/dates'
import { formatCoinPrice, formatMoney } from '@/lib/format'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { cn } from '@/lib/utils'
import { CoinLogo, formatQty } from './coin-logo'

export interface AddCoinHolding {
  id: string
  symbol: string
  name: string
  owner: string
  quantity: number
  /** Average cost per coin (MXN); none means the balance has no cost basis. */
  avg_cost_basis_usd?: number | null
  coingecko_id?: string | null
}

interface AddCoinModalProps {
  open: boolean
  onClose: () => void
  holdings: readonly AddCoinHolding[]
  prices: Record<string, { usd: number; mxn: number }> | null
  usdToMxn: number
  defaultOwner: string
  onDone: () => void | Promise<void>
}

const inputClass = 'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-tertiary'

export function AddCoinModal(props: AddCoinModalProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title="Add a coin">
      {props.open && <AddCoinBody {...props} />}
    </Modal>
  )
}

type Mode = 'buy' | 'balance'

function AddCoinBody({ onClose, holdings, prices, usdToMxn, defaultOwner, onDone }: AddCoinModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CoinSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [picked, setPicked] = useState<CoinSearchResult | null>(null)
  const [owner, setOwner] = useState(OWNERS.find(o => ownersEqual(o, defaultOwner)) ?? OWNERS[0])
  const [mode, setMode] = useState<Mode>('buy')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState<'MXN' | 'USD'>('MXN')
  const [date, setDate] = useState(() => localDateKey())
  const [avgCost, setAvgCost] = useState('')
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
        const res = await fetch(`/api/finance/crypto/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error || 'Search failed')
        setResults(body?.coins ?? [])
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

  // Quick picks before typing: coins you hold, then the built-in list.
  const quickPicks = useMemo<CoinSearchResult[]>(() => {
    const seen = new Set<string>()
    const out: CoinSearchResult[] = []
    for (const h of holdings) {
      const id = holdingCoinId(h)
      if (!id || seen.has(h.symbol)) continue
      seen.add(h.symbol)
      out.push({ id, symbol: h.symbol, name: h.name || h.symbol, thumb: null, market_cap_rank: null })
    }
    for (const c of BUILTIN_COINS) {
      if (seen.has(c.symbol)) continue
      seen.add(c.symbol)
      out.push({ id: c.coingeckoId, symbol: c.symbol, name: c.name, thumb: null, market_cap_rank: null })
    }
    return out
  }, [holdings])

  const sameTicker = picked ? holdings.filter(h => h.symbol === picked.symbol) : []
  const clash = picked ? sameTicker.find(h => (holdingCoinId(h) ?? picked.id) !== picked.id) : undefined
  const existing = picked ? sameTicker.find(h => ownersEqual(h.owner, owner) && !clash) : undefined
  const effectiveMode: Mode = existing ? 'buy' : mode
  // A balance entered without a cost: a priced buy would blend it in at 0.
  const existingUnbased = needsOpeningCost(existing)
  // Prices are keyed by ticker: a held coin's own id, else the built-in one.
  // Only show "now" when that is the coin picked (not Lighter for Litentry).
  const pricedId = picked ? (sameTicker.map(h => holdingCoinId(h)).find(Boolean) ?? builtinCoin(picked.symbol)?.coingeckoId) : undefined
  const now = picked && pricedId === picked.id ? prices?.[picked.symbol] : undefined

  const qtyNum = parseFloat(qty)
  const priceNum = parseFloat(price)
  const priceMXN = currency === 'USD' ? priceNum * usdToMxn : priceNum
  const openingCostNum = parseFloat(openingCost)
  const canSave = !!picked && !clash && qtyNum > 0 && (effectiveMode === 'balance' || priceNum > 0)
    && (!existingUnbased || openingCostNum > 0)

  const save = async () => {
    if (!picked || !canSave) return
    setSaving(true); setError(null)
    const fail = async (res: Response, fallback: string) => {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || fallback)
    }
    try {
      let holdingId = existing?.id
      let created = false
      if (!holdingId) {
        const avg = parseFloat(avgCost)
        const res = await fetch('/api/finance/crypto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: picked.symbol,
            name: picked.name,
            coingecko_id: picked.id,
            owner,
            quantity: effectiveMode === 'balance' ? qtyNum : 0,
            ...(effectiveMode === 'balance' && avg > 0 ? { avg_cost_basis_usd: avg, cost_currency: 'MXN' } : {}),
          }),
        })
        if (!res.ok) await fail(res, 'Couldn’t add the coin')
        holdingId = (await res.json()).id
        created = true
      }
      if (effectiveMode === 'buy') {
        const res = await fetch('/api/finance/crypto/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            holding_id: holdingId, type: 'buy', quantity: qtyNum, price_per_coin_mxn: priceMXN,
            transaction_date: date || localDateKey(),
            ...(existingUnbased ? { opening_cost_per_coin_mxn: openingCostNum } : {}),
          }),
        })
        if (!res.ok) {
          // Don't leave an empty position behind when the first buy failed.
          if (created) await fetch('/api/finance/crypto', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: holdingId }) }).catch(() => {})
          await fail(res, 'Couldn’t log the buy')
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
    const list = query.trim() ? results : quickPicks
    return (
      <div className="space-y-3">
        <label htmlFor="coin-search" className="sr-only">Search coins</label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-tertiary" />
          <input id="coin-search" type="search" autoFocus autoComplete="off" placeholder="Search any coin (e.g. Dogecoin)"
            value={query} onChange={e => setQuery(e.target.value)} className={cn(inputClass, 'pl-9')} />
        </div>
        {!query.trim() && <p className="text-label text-fg-tertiary">Your coins and the usual ones — or search any coin on CoinGecko.</p>}
        {searching && <p role="status" className="text-label text-fg-secondary">Searching…</p>}
        {searchError && <p role="alert" className="text-label text-negative">{searchError}</p>}
        {list && list.length === 0 && !searching && <p className="text-label text-fg-secondary">No coins match “{query.trim()}”.</p>}
        {list && list.length > 0 && (
          <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label="Coins">
            {list.map(c => (
              <li key={c.id}>
                <button type="button" onClick={() => { setPicked(c); setError(null) }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                  <CoinLogo symbol={c.symbol} coinId={c.id} src={c.thumb} size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{c.name}</span>
                    <span className="block text-label text-fg-tertiary">{c.symbol}</span>
                  </span>
                  {c.market_cap_rank && <span className="tabular-nums shrink-0 text-label text-fg-tertiary">#{c.market_cap_rank}</span>}
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
        <CoinLogo symbol={picked.symbol} coinId={picked.id} src={picked.thumb} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{picked.name}</p>
          <p className="text-label text-fg-tertiary">{picked.symbol}{now ? ` · now ${formatCoinPrice(now.mxn, { currency: 'MXN', suffix: true })}` : ''}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setError(null) }}>Change</Button>
      </div>

      {clash ? (
        <p role="alert" className="text-[0.8125rem] text-negative">
          You already hold {clash.name} under the ticker {picked.symbol}. Two different coins can’t share a ticker here; remove that one first if it’s a mistake.
        </p>
      ) : (
        <>
          <div>
            <p className="mb-1.5 text-label font-medium text-fg-secondary">Whose is it?</p>
            <Segmented ariaLabel="Owner" size="sm" fullWidth value={owner} onChange={setOwner}
              options={OWNERS.map(o => ({ value: o, label: o, icon: <OwnerAvatar owner={o} size={16} aria-hidden /> }))} />
          </div>

          {existing ? (
            <>
              <p className="text-label text-fg-secondary">{owner} already holds {formatQty(existing.quantity)} {picked.symbol}; this logs another buy.</p>
              {existingUnbased && (
                <div>
                  <label htmlFor="add-coin-opening-cost" className="mb-1 block text-label font-medium text-fg-secondary">
                    What did the {formatQty(existing.quantity)} {picked.symbol} already held cost per coin (MXN)? *
                  </label>
                  <input id="add-coin-opening-cost" type="number" inputMode="decimal" step="any" min="0" value={openingCost}
                    onChange={e => setOpeningCost(e.target.value)} className={cn(inputClass, 'tabular-nums font-mono')} />
                  <p className="mt-1 text-label text-fg-tertiary">That balance has no cost yet; without it the P/L would count those coins as free.</p>
                </div>
              )}
            </>
          ) : (
            <Segmented ariaLabel="How to add it" fullWidth value={mode} onChange={setMode}
              options={[{ value: 'buy', label: 'Log a first buy' }, { value: 'balance', label: 'Enter a balance' }]} />
          )}

          <div>
            <label htmlFor="add-coin-qty" className="mb-1 block text-label font-medium text-fg-secondary">Quantity *</label>
            <input id="add-coin-qty" type="number" inputMode="decimal" step="any" min="0" placeholder="0.5" value={qty}
              onChange={e => setQty(e.target.value)} className={cn(inputClass, 'num font-mono')} />
          </div>

          {effectiveMode === 'buy' ? (
            <>
              <div>
                <label htmlFor="add-coin-price" className="mb-1 block text-label font-medium text-fg-secondary">Price per coin *</label>
                <div className="flex gap-2">
                  <input id="add-coin-price" type="number" inputMode="decimal" step="any" min="0" value={price}
                    onChange={e => setPrice(e.target.value)} className={cn(inputClass, 'tabular-nums min-w-0 flex-1 font-mono')} />
                  <Segmented ariaLabel="Price currency" size="sm" value={currency} onChange={setCurrency}
                    options={[{ value: 'MXN', label: 'MXN' }, { value: 'USD', label: 'USD' }]} />
                </div>
              </div>
              <div>
                <label htmlFor="add-coin-date" className="mb-1 block text-label font-medium text-fg-secondary">Date</label>
                <input id="add-coin-date" type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="text-label text-fg-secondary">Total (MXN)</p>
                <p className="tabular-nums text-lg font-semibold" data-money="">{qtyNum > 0 && priceNum > 0 ? formatMoney(qtyNum * priceMXN) : '—'}</p>
              </div>
            </>
          ) : (
            <div>
              <label htmlFor="add-coin-cost" className="mb-1 block text-label font-medium text-fg-secondary">Average cost per coin (MXN)</label>
              <input id="add-coin-cost" type="number" inputMode="decimal" step="any" min="0" placeholder="Optional — needed for P/L" value={avgCost}
                onChange={e => setAvgCost(e.target.value)} className={cn(inputClass, 'tabular-nums font-mono')} />
            </div>
          )}
        </>
      )}

      {error && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={save} disabled={saving || !canSave}>
          {saving ? 'Saving…' : effectiveMode === 'buy' ? 'Add & log buy' : 'Add coin'}
        </Button>
      </div>
    </div>
  )
}
