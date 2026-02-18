'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { GlassCard } from '@/components/ui/glass-card'
import { Bitcoin, TrendingUp, TrendingDown, Plus, Pencil, Trash2, X, Wallet, RefreshCw } from 'lucide-react'
import { OwnerDot } from '@/components/finance/owner-dot'

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
  exchange: string
  notes: string
  transaction_date: string
}

const EMPTY_HOLDING_FORM: HoldingFormData = { symbol: 'BTC', owner: 'Bernardo', wallet_address: '', notes: '' }

const today = new Date().toISOString().slice(0, 10)
const EMPTY_TX_FORM: TxFormData = {
  holding_id: '', type: 'buy', symbol: 'BTC', owner: 'Bernardo',
  quantity: '', price_per_coin_mxn: '', exchange: '', notes: '', transaction_date: today,
}

const COIN_ICONS: Record<string, string> = { BTC: '₿', ETH: 'Ξ', SOL: '◎' }
const COIN_COLORS: Record<string, string> = {
  BTC: 'from-orange-500 to-amber-600',
  ETH: 'from-indigo-400 to-blue-600',
  SOL: 'from-purple-400 to-fuchsia-600',
}
const COIN_SOLIDS: Record<string, string> = {
  BTC: 'bg-orange-500',
  ETH: 'bg-indigo-500',
  SOL: 'bg-purple-500',
}

function fmt(n: number, decimals = 2) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n)
}
function fmtMXN(n: number) { return `$${fmt(n, 0)} MXN` }
function fmtUSD(n: number) { return `$${fmt(n)} USD` }

function getValueMXN(h: Holding, prices: Prices | null) {
  return h.quantity * (prices?.[h.symbol]?.mxn ?? 0)
}

function getCostMXN(h: Holding, usdToMxn: number) {
  if (!h.avg_cost_basis_usd) return 0
  return h.quantity * (h.cost_currency === 'USD' ? h.avg_cost_basis_usd * usdToMxn : h.avg_cost_basis_usd)
}

