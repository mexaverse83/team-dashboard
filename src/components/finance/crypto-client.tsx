'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Bitcoin, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/stat'
import { Modal } from '@/components/ui/modal'
import { Segmented } from '@/components/ui/segmented'
import { MoneyText } from '@/components/ui/money-text'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { ErrorState } from '@/components/ui/error-state'
import { OwnerFilterControl } from '@/components/finance/investments/shared'
import { TabSkeleton } from '@/components/finance/investments/tab-skeleton'
import { coinsWithoutBasis, cryptoCostMXN, cryptoValueMXN, hasCostBasis, usdMxnRate } from '@/components/finance/investments/portfolio'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { localDateKey } from '@/lib/dates'
import { formatCoinPrice, formatDateShort, formatDelta, formatMoney, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Holding {
  id: string
  symbol: string
  name: string
  quantity: number
  avg_cost_basis_usd: number | null
  cost_currency: 'MXN' | 'USD'
  wallet_address: string | null
  owner: string
  notes: string | null
}

interface CryptoTx {
  id: string
  holding_id: string
  type: 'buy' | 'sell'
  quantity: number
  price_per_coin_mxn: number
  total_mxn: number
  exchange: string | null
  notes: string | null
  transaction_date: string
  symbol: string
  owner: string
}

interface Prices {
  [symbol: string]: { usd: number; mxn: number; change24h: number }
}

interface HoldingFormData {
  id?: string
  symbol: string
  owner: string
  wallet_address: string
  notes: string
}

interface TxFormData {
  holding_id: string
  type: 'buy' | 'sell'
  symbol: string
  owner: string
  quantity: string
  price_per_coin_mxn: string
  price_currency: 'MXN' | 'USD'
  exchange: string
  notes: string
  transaction_date: string
}

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'KAS', 'LIT', 'AERO', 'HYPE'] as const
const EMPTY_HOLDING_FORM: HoldingFormData = { symbol: 'BTC', owner: OWNERS[0], wallet_address: '', notes: '' }

// "Today" is read when a form opens, never at module load (CH-10): a tab left
// open overnight must not default yesterday's date.
function emptyTxForm(): TxFormData {
  return {
    holding_id: '', type: 'buy', symbol: 'BTC', owner: OWNERS[0],
    quantity: '', price_per_coin_mxn: '', price_currency: 'MXN', exchange: '', notes: '', transaction_date: localDateKey(),
  }
}

const COIN_LOGOS: Record<string, string> = {
  BTC: 'https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png?1696501400',
  ETH: 'https://coin-images.coingecko.com/coins/images/279/small/ethereum.png?1696501628',
  SOL: 'https://coin-images.coingecko.com/coins/images/4128/small/solana.png?1718769756',
  KAS: 'https://coin-images.coingecko.com/coins/images/25751/small/kaspa-icon-exchanges.png?1696524837',
  LIT: 'https://coin-images.coingecko.com/coins/images/71121/small/lighter.png?1765888098',
  AERO: 'https://coin-images.coingecko.com/coins/images/31745/small/token.png?1696530564',
  HYPE: 'https://coin-images.coingecko.com/coins/images/50882/small/hyperliquid.jpg?1729431300',
}
// Per-coin series colours from the categorical palette (both themes).
const COIN_COLOR: Record<string, string> = {
  BTC: 'hsl(var(--cat-4))',
  ETH: 'hsl(var(--chart-3))',
  SOL: 'hsl(var(--cat-8))',
  KAS: 'hsl(var(--cat-2))',
  LIT: 'hsl(var(--cat-3))',
  AERO: 'hsl(var(--cat-6))',
  HYPE: 'hsl(var(--cat-1))',
}
const coinColor = (symbol: string) => COIN_COLOR[symbol] ?? 'hsl(var(--cat-5))'

