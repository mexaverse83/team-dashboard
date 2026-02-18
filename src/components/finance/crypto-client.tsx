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

interface Prices {
  [symbol: string]: { usd: number; mxn: number; change24h: number }
}

interface FormData {
  id?: string
  symbol: string
  quantity: string
  avg_cost_basis_usd: string
  cost_currency: 'MXN' | 'USD'
  wallet_address: string
  owner: string
  notes: string
}

const EMPTY_FORM: FormData = { symbol: 'BTC', quantity: '', avg_cost_basis_usd: '', cost_currency: 'MXN', wallet_address: '', owner: 'Bernardo', notes: '' }

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

function fmtMXN(n: number) {
  return `$${fmt(n, 0)} MXN`
}

function fmtUSD(n: number) {
  return `$${fmt(n)} USD`
}

function getValueMXN(h: Holding, prices: Prices | null) {
  return h.quantity * (prices?.[h.symbol]?.mxn ?? 0)
}

export function CryptoClient() {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [prices, setPrices] = useState<Prices | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/crypto')
      const text = await res.text()
      if (!text) {
        setHoldings([])
        setPrices(null)
        return
      }
      const data = JSON.parse(text)
      if (data.dbError) console.warn('DB:', data.dbError)
      setHoldings(data.holdings || [])
      setPrices(data.prices || null)
    } catch (e: unknown) {
      console.error('Crypto fetch error:', e)
      setError('Failed to load crypto data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Sort holdings by descending MXN value
  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => getValueMXN(b, prices) - getValueMXN(a, prices))
  }, [holdings, prices])

  const handleSave = async () => {
    if (!form.quantity || parseFloat(form.quantity) <= 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/crypto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: form.id,
          symbol: form.symbol,
          quantity: parseFloat(form.quantity),
          avg_cost_basis_usd: form.avg_cost_basis_usd ? parseFloat(form.avg_cost_basis_usd) : null,
          cost_currency: form.cost_currency || 'MXN',
          wallet_address: form.wallet_address || null,
          owner: form.owner || 'Bernardo',
          notes: form.notes || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setShowForm(false)
      setForm(EMPTY_FORM)
      await fetchData()
    } catch {
      setError('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this holding?')) return
    try {
      await fetch('/api/finance/crypto', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await fetchData()
    } catch {
      setError('Failed to delete')
    }
  }

  const editHolding = (h: Holding) => {
    setForm({
      id: h.id,
      symbol: h.symbol,
      quantity: String(h.quantity),
      avg_cost_basis_usd: h.avg_cost_basis_usd ? String(h.avg_cost_basis_usd) : '',
      cost_currency: h.cost_currency || 'MXN',
      wallet_address: h.wallet_address || '',
      owner: h.owner || 'Bernardo',
      notes: h.notes || '',
    })
    setShowForm(true)
  }

  // Portfolio totals
  const totalUSD = holdings.reduce((sum, h) => sum + h.quantity * (prices?.[h.symbol]?.usd ?? 0), 0)
  const totalMXN = holdings.reduce((sum, h) => sum + getValueMXN(h, prices), 0)
  // USD→MXN rate from any available coin price
  const usdToMxn = (() => {
    if (!prices) return 17 // fallback
    for (const p of Object.values(prices)) {
      if (p.usd > 0 && p.mxn > 0) return p.mxn / p.usd
    }
    return 17
  })()

  const totalCostMXN = holdings.reduce((sum, h) => {
    if (!h.avg_cost_basis_usd) return sum
    const costPerCoinMXN = h.cost_currency === 'USD'
      ? h.avg_cost_basis_usd * usdToMxn
      : h.avg_cost_basis_usd
    return sum + h.quantity * costPerCoinMXN
  }, 0)
  const totalPL = totalCostMXN > 0 ? totalMXN - totalCostMXN : null
  const totalPLPct = totalPL !== null && totalCostMXN > 0 ? (totalPL / totalCostMXN) * 100 : null

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
            <Bitcoin className="h-5 w-5 text-orange-400" />
            Crypto Portfolio
          </h1>
          <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
            {prices ? 'Live prices via CoinGecko' : 'Prices unavailable'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchData} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/80 transition-colors">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
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
                {totalPLPct !== null && (
                  <span className="text-xs font-medium ml-1">({totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(1)}%)</span>
                )}
              </p>
            ) : (
              <p className="text-lg font-bold text-[hsl(var(--text-secondary))]">—</p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Allocation Bar */}
      {sortedHoldings.length > 0 && totalMXN > 0 && (
        <div>
          <div className="flex h-3 w-full rounded-full overflow-hidden">
            {sortedHoldings.map(h => {
              const pct = (getValueMXN(h, prices) / totalMXN) * 100
              if (pct < 0.5) return null
              return (
                <div
                  key={h.id}
                  className={`h-full first:rounded-l-full last:rounded-r-full ${COIN_SOLIDS[h.symbol] || 'bg-gray-500'}`}
                  style={{ width: `${pct}%` }}
                  title={`${h.symbol}: ${pct.toFixed(1)}%`}
                />
              )
            })}
          </div>
          <div className="flex gap-4 mt-1.5">
            {sortedHoldings.map(h => {
              const pct = totalMXN > 0 ? (getValueMXN(h, prices) / totalMXN) * 100 : 0
              return (
                <span key={h.id} className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--text-secondary))]">
                  <span className={`h-2 w-2 rounded-full ${COIN_SOLIDS[h.symbol] || 'bg-gray-500'}`} />
                  {h.symbol} {pct.toFixed(0)}%
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* Asset Cards */}
      {holdings.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <Bitcoin className="h-10 w-10 text-[hsl(var(--text-tertiary))] mx-auto mb-3" />
          <p className="text-sm font-medium">No holdings yet</p>
          <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">Add your first position to start tracking your crypto portfolio</p>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowForm(true) }}
            className="mt-4 px-4 py-2 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            Add Position
          </button>
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedHoldings.map(h => {
            const price = prices?.[h.symbol]
            const valueUSD = h.quantity * (price?.usd ?? 0)
            const valueMXN = h.quantity * (price?.mxn ?? 0)
            const costPerCoinMXN = h.avg_cost_basis_usd
              ? (h.cost_currency === 'USD' ? h.avg_cost_basis_usd * usdToMxn : h.avg_cost_basis_usd)
              : null
            const costMXN = costPerCoinMXN ? h.quantity * costPerCoinMXN : null
            const pl = costMXN ? valueMXN - costMXN : null
            const plPct = costMXN && costMXN > 0 ? (valueMXN / costMXN - 1) * 100 : null
            const change = price?.change24h ?? 0

            return (
              <GlassCard key={h.id} className="p-4 relative group">
                {/* Actions — visible on mobile, hover-reveal on desktop */}
                <div className="absolute top-3 right-3 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => editHolding(h)} className="p-1.5 rounded-md hover:bg-[hsl(var(--accent))]">
                    <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" />
                  </button>
                  <button onClick={() => handleDelete(h.id)} className="p-1.5 rounded-md hover:bg-red-500/20">
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </button>
                </div>

                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${COIN_COLORS[h.symbol] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white font-bold text-lg`}>
                    {COIN_ICONS[h.symbol] || '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-sm flex items-center gap-1.5">{h.name} <OwnerDot owner={h.owner} size="sm" /></p>
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))]">{h.symbol}</p>
                  </div>
                </div>

                {/* Holdings */}
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

                  {h.notes && (
                    <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-1 italic">{h.notes}</p>
                  )}
                </div>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{form.id ? 'Edit Position' : 'Add Position'}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-md hover:bg-[hsl(var(--accent))]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Symbol */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Asset</label>
                <div className="flex gap-2">
                  {['BTC', 'ETH', 'SOL'].map(s => (
                    <button
                      key={s}
                      onClick={() => setForm(f => ({ ...f, symbol: s }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                        form.symbol === s
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]'
                      }`}
                    >
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
                    <button
                      key={o}
                      onClick={() => setForm(f => ({ ...f, owner: o }))}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        form.owner === o
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]'
                      }`}
                    >
                      <OwnerDot owner={o} size="sm" /> {o}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Quantity *</label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00000000"
                  value={form.quantity}
                  onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Cost Basis */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Avg Cost Basis (per coin)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    placeholder="Optional"
                    value={form.avg_cost_basis_usd}
                    onChange={e => setForm(f => ({ ...f, avg_cost_basis_usd: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="flex rounded-lg overflow-hidden border border-[hsl(var(--border))]">
                    {(['MXN', 'USD'] as const).map(c => (
                      <button
                        key={c}
                        onClick={() => setForm(f => ({ ...f, cost_currency: c }))}
                        className={`px-3 py-2 text-xs font-medium transition-colors ${
                          form.cost_currency === c
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Wallet */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Wallet Address</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={form.wallet_address}
                  onChange={e => setForm(f => ({ ...f, wallet_address: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Notes</label>
                <input
                  type="text"
                  placeholder="Optional"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-2 rounded-lg text-sm bg-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.quantity || parseFloat(form.quantity) <= 0}
                className="flex-1 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : form.id ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