export function CryptoClient() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [transactions, setTransactions] = useState<CryptoTx[]>([])
  const [prices, setPrices] = useState<Prices | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showHoldingForm, setShowHoldingForm] = useState(false)
  const [showTxForm, setShowTxForm] = useState(false)
  const [holdingForm, setHoldingForm] = useState<HoldingFormData>(EMPTY_HOLDING_FORM)
  const [txForm, setTxForm] = useState<TxFormData>(EMPTY_TX_FORM)
  const [error, setError] = useState<string | null>(null)
  const [ownerFilter, setOwnerFilter] = useState<'All' | 'Bernardo' | 'Laura'>('All')

  const fetchData = useCallback(async () => {
    try {
      const [holdingsRes, txRes] = await Promise.all([
        fetch('/api/finance/crypto'),
        fetch('/api/finance/crypto/transactions'),
      ])
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
    } catch (e) {
      console.error('Crypto fetch error:', e)
      setError('Failed to load crypto data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // USD→MXN rate
  const usdToMxn = useMemo(() => {
    if (!prices) return 17
    for (const p of Object.values(prices)) {
      if (p.usd > 0 && p.mxn > 0) return p.mxn / p.usd
    }
    return 17
  }, [prices])

  // Filter holdings by owner
  const filtered = useMemo(() => {
    const f = ownerFilter === 'All' ? holdings : holdings.filter(h => h.owner === ownerFilter)
    return [...f].sort((a, b) => getValueMXN(b, prices) - getValueMXN(a, prices))
  }, [holdings, ownerFilter, prices])

  // Filter transactions by owner
  const filteredTx = useMemo(() => {
    if (ownerFilter === 'All') return transactions
    return transactions.filter(tx => tx.owner === ownerFilter)
  }, [transactions, ownerFilter])

  // Totals (respect filter)
  const totalMXN = filtered.reduce((s, h) => s + getValueMXN(h, prices), 0)
  const totalUSD = filtered.reduce((s, h) => s + h.quantity * (prices?.[h.symbol]?.usd ?? 0), 0)
  const totalCostMXN = filtered.reduce((s, h) => s + getCostMXN(h, usdToMxn), 0)
  const totalPL = totalCostMXN > 0 ? totalMXN - totalCostMXN : null
  const totalPLPct = totalPL !== null && totalCostMXN > 0 ? (totalPL / totalCostMXN) * 100 : null

  // Per-owner totals with per-coin breakdown (always computed from full set)
  const ownerTotals = useMemo(() => {
    const calc = (owner: string) => {
      const owned = holdings.filter(h => h.owner === owner)
      const mxn = owned.reduce((s, h) => s + getValueMXN(h, prices), 0)
      const cost = owned.reduce((s, h) => s + getCostMXN(h, usdToMxn), 0)
      const pl = cost > 0 ? mxn - cost : null
      const plPct = pl !== null && cost > 0 ? (pl / cost) * 100 : null
      const coins = owned.map(h => ({
        symbol: h.symbol,
        qty: h.quantity,
        valueMXN: getValueMXN(h, prices),
        costMXN: getCostMXN(h, usdToMxn),
      })).filter(c => c.qty > 0).sort((a, b) => b.valueMXN - a.valueMXN)
      return { mxn, cost, pl, plPct, coins, count: owned.filter(h => h.quantity > 0).length }
    }
    return { Bernardo: calc('Bernardo'), Laura: calc('Laura') }
  }, [holdings, prices, usdToMxn])

  // Save holding (simplified — just symbol + owner + wallet)
  const handleSaveHolding = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/crypto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: holdingForm.id,
          symbol: holdingForm.symbol,
          quantity: 0,
          owner: holdingForm.owner,
          wallet_address: holdingForm.wallet_address || null,
          notes: holdingForm.notes || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setShowHoldingForm(false)
      setHoldingForm(EMPTY_HOLDING_FORM)
      await fetchData()
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  // Save transaction
  const handleSaveTx = async () => {
    if (!txForm.quantity || !txForm.price_per_coin_mxn) return
    setSaving(true); setError(null)
    try {
      // Find or auto-pick holding
      let holdingId = txForm.holding_id
      if (!holdingId) {
        // Find existing holding for this symbol + owner
        const match = holdings.find(h => h.symbol === txForm.symbol && h.owner === txForm.owner)
        if (match) {
          holdingId = match.id
        } else {
          // Auto-create holding
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
          price_per_coin_mxn: parseFloat(txForm.price_per_coin_mxn),
          exchange: txForm.exchange || null,
          notes: txForm.notes || null,
          transaction_date: txForm.transaction_date || today,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setShowTxForm(false)
      setTxForm(EMPTY_TX_FORM)
      await fetchData()
    } catch { setError('Failed to save transaction') }
    finally { setSaving(false) }
  }

  const handleDeleteHolding = async (id: string) => {
    if (!confirm('Delete this holding and all its transactions?')) return
    try {
      await fetch('/api/finance/crypto', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await fetchData()
    } catch { setError('Failed to delete') }
  }

  const handleDeleteTx = async (id: string, holdingId: string) => {
    if (!confirm('Delete this transaction? Holdings will be recalculated.')) return
    try {
      await fetch('/api/finance/crypto/transactions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, holding_id: holdingId }),
      })
      await fetchData()
    } catch { setError('Failed to delete') }
  }

  const editHolding = (h: Holding) => {
    setHoldingForm({ id: h.id, symbol: h.symbol, owner: h.owner, wallet_address: h.wallet_address || '', notes: h.notes || '' })
    setShowHoldingForm(true)
  }

  const openTxForm = (symbol?: string, owner?: string, holdingId?: string) => {
    setTxForm({
      ...EMPTY_TX_FORM,
      symbol: symbol || 'BTC',
      owner: owner || 'Bernardo',
      holding_id: holdingId || '',
      transaction_date: today,
    })
    setShowTxForm(true)
  }

  const txTotal = txForm.quantity && txForm.price_per_coin_mxn
    ? parseFloat(txForm.quantity) * parseFloat(txForm.price_per_coin_mxn)
    : null

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-8 w-48 rounded bg-[hsl(var(--accent))] animate-pulse" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-xl bg-[hsl(var(--accent))] animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Bitcoin className="h-5 w-5 text-orange-400" /> Crypto Portfolio
          </h1>
          <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
            {prices ? 'Live prices via CoinGecko' : 'Prices unavailable'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/80 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={() => openTxForm()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
            <Plus className="h-3.5 w-3.5" /> Log Transaction
          </button>
          <button onClick={() => { setHoldingForm(EMPTY_HOLDING_FORM); setShowHoldingForm(true) }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/80 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Position
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* Portfolio Summary */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Portfolio Value</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total (MXN)</p>
            <p className="text-lg font-bold text-emerald-400 tabular-nums">{fmtMXN(totalMXN)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total (USD)</p>
            <p className="text-lg font-bold tabular-nums">{fmtUSD(totalUSD)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">Cost Basis</p>
            <p className="text-lg font-bold text-[hsl(var(--text-secondary))] tabular-nums">{totalCostMXN > 0 ? fmtMXN(totalCostMXN) : '—'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">P&L</p>
            {totalPL !== null ? (
              <p className={`text-lg font-bold flex items-center gap-1 tabular-nums whitespace-nowrap ${totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPL >= 0 ? <TrendingUp className="h-4 w-4 shrink-0" /> : <TrendingDown className="h-4 w-4 shrink-0" />}
                {totalPL >= 0 ? '+' : ''}{fmtMXN(totalPL)}
                {totalPLPct !== null && <span className="text-xs font-medium ml-1">({totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(1)}%)</span>}
              </p>
            ) : <p className="text-lg font-bold text-[hsl(var(--text-secondary))]">—</p>}
          </div>
        </div>

        {/* Owner summary removed — now in dedicated section below */}
      </GlassCard>

      {/* Owner Portfolios */}
      {holdings.length > 0 && ownerFilter === 'All' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(['Bernardo', 'Laura'] as const).map(name => {
            const o = ownerTotals[name]
            if (o.count === 0) return null
            const ownerColor = name === 'Bernardo' ? 'border-blue-500/30' : 'border-pink-500/30'
            const ownerBg = name === 'Bernardo' ? 'bg-blue-500/5' : 'bg-pink-500/5'
            return (
              <GlassCard key={name} className={`p-4 ${ownerBg} border ${ownerColor}`}>
                <div className="flex items-center justify-between mb-3">
                  <OwnerDot owner={name} size="md" showLabel />
                  {o.pl !== null && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                      o.pl >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {o.pl >= 0 ? '+' : ''}{o.plPct !== null ? `${o.plPct.toFixed(1)}%` : ''}
                    </span>
                  )}
                </div>

                <p className="text-2xl font-bold tabular-nums mb-1">{fmtMXN(o.mxn)}</p>
                <div className="flex items-center gap-3 text-xs text-[hsl(var(--text-secondary))] mb-3">
                  <span>Cost: {o.cost > 0 ? fmtMXN(o.cost) : '—'}</span>
                  {o.pl !== null && (
                    <span className={o.pl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      P&L: {o.pl >= 0 ? '+' : ''}{fmtMXN(o.pl)}
                    </span>
                  )}
                </div>

                {/* Per-coin breakdown */}
                <div className="space-y-2 border-t border-[hsl(var(--border))] pt-3">
                  {o.coins.map(c => {
                    const pct = o.mxn > 0 ? (c.valueMXN / o.mxn) * 100 : 0
                    const coinPL = c.costMXN > 0 ? c.valueMXN - c.costMXN : null
                    return (
                      <div key={c.symbol} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${COIN_SOLIDS[c.symbol] || 'bg-gray-500'}`} />
                          <span className="text-xs font-medium">{c.symbol}</span>
                          <span className="text-[10px] text-[hsl(var(--text-tertiary))]">{fmt(c.qty, 8).replace(/\.?0+$/, '')}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold tabular-nums">{fmtMXN(c.valueMXN)}</span>
                          <span className="text-[10px] text-[hsl(var(--text-tertiary))] ml-1.5">{pct.toFixed(0)}%</span>
                          {coinPL !== null && (
                            <span className={`text-[10px] ml-1.5 ${coinPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {coinPL >= 0 ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Mini allocation bar */}
                {o.coins.length > 1 && o.mxn > 0 && (
                  <div className="flex h-1.5 w-full rounded-full overflow-hidden mt-3">
                    {o.coins.map(c => (
                      <div key={c.symbol} className={`h-full ${COIN_SOLIDS[c.symbol] || 'bg-gray-500'}`}
                        style={{ width: `${(c.valueMXN / o.mxn) * 100}%` }} />
                    ))}
                  </div>
                )}
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Owner Filter Tabs */}
      <div className="flex gap-1 p-1 bg-[hsl(var(--accent))] rounded-lg w-fit">
        {(['All', 'Bernardo', 'Laura'] as const).map(f => (
          <button
            key={f}
            onClick={() => setOwnerFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              ownerFilter === f
                ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm'
                : 'text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            {f !== 'All' && <OwnerDot owner={f} size="sm" />}
            {f}
          </button>
        ))}
      </div>

      {/* Allocation Bar */}
      {filtered.length > 0 && totalMXN > 0 && (
        <div>
          <div className="flex h-3 w-full rounded-full overflow-hidden">
            {filtered.map(h => {
              const pct = (getValueMXN(h, prices) / totalMXN) * 100
              if (pct < 0.5) return null
              return (
                <div key={h.id} className={`h-full first:rounded-l-full last:rounded-r-full ${COIN_SOLIDS[h.symbol] || 'bg-gray-500'}`}
                  style={{ width: `${pct}%` }} title={`${h.symbol}: ${pct.toFixed(1)}%`} />
              )
            })}
          </div>
          <div className="flex gap-4 mt-1.5">
            {filtered.map(h => (
              <span key={h.id} className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--text-secondary))]">
                <span className={`h-2 w-2 rounded-full ${COIN_SOLIDS[h.symbol] || 'bg-gray-500'}`} />
                {h.symbol} {((getValueMXN(h, prices) / totalMXN) * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Asset Cards */}
      {filtered.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Bitcoin className="h-10 w-10 text-[hsl(var(--text-tertiary))] mx-auto mb-3" />
          <p className="text-sm font-medium">No holdings yet</p>
          <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">Log a transaction to start tracking</p>
          <button onClick={() => openTxForm()} className="mt-4 px-4 py-2 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
            Log Transaction
          </button>
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(h => {
            const price = prices?.[h.symbol]
            const valueMXN = getValueMXN(h, prices)
            const valueUSD = h.quantity * (price?.usd ?? 0)
            const costMXN = getCostMXN(h, usdToMxn)
            const pl = costMXN > 0 ? valueMXN - costMXN : null
            const plPct = costMXN > 0 && pl !== null ? (pl / costMXN) * 100 : null
            const change = price?.change24h ?? 0

            return (
              <GlassCard key={h.id} className="p-4 relative group">
                <div className="absolute top-3 right-3 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openTxForm(h.symbol, h.owner, h.id)} className="p-1.5 rounded-md hover:bg-emerald-500/20" title="Log transaction">
                    <Plus className="h-3.5 w-3.5 text-emerald-400" />
                  </button>
                  <button onClick={() => editHolding(h)} className="p-1.5 rounded-md hover:bg-[hsl(var(--accent))]">
                    <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" />
                  </button>
                  <button onClick={() => handleDeleteHolding(h.id)} className="p-1.5 rounded-md hover:bg-red-500/20">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${COIN_COLORS[h.symbol] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-lg`}>
                    {COIN_ICONS[h.symbol] || '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-sm flex items-center gap-1.5">{h.name} <OwnerDot owner={h.owner} size="sm" /></p>
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))]">{h.symbol}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[hsl(var(--text-secondary))]">Holdings</span>
                    <span className="font-mono tabular-nums">{fmt(h.quantity, 8).replace(/\.?0+$/, '')} {h.symbol}</span>
                  </div>
                  {price && (
                    <>
                      <div className="flex justify-between text-xs">
                        <span className="text-[hsl(var(--text-secondary))]">Price</span>
                        <span className="font-mono tabular-nums">{fmtUSD(price.usd)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[hsl(var(--text-secondary))]">24h</span>
                        <span className={`font-mono tabular-nums ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                        </span>
                      </div>
                    </>
                  )}
                  <div className="border-t border-[hsl(var(--border))] my-2" />
                  <div className="flex justify-between text-xs">
                    <span className="text-[hsl(var(--text-secondary))]">Value (MXN)</span>
                    <span className="font-semibold text-emerald-400 tabular-nums">{fmtMXN(valueMXN)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[hsl(var(--text-secondary))]">Value (USD)</span>
                    <span className="font-semibold tabular-nums">{fmtUSD(valueUSD)}</span>
                  </div>
                  {pl !== null && (
                    <div className="flex justify-between text-xs">
                      <span className="text-[hsl(var(--text-secondary))]">P&L</span>
                      <span className={`font-semibold tabular-nums ${pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {pl >= 0 ? '+' : ''}{fmtMXN(pl)}
                        {plPct !== null && <span className="ml-1 text-[10px]">({plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%)</span>}
                      </span>
                    </div>
                  )}
                  {h.notes && <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-1 italic">{h.notes}</p>}
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Transaction History */}
      {filteredTx.length > 0 && (
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Transaction History</h3>
            <button onClick={() => openTxForm()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
              <Plus className="h-3.5 w-3.5" /> Log Transaction
            </button>
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Date</th>
                  <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-2">Type</th>
                  <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-2">Asset</th>
                  <th className="text-right text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-2">Qty</th>
                  <th className="text-right text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-2">Price/Coin</th>
                  <th className="text-right text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-2">Total</th>
                  <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-2">Exchange</th>
                  <th className="text-center text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-2">👤</th>
                  <th className="py-3 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.map(tx => (
                  <tr key={tx.id} className="border-b border-[hsl(var(--border))] last:border-0 group/row">
                    <td className="py-3 px-3 text-[hsl(var(--text-secondary))] tabular-nums">{tx.transaction_date.slice(5)}</td>
                    <td className="py-3 px-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        tx.type === 'buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {tx.type === 'buy' ? '🟢 Buy' : '🔴 Sell'}
                      </span>
                    </td>
                    <td className="py-3 px-2 font-medium">
                      <span className={`inline-block h-2 w-2 rounded-full mr-1.5 ${COIN_SOLIDS[tx.symbol] || ''}`} />
                      {tx.symbol}
                    </td>
                    <td className="py-3 px-2 text-right font-mono tabular-nums">{fmt(tx.quantity, 8).replace(/\.?0+$/, '')}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{fmtMXN(tx.price_per_coin_mxn)}</td>
                    <td className="py-3 px-2 text-right font-semibold tabular-nums">{fmtMXN(tx.total_mxn)}</td>
                    <td className="py-3 px-2 text-xs text-[hsl(var(--text-secondary))]">{tx.exchange || '—'}</td>
                    <td className="py-3 px-2 text-center"><OwnerDot owner={tx.owner} size="sm" /></td>
                    <td className="py-3 px-2">
                      <button onClick={() => handleDeleteTx(tx.id, tx.holding_id)}
                        className="p-1 rounded-md hover:bg-red-500/20 sm:opacity-0 sm:group-hover/row:opacity-100 transition-opacity">
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {filteredTx.map(tx => (
              <div key={tx.id} className="p-3 rounded-lg bg-[hsl(var(--accent))]/30 border border-[hsl(var(--border))]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      tx.type === 'buy' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}>{tx.type === 'buy' ? 'Buy' : 'Sell'}</span>
                    <span className="text-sm font-medium">{tx.symbol}</span>
                    <OwnerDot owner={tx.owner} size="sm" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{fmtMXN(tx.total_mxn)}</span>
                    <button onClick={() => handleDeleteTx(tx.id, tx.holding_id)} className="p-1 rounded-md hover:bg-red-500/20">
                      <Trash2 className="h-3 w-3 text-red-400" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-[hsl(var(--text-secondary))]">
                  <span>{tx.transaction_date.slice(5)} · {tx.exchange || 'No exchange'}</span>
                  <span className="tabular-nums">{fmt(tx.quantity, 8).replace(/\.?0+$/, '')} @ {fmtMXN(tx.price_per_coin_mxn)}</span>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Add Position Modal (simplified) */}
      {showHoldingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setShowHoldingForm(false)}>
          <div className="w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{holdingForm.id ? 'Edit Position' : 'Add Position'}</h2>
              <button onClick={() => setShowHoldingForm(false)} className="p-1 rounded-md hover:bg-[hsl(var(--accent))]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Asset</label>
                <div className="flex gap-2">
                  {['BTC', 'ETH', 'SOL'].map(s => (
                    <button key={s} onClick={() => setHoldingForm(f => ({ ...f, symbol: s }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${holdingForm.symbol === s ? 'bg-emerald-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]'}`}>
                      {COIN_ICONS[s]} {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Owner</label>
                <div className="flex gap-2">
                  {['Bernardo', 'Laura'].map(o => (
                    <button key={o} onClick={() => setHoldingForm(f => ({ ...f, owner: o }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${holdingForm.owner === o ? 'bg-emerald-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]'}`}>
                      <OwnerDot owner={o} size="sm" /> {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Wallet Address</label>
                <input type="text" placeholder="Optional" value={holdingForm.wallet_address}
                  onChange={e => setHoldingForm(f => ({ ...f, wallet_address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Notes</label>
                <input type="text" placeholder="Optional" value={holdingForm.notes}
                  onChange={e => setHoldingForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowHoldingForm(false)} className="flex-1 py-2 rounded-lg text-sm bg-[hsl(var(--accent))]">Cancel</button>
              <button onClick={handleSaveHolding} disabled={saving} className="flex-1 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
                {saving ? 'Saving...' : holdingForm.id ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Transaction Modal */}
      {showTxForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setShowTxForm(false)}>
          <div className="w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Log Transaction</h2>
              <button onClick={() => setShowTxForm(false)} className="p-1 rounded-md hover:bg-[hsl(var(--accent))]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              {/* Buy/Sell toggle */}
              <div className="flex gap-2">
                <button onClick={() => setTxForm(f => ({ ...f, type: 'buy' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${txForm.type === 'buy' ? 'bg-emerald-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]'}`}>
                  Buy
                </button>
                <button onClick={() => setTxForm(f => ({ ...f, type: 'sell' }))}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${txForm.type === 'sell' ? 'bg-red-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]'}`}>
                  Sell
                </button>
              </div>
              {/* Asset */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Asset</label>
                <div className="flex gap-2">
                  {['BTC', 'ETH', 'SOL'].map(s => (
                    <button key={s} onClick={() => setTxForm(f => ({ ...f, symbol: s }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${txForm.symbol === s ? 'bg-emerald-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]'}`}>
                      {COIN_ICONS[s]} {s}
                    </button>
                  ))}
                </div>
              </div>
              {/* Owner */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Owner</label>
                <div className="flex gap-2">
                  {['Bernardo', 'Laura'].map(o => (
                    <button key={o} onClick={() => setTxForm(f => ({ ...f, owner: o }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${txForm.owner === o ? 'bg-emerald-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]'}`}>
                      <OwnerDot owner={o} size="sm" /> {o}
                    </button>
                  ))}
                </div>
              </div>
              {/* Quantity */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Quantity *</label>
                <input type="number" step="any" placeholder="0.00125" value={txForm.quantity}
                  onChange={e => setTxForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              {/* Price per coin */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Price per coin (MXN) *</label>
                <input type="number" step="any" placeholder="1,850,000" value={txForm.price_per_coin_mxn}
                  onChange={e => setTxForm(f => ({ ...f, price_per_coin_mxn: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                {prices?.[txForm.symbol] && (
                  <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-1">
                    Current: {fmtMXN(prices[txForm.symbol].mxn)}
                  </p>
                )}
              </div>
              {/* Auto total */}
              <div className="p-3 rounded-lg bg-[hsl(var(--accent))]">
                <span className="text-xs text-[hsl(var(--text-secondary))]">Total</span>
                <p className="text-lg font-bold tabular-nums">{txTotal ? fmtMXN(txTotal) : '—'}</p>
              </div>
              {/* Date */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Date</label>
                <input type="date" value={txForm.transaction_date}
                  onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              {/* Exchange */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Exchange</label>
                <div className="flex gap-2">
                  {['Bitso', 'Binance', 'Other'].map(ex => (
                    <button key={ex} onClick={() => setTxForm(f => ({ ...f, exchange: f.exchange === ex ? '' : ex }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${txForm.exchange === ex ? 'bg-emerald-600 text-white' : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]'}`}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>
              {/* Notes */}
              <input type="text" placeholder="Optional notes" value={txForm.notes}
                onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </div>
            <button onClick={handleSaveTx}
              disabled={saving || !txForm.quantity || !txForm.price_per_coin_mxn}
              className={`w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${txForm.type === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}`}>
              {saving ? 'Saving...' : txForm.type === 'buy' ? 'Log Buy' : 'Log Sell'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