function CoinLogo({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const src = COIN_LOGOS[symbol]
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${coinColor(symbol)} 18%, transparent)`, color: coinColor(symbol) }}>
      {/* Remote CoinGecko logos are tiny static images; next/image would need a remote-host allowlist for no gain. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" width={size} height={size} loading="lazy" className="h-full w-full object-cover" /> : symbol.slice(0, 1)}
    </span>
  )
}

const qty = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(n)
const usd = (n: number) => formatMoney(n, { currency: 'USD', showCurrency: true })

const getValueMXN = (h: Holding, prices: Prices | null) => cryptoValueMXN(h, prices)
const getCostMXN = (h: Holding, usdToMxn: number) => cryptoCostMXN(h, usdToMxn)

const inputClass = 'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-tertiary'

export interface CryptoClientProps {
  /** Controlled owner filter ('All' or an owner) from the Investments page; hides the local toggle. */
  ownerFilter?: string
}

export function CryptoClient({ ownerFilter: controlledOwner }: CryptoClientProps = {}) {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [transactions, setTransactions] = useState<CryptoTx[]>([])
  const [prices, setPrices] = useState<Prices | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [holdingForm, setHoldingForm] = useState<HoldingFormData | null>(null)
  const [txForm, setTxForm] = useState<TxFormData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [localOwner, setLocalOwner] = useState<string>('All')
  const ownerFilter = controlledOwner ?? localOwner

  const fetchData = useCallback(async (bust = false) => {
    try {
      const bust_qs = bust ? `?t=${Date.now()}` : ''
      const [holdingsRes, txRes] = await Promise.all([
        fetch(`/api/finance/crypto${bust_qs}`, { cache: 'no-store' }),
        fetch('/api/finance/crypto/transactions', { cache: 'no-store' }),
      ])
      if (!holdingsRes.ok || !txRes.ok) throw new Error('Crypto data is unavailable')
      const hText = await holdingsRes.text()
      const tText = await txRes.text()

      if (hText) {
        const hData = JSON.parse(hText)
        setHoldings(hData.holdings || [])
        setPrices(hData.prices || null)
      }
      if (tText) {
        const tData = JSON.parse(tText)
        setTransactions(tData.transactions || [])
      }
      setLoaded(true)
      setLoadError(null)
    } catch (e) {
      console.error('Crypto fetch error:', e)
      setLoadError('Crypto data didn’t load')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fresh numbers whenever the app comes back to the foreground (iOS PWA resume)
  useEffect(() => {
    const initial = window.setTimeout(() => { void fetchData() }, 0)
    const refresh = () => {
      if (document.visibilityState === 'visible') void fetchData()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearTimeout(initial)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [fetchData])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData(true)
    setRefreshing(false)
  }

  const usdToMxn = useMemo(() => usdMxnRate(prices), [prices])

  const filtered = useMemo(() => {
    const f = ownerFilter === 'All' ? holdings : holdings.filter(h => ownersEqual(h.owner, ownerFilter))
    return [...f].sort((a, b) => getValueMXN(b, prices) - getValueMXN(a, prices))
  }, [holdings, ownerFilter, prices])

  const filteredTx = useMemo(() => {
    if (ownerFilter === 'All') return transactions
    return transactions.filter(tx => ownersEqual(tx.owner, ownerFilter))
  }, [transactions, ownerFilter])

  const totalMXN = filtered.reduce((s, h) => s + getValueMXN(h, prices), 0)
  const totalUSD = filtered.reduce((s, h) => s + h.quantity * (prices?.[h.symbol]?.usd ?? 0), 0)
  const totalCostMXN = filtered.reduce((s, h) => s + getCostMXN(h, usdToMxn), 0)
  // P&L compares cost with the value of the SAME coins: a coin with no basis
  // (e.g. ETH) would otherwise count its whole value as gain.
  const valueOnCostMXN = filtered.filter(hasCostBasis).reduce((s, h) => s + getValueMXN(h, prices), 0)
  const noBasis = coinsWithoutBasis(filtered)
  const totalPL = totalCostMXN > 0 ? valueOnCostMXN - totalCostMXN : null
  const totalPLPct = totalPL !== null && totalCostMXN > 0 ? (totalPL / totalCostMXN) * 100 : null

  // Per-owner totals with per-coin breakdown (always from the full set)
  const ownerTotals = useMemo(() => {
    const calc = (owner: string) => {
      const owned = holdings.filter(h => ownersEqual(h.owner, owner))
      const mxn = owned.reduce((s, h) => s + getValueMXN(h, prices), 0)
      const cost = owned.reduce((s, h) => s + getCostMXN(h, usdToMxn), 0)
      const valueOnCost = owned.filter(hasCostBasis).reduce((s, h) => s + getValueMXN(h, prices), 0)
      const pl = cost > 0 ? valueOnCost - cost : null
      const plPct = pl !== null && cost > 0 ? (pl / cost) * 100 : null
      const coins = owned.map(h => ({
        symbol: h.symbol,
        qty: h.quantity,
        valueMXN: getValueMXN(h, prices),
        costMXN: getCostMXN(h, usdToMxn),
      })).filter(c => c.qty > 0).sort((a, b) => b.valueMXN - a.valueMXN)
      return { mxn, cost, pl, plPct, coins, noBasis: coinsWithoutBasis(owned), count: owned.filter(h => h.quantity > 0).length }
    }
    return Object.fromEntries(OWNERS.map(o => [o, calc(o)]))
  }, [holdings, prices, usdToMxn])

  const combinedCoins = useMemo(() => {
    const map: Record<string, { symbol: string; qty: number; valueMXN: number; valueUSD: number }> = {}
    for (const h of filtered) {
      if (h.quantity <= 0) continue
      if (!map[h.symbol]) map[h.symbol] = { symbol: h.symbol, qty: 0, valueMXN: 0, valueUSD: 0 }
      map[h.symbol].qty += h.quantity
      map[h.symbol].valueMXN += getValueMXN(h, prices)
      map[h.symbol].valueUSD += h.quantity * (prices?.[h.symbol]?.usd ?? 0)
    }
    return Object.values(map).sort((a, b) => b.valueMXN - a.valueMXN)
  }, [filtered, prices])

  const handleSaveHolding = async () => {
    if (!holdingForm) return
    setSaving(true); setActionError(null)
    const existing = holdingForm.id ? holdings.find(h => h.id === holdingForm.id) : undefined
    try {
      const res = await fetch('/api/finance/crypto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: holdingForm.id,
          symbol: holdingForm.symbol,
          ...(existing ? {
            quantity: existing.quantity,
            avg_cost_basis_usd: existing.avg_cost_basis_usd ?? null,
            cost_currency: existing.cost_currency ?? 'MXN',
          } : { quantity: 0 }),
          owner: holdingForm.owner,
          wallet_address: holdingForm.wallet_address || null,
          notes: holdingForm.notes || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setHoldingForm(null)
      await fetchData()
    } catch { setActionError('Couldn’t save the position. Try again.') }
    finally { setSaving(false) }
  }

  const handleSaveTx = async () => {
    if (!txForm || !txForm.quantity || !txForm.price_per_coin_mxn) return
    setSaving(true); setActionError(null)
    try {
      let holdingId = txForm.holding_id
      if (!holdingId) {
        const match = holdings.find(h => h.symbol === txForm.symbol && ownersEqual(h.owner, txForm.owner))
        if (match) {
          holdingId = match.id
        } else {
          const createRes = await fetch('/api/finance/crypto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: txForm.symbol, quantity: 0, owner: txForm.owner }),
          })
          if (!createRes.ok) throw new Error('Failed to create holding')
          const created = await createRes.json()
          holdingId = created.id
        }
      }

      const res = await fetch('/api/finance/crypto/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_id: holdingId,
          type: txForm.type,
          quantity: parseFloat(txForm.quantity),
          price_per_coin_mxn: txForm.price_currency === 'USD'
            ? parseFloat(txForm.price_per_coin_mxn) * usdToMxn
            : parseFloat(txForm.price_per_coin_mxn),
          exchange: txForm.exchange || null,
          notes: txForm.notes || null,
          transaction_date: txForm.transaction_date || localDateKey(),
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setTxForm(null)
      await fetchData()
    } catch { setActionError('Couldn’t save the transaction. Try again.') }
    finally { setSaving(false) }
  }

  const handleDeleteHolding = async (id: string) => {
    if (!confirm('Delete this holding and all its transactions?')) return
    try {
      const res = await fetch('/api/finance/crypto', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error('Delete failed')
      await fetchData()
    } catch { setActionError('Couldn’t delete the position.') }
  }

  const handleDeleteTx = async (id: string, holdingId: string) => {
    if (!confirm('Delete this transaction? Holdings will be recalculated.')) return
    try {
      const res = await fetch('/api/finance/crypto/transactions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, holding_id: holdingId }) })
      if (!res.ok) throw new Error('Delete failed')
      await fetchData()
    } catch { setActionError('Couldn’t delete the transaction.') }
  }

  const openTxForm = (symbol?: string, owner?: string, holdingId?: string) => {
    setActionError(null)
    setTxForm({ ...emptyTxForm(), symbol: symbol || 'BTC', owner: owner || OWNERS[0], holding_id: holdingId || '' })
  }

  const txPriceRaw = txForm?.price_per_coin_mxn ? parseFloat(txForm.price_per_coin_mxn) : 0
  const txPriceMXN = txForm?.price_currency === 'USD' ? txPriceRaw * usdToMxn : txPriceRaw
  const txTotal = txForm?.quantity && txPriceRaw > 0 ? parseFloat(txForm.quantity) * txPriceMXN : null

  if (loading) return <TabSkeleton />

  return (
    <section className="space-y-4" aria-labelledby="crypto-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="crypto-heading" className="text-[0.9375rem] font-semibold text-fg">Crypto Portfolio</h2>
          <p className="text-label text-fg-secondary">
            {prices ? 'Live prices (CoinGecko, Coinpaprika fallback)' : 'Prices unavailable — values may read low'}
            {filteredTx.length > 0 && (
              <> · <a href="#crypto-transactions" className="font-medium text-fg underline-offset-2 hover:underline">View transaction history ({filteredTx.length})</a></>
            )}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {/* Phones: Refresh is icon-only so the two labelled actions keep their icons and padding. */}
          <Button variant="secondary" size="sm" className="shrink-0" onClick={handleRefresh} disabled={refreshing} aria-label={refreshing ? 'Refreshing prices' : 'Refresh prices'}>
            <RefreshCw aria-hidden className={cn('h-4 w-4 shrink-0', refreshing && 'animate-spin')} /><span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
          </Button>
          <Button variant="secondary" size="sm" className="min-w-0 flex-1 whitespace-nowrap sm:flex-none" onClick={() => { setActionError(null); setHoldingForm(EMPTY_HOLDING_FORM) }}>
            <Plus aria-hidden className="h-4 w-4 shrink-0" />Add position
          </Button>
          <Button size="sm" className="min-w-0 flex-1 whitespace-nowrap sm:flex-none" onClick={() => openTxForm()}>
            <Plus aria-hidden className="h-4 w-4 shrink-0" />Log transaction
          </Button>
        </div>
      </div>

      {controlledOwner === undefined && <OwnerFilterControl value={localOwner} onChange={setLocalOwner} />}

      {loadError && !loaded && (
        <Card><ErrorState title="Couldn’t load crypto" body="Holdings and prices didn’t load. Your positions are safe." onRetry={() => { void handleRefresh() }} /></Card>
      )}
      {loadError && loaded && <p role="status" className="text-label text-warning">Refresh failed — showing the last loaded prices.</p>}
      {actionError && <p role="alert" className="text-[0.8125rem] text-negative">{actionError}</p>}

      {loaded && (
        <>
          <Card>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat money label="Value (MXN)" value={formatMoney(totalMXN)} />
              <Stat money label="Value (USD)" value={usd(totalUSD)} />
              <Stat money label="Cost basis" value={totalCostMXN > 0 ? formatMoney(totalCostMXN) : '—'} />
              <Stat money label="P&L" value={totalPL !== null ? formatMoney(totalPL, { sign: 'always' }) : '—'}
                delta={totalPLPct !== null ? formatDelta(totalPLPct, { unit: 'pct', decimals: 1 }) : undefined}
                hint={totalPL !== null && noBasis.length > 0 ? `excl. ${noBasis.join(', ')}, no cost basis` : undefined}
                tone={totalPL === null ? 'neutral' : totalPL >= 0 ? 'positive' : 'negative'} />
            </div>
            {filtered.length > 0 && totalMXN > 0 && (
              <div className="mt-4">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3" role="img"
                  aria-label={`Allocation: ${combinedCoins.map(c => `${c.symbol} ${formatPct((c.valueMXN / totalMXN) * 100)}`).join(', ')}`}>
                  {combinedCoins.map(c => {
                    const pct = (c.valueMXN / totalMXN) * 100
                    return pct < 0.5 ? null : <div key={c.symbol} className="h-full" style={{ width: `${pct}%`, background: coinColor(c.symbol) }} />
                  })}
                </div>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {combinedCoins.map(c => (
                    <li key={c.symbol} className="flex items-center gap-1.5 whitespace-nowrap text-label text-fg-secondary">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: coinColor(c.symbol) }} />
                      {c.symbol} <span className="tabular-nums text-fg">{formatPct((c.valueMXN / totalMXN) * 100)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          {ownerFilter === 'All' && holdings.some(h => h.quantity > 0) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {OWNERS.map(name => {
                const o = ownerTotals[name]
                if (o.count === 0) return null
                return (
                  <Card key={name}>
                    <div className="flex items-center justify-between gap-2">
                      <OwnerAvatar owner={name} size={20} showName />
                      {o.plPct !== null && <StatusPill tone={o.pl! >= 0 ? 'positive' : 'negative'}>{formatDelta(o.plPct, { unit: 'pct', decimals: 1 })}</StatusPill>}
                    </div>
                    <p className="tabular-nums mt-2 text-2xl font-semibold" data-money="">{formatMoney(o.mxn)}</p>
                    <p className="text-label text-fg-secondary">
                      Cost {o.cost > 0 ? formatMoney(o.cost) : '—'}
                      {o.pl !== null && <> · P&amp;L <span className={o.pl >= 0 ? 'text-positive' : 'text-negative'}>{formatMoney(o.pl, { sign: 'always' })}</span></>}
                      {o.pl !== null && o.noBasis.length > 0 && <span className="text-fg-tertiary"> (excl. {o.noBasis.join(', ')}, no cost basis)</span>}
                    </p>
                    <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                      {o.coins.map(c => (
                        <li key={c.symbol} className="flex items-center justify-between gap-2 text-label">
                          <span className="flex min-w-0 items-center gap-2">
                            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: coinColor(c.symbol) }} />
                            <span className="font-medium text-fg">{c.symbol}</span>
                            <span className="tabular-nums truncate text-fg-tertiary">{qty(c.qty)}</span>
                          </span>
                          <span className="tabular-nums shrink-0 text-fg">
                            <MoneyText value={c.valueMXN} />
                            <span className="ml-1.5 text-fg-tertiary">{formatPct(o.mxn > 0 ? (c.valueMXN / o.mxn) * 100 : 0)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )
              })}
            </div>
          )}

          {filtered.length === 0 ? (
            <Card variant="subtle">
              <ErrorState variant="empty" title="No crypto holdings yet" body="Log a buy to start tracking a coin."
                action={<Button variant="secondary" size="sm" onClick={() => openTxForm()}><Bitcoin aria-hidden className="h-4 w-4" />Log transaction</Button>} />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(h => {
                const price = prices?.[h.symbol]
                const valueMXN = getValueMXN(h, prices)
                const valueUSD = h.quantity * (price?.usd ?? 0)
                const costMXN = getCostMXN(h, usdToMxn)
                const pl = costMXN > 0 ? valueMXN - costMXN : null
                const plPct = costMXN > 0 && pl !== null ? (pl / costMXN) * 100 : null
                const change = price?.change24h ?? 0
                return (
                  <Card key={h.id}>
                    <div className="flex items-start gap-3">
                      <CoinLogo symbol={h.symbol} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold"><span className="truncate">{h.name}</span> <OwnerAvatar owner={h.owner} size={16} /></p>
                        <p className="text-label text-fg-tertiary">{h.symbol}</p>
                      </div>
                      <div className="-mr-2 -mt-2 flex shrink-0">
                        <Button variant="ghost" size="icon" aria-label={`Log ${h.symbol} transaction`} onClick={() => openTxForm(h.symbol, h.owner, h.id)}><Plus className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Edit ${h.symbol} position`} onClick={() => { setActionError(null); setHoldingForm({ id: h.id, symbol: h.symbol, owner: h.owner, wallet_address: h.wallet_address || '', notes: h.notes || '' }) }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${h.symbol} position`} onClick={() => handleDeleteHolding(h.id)}><Trash2 className="h-4 w-4 text-negative" /></Button>
                      </div>
                    </div>
                    <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
                      <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Holdings</dt><dd className="tabular-nums font-mono">{qty(h.quantity)} {h.symbol}</dd></div>
                      {price && (
                        <>
                          <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Price</dt><dd className="tabular-nums">{formatCoinPrice(price.usd, { currency: 'USD', suffix: true })}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-fg-secondary">24h</dt><dd className={cn('tabular-nums', change > 0 ? 'text-positive' : change < 0 ? 'text-negative' : 'text-fg')}>{formatDelta(change, { unit: 'pct', decimals: 2 })}</dd></div>
                        </>
                      )}
                      <div className="flex justify-between gap-3 border-t border-border pt-1.5"><dt className="text-fg-secondary">Value</dt><dd className="font-semibold"><MoneyText value={valueMXN} /></dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Value (USD)</dt><dd className="tabular-nums" data-money="">{usd(valueUSD)}</dd></div>
                      {pl === null && h.quantity > 0 && !hasCostBasis(h) && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-fg-secondary">P&amp;L</dt>
                          <dd className="text-fg-tertiary" title="No cost basis recorded: log the buy to see P&L">— <span className="text-label">no cost basis</span></dd>
                        </div>
                      )}
                      {pl !== null && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-fg-secondary">P&amp;L</dt>
                          <dd className={cn('tabular-nums font-semibold', pl >= 0 ? 'text-positive' : 'text-negative')} data-money="">
                            {formatMoney(pl, { sign: 'always' })}{plPct !== null && <span className="ml-1 text-label font-normal">({formatDelta(plPct, { unit: 'pct', decimals: 1 })})</span>}
                          </dd>
                        </div>
                      )}
                    </dl>
                    {h.notes && <p title={h.notes} className="mt-2 line-clamp-3 text-label text-fg-tertiary">{h.notes}</p>}
                  </Card>
                )
              })}
            </div>
          )}

          {filteredTx.length > 0 && (
            <Card>
              <CardHeader title={<span id="crypto-transactions" className="scroll-mt-24">Transaction History</span>}
                action={<Button size="sm" variant="secondary" onClick={() => openTxForm()}><Plus aria-hidden className="h-4 w-4" />Log</Button>} />
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-label text-fg-secondary">
                      <th scope="col" className="px-3 py-2.5 text-left font-medium">Date</th>
                      <th scope="col" className="px-2 py-2.5 text-left font-medium">Type</th>
                      <th scope="col" className="px-2 py-2.5 text-left font-medium">Asset</th>
                      <th scope="col" className="px-2 py-2.5 text-right font-medium">Qty</th>
                      <th scope="col" className="px-2 py-2.5 text-right font-medium">Price/coin</th>
                      <th scope="col" className="px-2 py-2.5 text-right font-medium">Total</th>
                      <th scope="col" className="px-2 py-2.5 text-left font-medium">Exchange</th>
                      <th scope="col" className="px-2 py-2.5 text-left font-medium">Owner</th>
                      <th scope="col" className="w-12 px-2 py-2.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTx.map(tx => (
                      <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                        <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-fg-secondary">{formatDateShort(tx.transaction_date)}</td>
                        <td className="px-2 py-2.5"><StatusPill tone={tx.type === 'buy' ? 'positive' : 'negative'}>{tx.type === 'buy' ? 'Buy' : 'Sell'}</StatusPill></td>
                        <td className="px-2 py-2.5 font-medium">
                          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: coinColor(tx.symbol) }} />{tx.symbol}</span>
                        </td>
                        <td className="tabular-nums px-2 py-2.5 text-right font-mono">{qty(tx.quantity)}</td>
                        <td className="tabular-nums px-2 py-2.5 text-right">{formatCoinPrice(tx.price_per_coin_mxn, { currency: 'MXN' })}</td>
                        <td className="px-2 py-2.5 text-right font-semibold"><MoneyText value={tx.total_mxn} /></td>
                        <td className="px-2 py-2.5 text-label text-fg-secondary">{tx.exchange || '—'}</td>
                        <td className="px-2 py-2.5"><OwnerAvatar owner={tx.owner} size={18} /></td>
                        <td className="px-2 py-1 text-right">
                          <Button variant="ghost" size="icon" aria-label={`Delete ${tx.symbol} ${tx.type} on ${formatDateShort(tx.transaction_date)}`} onClick={() => handleDeleteTx(tx.id, tx.holding_id)}>
                            <Trash2 className="h-4 w-4 text-negative" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="space-y-2 sm:hidden">
                {filteredTx.map(tx => (
                  <li key={tx.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <StatusPill tone={tx.type === 'buy' ? 'positive' : 'negative'}>{tx.type === 'buy' ? 'Buy' : 'Sell'}</StatusPill>
                        <span className="text-sm font-medium">{tx.symbol}</span>
                        <OwnerAvatar owner={tx.owner} size={16} />
                        <span className="ml-auto text-sm font-semibold"><MoneyText value={tx.total_mxn} /></span>
                      </div>
                      <p className="mt-1 flex justify-between gap-2 text-label text-fg-secondary">
                        <span>{formatDateShort(tx.transaction_date)} · {tx.exchange || 'No exchange'}</span>
                        <span className="tabular-nums">{qty(tx.quantity)} @ {formatCoinPrice(tx.price_per_coin_mxn, { currency: 'MXN' })}</span>
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Delete ${tx.symbol} ${tx.type} on ${formatDateShort(tx.transaction_date)}`} onClick={() => handleDeleteTx(tx.id, tx.holding_id)}>
                      <Trash2 className="h-4 w-4 text-negative" />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Modal open={holdingForm !== null} onClose={() => setHoldingForm(null)} title={holdingForm?.id ? 'Edit position' : 'Add position'}
        footer={(
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setHoldingForm(null)}>Cancel</Button>
            <Button className="flex-1" onClick={handleSaveHolding} disabled={saving}>{saving ? 'Saving…' : holdingForm?.id ? 'Save' : 'Add'}</Button>
          </div>
        )}>
        {holdingForm && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-1.5 text-label font-medium text-fg-secondary">Asset</legend>
              <CoinPicker value={holdingForm.symbol} onChange={symbol => setHoldingForm({ ...holdingForm, symbol })} />
            </fieldset>
            <div>
              <p className="mb-1.5 text-label font-medium text-fg-secondary">Owner</p>
              <OwnerPicker value={holdingForm.owner} onChange={owner => setHoldingForm({ ...holdingForm, owner })} />
            </div>
            <div>
              <label htmlFor="crypto-wallet" className="mb-1 block text-label font-medium text-fg-secondary">Wallet address</label>
              <input id="crypto-wallet" type="text" placeholder="Optional" value={holdingForm.wallet_address} onChange={e => setHoldingForm({ ...holdingForm, wallet_address: e.target.value })} className={cn(inputClass, 'font-mono')} />
            </div>
            <div>
              <label htmlFor="crypto-notes" className="mb-1 block text-label font-medium text-fg-secondary">Notes</label>
              <input id="crypto-notes" type="text" placeholder="Optional" value={holdingForm.notes} onChange={e => setHoldingForm({ ...holdingForm, notes: e.target.value })} className={inputClass} />
            </div>
            {actionError && <p role="alert" className="text-[0.8125rem] text-negative">{actionError}</p>}
          </div>
        )}
      </Modal>

      <Modal open={txForm !== null} onClose={() => setTxForm(null)} title="Log transaction"
        footer={(
          <Button className="w-full" variant={txForm?.type === 'sell' ? 'danger' : 'primary'} onClick={handleSaveTx}
            disabled={saving || !txForm?.quantity || !txForm?.price_per_coin_mxn}>
            {saving ? 'Saving…' : txForm?.type === 'sell' ? 'Log sell' : 'Log buy'}
          </Button>
        )}>
        {txForm && (
          <div className="space-y-4">
            <Segmented ariaLabel="Transaction type" fullWidth value={txForm.type} onChange={type => setTxForm({ ...txForm, type })}
              options={[{ value: 'buy', label: 'Buy' }, { value: 'sell', label: 'Sell' }]} />
            <fieldset>
              <legend className="mb-1.5 text-label font-medium text-fg-secondary">Asset</legend>
              <CoinPicker value={txForm.symbol} onChange={symbol => setTxForm({ ...txForm, symbol, holding_id: '' })} />
            </fieldset>
            <div>
              <p className="mb-1.5 text-label font-medium text-fg-secondary">Owner</p>
              <OwnerPicker value={txForm.owner} onChange={owner => setTxForm({ ...txForm, owner, holding_id: '' })} />
            </div>
            <div>
              <label htmlFor="crypto-qty" className="mb-1 block text-label font-medium text-fg-secondary">Quantity *</label>
              <input id="crypto-qty" type="number" inputMode="decimal" step="any" placeholder="0.00125" value={txForm.quantity} onChange={e => setTxForm({ ...txForm, quantity: e.target.value })} className={cn(inputClass, 'num font-mono')} />
            </div>
            <div>
              <label htmlFor="crypto-price" className="mb-1 block text-label font-medium text-fg-secondary">Price per coin *</label>
              <div className="flex gap-2">
                <input id="crypto-price" type="number" inputMode="decimal" step="any" placeholder={txForm.price_currency === 'MXN' ? '1,850,000' : '95,000'} value={txForm.price_per_coin_mxn}
                  onChange={e => setTxForm({ ...txForm, price_per_coin_mxn: e.target.value })} className={cn(inputClass, 'tabular-nums min-w-0 flex-1 font-mono')} />
                <Segmented ariaLabel="Price currency" size="sm" value={txForm.price_currency} onChange={c => setTxForm({ ...txForm, price_currency: c })}
                  options={[{ value: 'MXN', label: 'MXN' }, { value: 'USD', label: 'USD' }]} />
              </div>
              {prices?.[txForm.symbol] && (
                <p className="mt-1 text-label text-fg-tertiary">
                  Now {txForm.price_currency === 'USD' ? formatCoinPrice(prices[txForm.symbol].usd, { currency: 'USD', suffix: true }) : formatCoinPrice(prices[txForm.symbol].mxn, { currency: 'MXN', suffix: true })}
                </p>
              )}
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-label text-fg-secondary">Total (MXN)</p>
              <p className="tabular-nums text-lg font-semibold" data-money="">{txTotal ? formatMoney(txTotal) : '—'}</p>
              {txTotal && txForm.price_currency === 'USD' && <p className="text-label text-fg-tertiary">At {usdToMxn.toFixed(2)} MXN/USD</p>}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="crypto-date" className="mb-1 block text-label font-medium text-fg-secondary">Date</label>
                <input id="crypto-date" type="date" value={txForm.transaction_date} onChange={e => setTxForm({ ...txForm, transaction_date: e.target.value })} className={inputClass} />
              </div>
              <div>
                <p className="mb-1 text-label font-medium text-fg-secondary">Exchange</p>
                <Segmented ariaLabel="Exchange" size="sm" fullWidth value={txForm.exchange || 'none'} onChange={ex => setTxForm({ ...txForm, exchange: ex === 'none' ? '' : ex })}
                  options={[{ value: 'Bitso', label: 'Bitso' }, { value: 'Binance', label: 'Binance' }, { value: 'Other', label: 'Other' }, { value: 'none', label: '—', ariaLabel: 'No exchange' }]} />
              </div>
            </div>
            <div>
              <label htmlFor="crypto-tx-notes" className="mb-1 block text-label font-medium text-fg-secondary">Notes</label>
              <input id="crypto-tx-notes" type="text" placeholder="Optional" value={txForm.notes} onChange={e => setTxForm({ ...txForm, notes: e.target.value })} className={inputClass} />
            </div>
            {actionError && <p role="alert" className="text-[0.8125rem] text-negative">{actionError}</p>}
          </div>
        )}
      </Modal>
    </section>
  )
}

function CoinPicker({ value, onChange }: { value: string; onChange: (symbol: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Asset">
      {SYMBOLS.map(s => (
        <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)}
          className={cn('flex min-h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-colors',
            value === s ? 'border-border-strong bg-surface-3 text-fg' : 'border-border bg-surface-2 text-fg-secondary hover:text-fg')}>
          <CoinLogo symbol={s} size={18} /> {s}
        </button>
      ))}
    </div>
  )
}

function OwnerPicker({ value, onChange }: { value: string; onChange: (owner: string) => void }) {
  return (
    <Segmented ariaLabel="Owner" size="sm" fullWidth value={OWNERS.find(o => ownersEqual(o, value)) ?? OWNERS[0]} onChange={onChange}
      options={OWNERS.map(o => ({ value: o, label: o, icon: <OwnerAvatar owner={o} size={16} aria-hidden /> }))} />
  )
}
