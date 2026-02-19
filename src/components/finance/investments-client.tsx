'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { GlassCard } from '@/components/ui/glass-card'
import { OwnerDot, OwnerBar } from '@/components/finance/owner-dot'
import { CryptoClient } from '@/components/finance/crypto-client'
import { WestTracker, WestCompactWidget } from '@/components/finance/west-tracker'
import { RetirementTab } from '@/components/finance/retirement-client'
import { PrivateEquityCard, type PrivateEquityHolding } from '@/components/finance/private-equity-card'
import {
  TrendingUp, TrendingDown, Bitcoin, BarChart3, Shield, Home,
  Plus, Pencil, Trash2, X, RefreshCw,
} from 'lucide-react'
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, AreaChart, Area, XAxis, YAxis,
} from 'recharts'

// ─── Asset class colors ───
const ASSET_COLORS: Record<string, string> = {
  Crypto: '#f59e0b',
  Stocks: '#3b82f6',
  'Fixed Income': '#10b981',
  'Real Estate': '#8b5cf6',
  Retirement: '#64748b', // slate-500 — locked/long-term
}

// ─── Formatting ───
function fmt(n: number, d = 2) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)
}
function fmtMXN(n: number) { return `$${fmt(n, 0)} MXN` }
function fmtUSD(n: number) { return `$${fmt(n)} USD` }
// Defensive: DB may store rates as percentage (10.26) instead of decimal (0.1026)
function normalizeRate(r: number | null | undefined): number {
  if (r == null) return 0
  return r > 1 ? r / 100 : r
}
// For commission-bearing instruments: always compute net from gross - commission.
// The stored net_annual_rate is unreliable (DB corruption risk). If no commission, use stored or gross.
function effectiveNetRate(inst: { annual_rate: number; commission_rate: number | null; net_annual_rate: number | null }): number {
  const gross = normalizeRate(inst.annual_rate)
  const comm = normalizeRate(inst.commission_rate)
  if (inst.commission_rate != null) return gross - comm          // always compute when commission exists
  if (inst.net_annual_rate != null) return normalizeRate(inst.net_annual_rate)
  return gross
}
function cn(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' ') }

// ─── Types ───
interface StockHolding {
  id: string; ticker: string; name: string; exchange: string; asset_type: string
  shares: number; avg_cost_basis: number; currency: string; broker: string | null
  owner: string; notes: string | null
  // Private equity fields
  current_price_usd?: number; target_price_usd?: number
  expected_exit_start?: string; expected_exit_end?: string
  is_liquid?: boolean; valuation_type?: string
}

interface FixedIncomeInstrument {
  id: string; instrument_type: string; name: string; institution: string
  principal: number; annual_rate: number; term_days: number | null
  maturity_date: string | null; is_liquid: boolean; auto_renew: boolean
  owner: string; tier: number; notes: string | null
  commission_rate: number | null; net_annual_rate: number | null; settlement_days: number | null
}

interface RealEstateProperty {
  id: string; name: string; property_type: string
  purchase_price: number; purchase_date: string | null; current_value: number
  last_valuation_date: string | null; mortgage_balance: number | null
  monthly_mortgage: number | null; mortgage_rate: number | null
  mortgage_bank: string | null; rental_income: number | null
  monthly_expenses: number | null; address: string | null; owner: string; notes: string | null
}

interface PortfolioSnapshot { date: string; total: number }

type Tab = 'Portfolio' | 'Crypto' | 'Stocks' | 'Fixed Income' | 'Real Estate' | 'Retirement'

const TABS: Tab[] = ['Portfolio', 'Crypto', 'Stocks', 'Fixed Income', 'Real Estate', 'Retirement']

// ─── Owner Toggle ───
function OwnerToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 p-1 bg-[hsl(var(--accent))] rounded-lg w-fit">
      {['All', 'Bernardo', 'Laura'].map(f => (
        <button key={f} onClick={() => onChange(f)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            value === f
              ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]"
          )}>
          {f !== 'All' && <OwnerDot owner={f} size="sm" className="mr-1.5 inline-block" />}
          {f}
        </button>
      ))}
    </div>
  )
}

// ─── Tier Badge ───
function TierBadge({ tier }: { tier: number }) {
  const config: Record<number, { label: string; color: string; tooltip: string }> = {
    1: { label: 'Tier 1', color: 'bg-emerald-500/10 text-emerald-400', tooltip: 'Fintech — Nu, Mercado Pago' },
    2: { label: 'Tier 2', color: 'bg-blue-500/10 text-blue-400', tooltip: 'Regulated Broker/Neobank — GBM, Hey Banco, Klar (INDEVAL custody, no deposit insurance)' },
    3: { label: 'Tier 3', color: 'bg-amber-500/10 text-amber-400', tooltip: 'Higher yield — CETES, Supertasas, Kubo. PROSOFIPO cap: $190K/institution' },
  }
  const c = config[tier] || { label: `Tier ${tier}`, color: 'bg-gray-500/10 text-gray-400', tooltip: '' }
  return (
    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full cursor-help", c.color)} title={c.tooltip}>
      {c.label}
    </span>
  )
}

// ─── Tooltip style ───
const tooltipStyle = {
  contentStyle: { background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' },
  itemStyle: { color: 'hsl(var(--foreground))' },
}

// ─── Main Component ───
export function InvestmentsClient({ initialTab }: { initialTab?: string }) {
  const [activeTab, setActiveTab] = useState<Tab>(
    TABS.includes(initialTab as Tab) ? (initialTab as Tab) : 'Portfolio'
  )
  const [ownerFilter, setOwnerFilter] = useState('All')

  // Data states
  const [cryptoTotal, setCryptoTotal] = useState({ mxn: 0, usd: 0, cost: 0, positions: 0 })
  const [cryptoByOwner, setCryptoByOwner] = useState({ bernardo: 0, laura: 0 })
  const [stocks, setStocks] = useState<StockHolding[]>([])
  const [fixedIncome, setFixedIncome] = useState<FixedIncomeInstrument[]>([])
  const [realEstate, setRealEstate] = useState<RealEstateProperty[]>([])
  const [retirementTotal, setRetirementTotal] = useState(0)
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Form states
  const [showStockForm, setShowStockForm] = useState(false)
  const [showFIForm, setShowFIForm] = useState(false)
  const [showREForm, setShowREForm] = useState(false)
  const [stockForm, setStockForm] = useState<Partial<StockHolding> & { id?: string }>({})
  const [fiForm, setFIForm] = useState<Partial<FixedIncomeInstrument> & { id?: string }>({})
  const [reForm, setREForm] = useState<Partial<RealEstateProperty> & { id?: string }>({})
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [cryptoRes, stocksRes, fiRes, reRes, retirementRes] = await Promise.all([
        fetch('/api/finance/crypto').then(r => r.text()).then(t => t ? JSON.parse(t) : null).catch(() => null),
        fetch('/api/finance/investments/stocks').then(r => r.ok ? r.json() : { stocks: [] }).catch(() => ({ stocks: [] })),
        fetch('/api/finance/investments/fixed-income').then(r => r.ok ? r.json() : { instruments: [] }).catch(() => ({ instruments: [] })),
        fetch('/api/finance/investments/real-estate').then(r => r.ok ? r.json() : { properties: [] }).catch(() => ({ properties: [] })),
        fetch('/api/finance/retirement').then(r => r.ok ? r.json() : { total_balance: 0 }).catch(() => ({ total_balance: 0 })),
      ])

      // Compute crypto totals from existing API
      if (cryptoRes?.holdings && cryptoRes?.prices) {
        const holdings = cryptoRes.holdings as Array<{ quantity: number; symbol: string; avg_cost_basis_usd: number | null; cost_currency: string; owner: string }>
        const prices = cryptoRes.prices as Record<string, { usd: number; mxn: number }>
        const usdToMxn = Object.values(prices).find(p => p.usd > 0 && p.mxn > 0)
          ? Object.values(prices).find(p => p.usd > 0)!.mxn / Object.values(prices).find(p => p.usd > 0)!.usd : 17
        const mxn = holdings.reduce((s, h) => s + h.quantity * (prices[h.symbol]?.mxn ?? 0), 0)
        const usd = holdings.reduce((s, h) => s + h.quantity * (prices[h.symbol]?.usd ?? 0), 0)
        const cost = holdings.reduce((s, h) => {
          if (!h.avg_cost_basis_usd) return s
          return s + h.quantity * (h.cost_currency === 'USD' ? h.avg_cost_basis_usd * usdToMxn : h.avg_cost_basis_usd)
        }, 0)
        setCryptoTotal({ mxn, usd, cost, positions: holdings.filter((h: { quantity: number }) => h.quantity > 0).length })
        const bermxn = holdings.filter(h => h.owner?.toLowerCase() === 'bernardo').reduce((s, h) => s + h.quantity * (prices[h.symbol]?.mxn ?? 0), 0)
        const lauramxn = holdings.filter(h => h.owner?.toLowerCase() === 'laura').reduce((s, h) => s + h.quantity * (prices[h.symbol]?.mxn ?? 0), 0)
        setCryptoByOwner({ bernardo: bermxn, laura: lauramxn })
      }

      setStocks(stocksRes.stocks || [])
      setFixedIncome(fiRes.instruments || [])
      setRealEstate(reRes.properties || [])
      setRetirementTotal(retirementRes.total_balance || 0)
    } catch (e) {
      console.error('Investments fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Filtered data
  const privateEquityHoldings = useMemo(() =>
    (ownerFilter === 'All' ? stocks : stocks.filter(s => s.owner === ownerFilter))
      .filter((s): s is StockHolding & PrivateEquityHolding => s.asset_type === 'private_equity'),
    [stocks, ownerFilter])
  const filteredStocks = useMemo(() => (ownerFilter === 'All' ? stocks : stocks.filter(s => s.owner === ownerFilter)).filter(s => s.asset_type !== 'private_equity'), [stocks, ownerFilter])
  const filteredFI = useMemo(() => ownerFilter === 'All' ? fixedIncome : fixedIncome.filter(i => i.owner === ownerFilter), [fixedIncome, ownerFilter])
  const filteredRE = useMemo(() => ownerFilter === 'All' ? realEstate : realEstate.filter(p => p.owner === ownerFilter), [realEstate, ownerFilter])

  // FX rate (declared early — needed by per-owner memos below)
  const fxRate = 17.13 // TODO: pull from live crypto prices API

  // ─── Per-owner totals (unfiltered — full ownership breakdown) ───
  const stocksByOwner = useMemo(() => {
    const b = stocks.filter(s => s.owner?.toLowerCase() === 'bernardo')
    const l = stocks.filter(s => s.owner?.toLowerCase() === 'laura')
    const val = (arr: typeof stocks) =>
      arr.filter(s => s.asset_type === 'private_equity').reduce((s, h) => s + h.shares * (h.current_price_usd || 0) * fxRate, 0)
      + arr.filter(s => s.asset_type !== 'private_equity').reduce((s, h) => s + h.shares * h.avg_cost_basis, 0)
    return { bernardo: val(b), laura: val(l), bCount: b.length, lCount: l.length }
  }, [stocks, fxRate])

  const fiByOwner = useMemo(() => {
    const b = fixedIncome.filter(i => i.owner?.toLowerCase() === 'bernardo')
    const l = fixedIncome.filter(i => i.owner?.toLowerCase() === 'laura')
    // Count unique funds (groups), not raw records
    const uniqueKeys = new Set(fixedIncome.map(i => `${i.institution}::${i.name.trim()}::${i.instrument_type}`))
    const bKeys = new Set(b.map(i => `${i.institution}::${i.name.trim()}::${i.instrument_type}`))
    const lKeys = new Set(l.map(i => `${i.institution}::${i.name.trim()}::${i.instrument_type}`))
    return {
      bernardo: b.reduce((s, i) => s + i.principal, 0),
      laura: l.reduce((s, i) => s + i.principal, 0),
      bCount: bKeys.size, lCount: lKeys.size, uniqueCount: uniqueKeys.size,
    }
  }, [fixedIncome])

  // ─── Group FI by fund identity — same fund held by multiple owners → one card ───
  const groupedFI = useMemo(() => {
    const groups = new Map<string, FixedIncomeInstrument[]>()
    fixedIncome.forEach(inst => {
      const key = `${inst.institution}::${inst.name.trim()}::${inst.instrument_type}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(inst)
    })
    return Array.from(groups.values())
      .map(members => {
        const filtered = ownerFilter === 'All' ? members : members.filter(i => i.owner === ownerFilter)
        if (filtered.length === 0) return null
        const totalPrincipal = filtered.reduce((s, i) => s + i.principal, 0)
        return { representative: members[0], allMembers: members, filtered, totalPrincipal }
      })
      .filter(Boolean) as Array<{
        representative: FixedIncomeInstrument
        allMembers: FixedIncomeInstrument[]
        filtered: FixedIncomeInstrument[]
        totalPrincipal: number
      }>
  }, [fixedIncome, ownerFilter])

  const reByOwner = useMemo(() => {
    const b = realEstate.filter(p => p.owner?.toLowerCase() === 'bernardo')
    const l = realEstate.filter(p => p.owner?.toLowerCase() === 'laura')
    const equity = (arr: typeof realEstate) => arr.reduce((s, p) => s + (p.current_value || 0) - (p.mortgage_balance || 0), 0)
    return { bernardo: equity(b), laura: equity(l), bCount: b.length, lCount: l.length }
  }, [realEstate])

  // Portfolio totals
  const peTotal = privateEquityHoldings.reduce((s, h) => s + h.shares * (h.current_price_usd || 0) * fxRate, 0)
  const stocksTotal = filteredStocks.reduce((s, h) => s + h.shares * h.avg_cost_basis, 0) + peTotal
  const fiTotal = filteredFI.reduce((s, i) => s + i.principal, 0)
  const reTotal = filteredRE.reduce((s, p) => s + (p.current_value || 0) - (p.mortgage_balance || 0), 0)
  const cryptoMXN = cryptoTotal.mxn // TODO: filter by owner
  const totalPortfolio = cryptoMXN + stocksTotal + fiTotal + reTotal + retirementTotal
  const totalCost = cryptoTotal.cost + filteredStocks.reduce((s, h) => s + h.shares * h.avg_cost_basis, 0) + fiTotal
  const totalPL = totalCost > 0 ? totalPortfolio - totalCost : null
  const totalPLPct = totalPL !== null && totalCost > 0 ? (totalPL / totalCost) * 100 : null

  const allocationData = [
    { name: 'Crypto', value: cryptoMXN, pct: totalPortfolio > 0 ? (cryptoMXN / totalPortfolio) * 100 : 0 },
    { name: 'Stocks', value: stocksTotal, pct: totalPortfolio > 0 ? (stocksTotal / totalPortfolio) * 100 : 0 },
    { name: 'Fixed Income', value: fiTotal, pct: totalPortfolio > 0 ? (fiTotal / totalPortfolio) * 100 : 0 },
    { name: 'Real Estate', value: reTotal, pct: totalPortfolio > 0 ? (reTotal / totalPortfolio) * 100 : 0 },
    { name: 'Retirement', value: retirementTotal, pct: totalPortfolio > 0 ? (retirementTotal / totalPortfolio) * 100 : 0 },
  ].filter(a => a.value > 0)

  const assetClasses = [
    { name: 'Crypto', tab: 'Crypto' as Tab, icon: Bitcoin, gradient: 'from-amber-500 to-orange-500', borderColor: 'border-amber-500', totalMXN: cryptoMXN, pl: cryptoTotal.cost > 0 ? cryptoMXN - cryptoTotal.cost : 0, plPct: cryptoTotal.cost > 0 ? ((cryptoMXN - cryptoTotal.cost) / cryptoTotal.cost) * 100 : 0, positionCount: cryptoTotal.positions, locked: false, bernardo: cryptoByOwner.bernardo, laura: cryptoByOwner.laura },
    { name: 'Stocks', tab: 'Stocks' as Tab, icon: BarChart3, gradient: 'from-blue-500 to-cyan-500', borderColor: 'border-blue-500', totalMXN: stocksTotal, pl: 0, plPct: 0, positionCount: (ownerFilter === 'All' ? stocks : stocks.filter(s => s.owner?.toLowerCase() === ownerFilter.toLowerCase())).length, locked: false, bernardo: stocksByOwner.bernardo, laura: stocksByOwner.laura },
    { name: 'Fixed Income', tab: 'Fixed Income' as Tab, icon: Shield, gradient: 'from-emerald-500 to-teal-500', borderColor: 'border-emerald-500', totalMXN: fiTotal, pl: 0, plPct: 0, positionCount: groupedFI.length, locked: false, bernardo: fiByOwner.bernardo, laura: fiByOwner.laura },
    { name: 'Real Estate', tab: 'Real Estate' as Tab, icon: Home, gradient: 'from-violet-500 to-purple-500', borderColor: 'border-violet-500', totalMXN: reTotal, pl: 0, plPct: 0, positionCount: filteredRE.length, locked: false, bernardo: reByOwner.bernardo, laura: reByOwner.laura },
    { name: 'Retirement', tab: 'Retirement' as Tab, icon: Shield, gradient: 'from-slate-500 to-slate-600', borderColor: 'border-slate-500', totalMXN: retirementTotal, pl: 0, plPct: 0, positionCount: retirementTotal > 0 ? 3 : 0, locked: true, bernardo: 0, laura: 0 },
  ]

  // ─── CRUD helpers ───
  const saveStock = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/investments/stocks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stockForm),
      })
      if (!res.ok) throw new Error('Save failed')
      setShowStockForm(false); setStockForm({})
      await fetchData()
    } catch { setError('Failed to save stock') }
    finally { setSaving(false) }
  }

  const deleteStock = async (id: string) => {
    if (!confirm('Delete this stock holding?')) return
    try {
      await fetch('/api/finance/investments/stocks', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      await fetchData()
    } catch { setError('Failed to delete') }
  }

  const saveFI = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/investments/fixed-income', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fiForm),
      })
      if (!res.ok) throw new Error('Save failed')
      setShowFIForm(false); setFIForm({})
      await fetchData()
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  const deleteFI = async (id: string) => {
    if (!confirm('Delete this instrument?')) return
    try {
      await fetch('/api/finance/investments/fixed-income', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      await fetchData()
    } catch { setError('Failed to delete') }
  }

  const saveRE = async () => {
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/investments/real-estate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reForm),
      })
      if (!res.ok) throw new Error('Save failed')
      setShowREForm(false); setREForm({})
      await fetchData()
    } catch { setError('Failed to save') }
    finally { setSaving(false) }
  }

  const deleteRE = async (id: string) => {
    if (!confirm('Delete this property?')) return
    try {
      await fetch('/api/finance/investments/real-estate', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      })
      await fetchData()
    } catch { setError('Failed to delete') }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-8 w-48 rounded bg-[hsl(var(--accent))] animate-pulse" />
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-48 rounded-xl bg-[hsl(var(--accent))] animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Investments</h1>
          <p className="text-[hsl(var(--text-secondary))] text-sm">Portfolio overview and asset tracking</p>
        </div>
        <OwnerToggle value={ownerFilter} onChange={setOwnerFilter} />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-[hsl(var(--border))] overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative",
              activeTab === tab
                ? "text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]"
            )}>
            {tab}
            {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(var(--foreground))] rounded-full" />}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {/* ═══════════ PORTFOLIO TAB ═══════════ */}
      {activeTab === 'Portfolio' && (
        <div className="space-y-6">
          {/* WEST Target Tracker — compact on Portfolio, full on Real Estate tab */}
          <WestCompactWidget />

          {/* Net Worth Hero */}
          <GlassCard className="p-5 sm:p-6 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-emerald-500/5 rounded-full blur-3xl" />
            <div className="relative">
              <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Net Worth</span>
              <p className="text-3xl sm:text-4xl font-bold tabular-nums mt-1">{fmtMXN(totalPortfolio)}</p>
              {totalPL !== null && (
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium mt-3",
                  totalPL >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                )}>
                  {totalPL >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {totalPL >= 0 ? '+' : ''}{fmtMXN(totalPL)} ({totalPLPct?.toFixed(1)}%)
                </div>
              )}
              {snapshots.length > 1 && (
                <div className="mt-4 h-16 sm:h-20">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={snapshots}>
                      <defs>
                        <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10B981" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="total" stroke="#10B981" strokeWidth={1.5} fill="url(#portfolioGrad)" />
                      <XAxis dataKey="date" hide />
                      <YAxis hide domain={['dataMin - 5000', 'dataMax + 5000']} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Allocation Donut + Asset Class Cards */}
          <div className="grid gap-4 lg:grid-cols-5">
            {/* Donut */}
            {allocationData.length > 0 && (
              <GlassCard className="lg:col-span-2 flex flex-col items-center justify-center py-6">
                <h3 className="text-sm font-semibold mb-4">Allocation</h3>
                <div className="h-48 w-48 sm:h-56 sm:w-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={allocationData} cx="50%" cy="50%" innerRadius={60} outerRadius={85} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {allocationData.map(entry => (
                          <Cell key={entry.name} fill={ASSET_COLORS[entry.name]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipStyle} formatter={(val) => [fmtMXN(Number(val))]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 mt-4">
                  {allocationData.map(a => (
                    <div key={a.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: ASSET_COLORS[a.name] }} />
                      <span className="text-xs text-[hsl(var(--text-secondary))]">{a.name}</span>
                      <span className="text-xs font-medium ml-auto tabular-nums">{a.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Asset Class Cards */}
            <div className={cn("grid grid-cols-2 gap-3", allocationData.length > 0 ? "lg:col-span-3" : "lg:col-span-5")}>
              {assetClasses.map(ac => (
                <button key={ac.name} onClick={() => setActiveTab(ac.tab)} className="text-left">
                  <GlassCard className={cn("p-4 h-full hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors cursor-pointer border-l-2", ac.borderColor)}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center bg-gradient-to-br text-white", ac.gradient)}>
                        <ac.icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">{ac.name}</span>
                    </div>
                    <p className="text-lg font-bold tabular-nums">{fmtMXN(ac.totalMXN)}</p>
                    <div className="flex items-center justify-between mt-1">
                      {ac.locked ? (
                        <span className="text-xs text-[hsl(var(--text-secondary))]">🔒 locked until 65</span>
                      ) : (
                        <span className={cn("text-xs font-medium", ac.pl >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {ac.plPct !== 0 ? `${ac.pl >= 0 ? '+' : ''}${ac.plPct.toFixed(1)}%` : '—'}
                        </span>
                      )}
                      <span className="text-xs text-[hsl(var(--text-secondary))]">
                        {ac.positionCount} position{ac.positionCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {'bernardo' in ac && !ac.locked && ownerFilter === 'All' && (ac.bernardo > 0 || ac.laura > 0) && (
                      <OwnerBar bernardo={ac.bernardo} laura={ac.laura} className="mt-2" />
                    )}
                  </GlassCard>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ CRYPTO TAB ═══════════ */}
      {activeTab === 'Crypto' && <CryptoClient />}

      {/* ═══════════ STOCKS TAB ═══════════ */}
      {activeTab === 'Stocks' && (
        <div className="space-y-4">

          {/* Owner breakdown */}
          {ownerFilter === 'All' && (stocksByOwner.bernardo > 0 || stocksByOwner.laura > 0) && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))] border-l-2 border-l-blue-500">
                <div className="flex items-center gap-2 mb-1"><OwnerDot owner="Bernardo" size="sm" /><span className="text-xs font-semibold">Bernardo</span></div>
                <p className="text-lg font-bold tabular-nums">{fmtMXN(stocksByOwner.bernardo)}</p>
                <p className="text-xs text-[hsl(var(--text-secondary))]">{stocksByOwner.bCount} position{stocksByOwner.bCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))] border-l-2 border-l-pink-500">
                <div className="flex items-center gap-2 mb-1"><OwnerDot owner="Laura" size="sm" /><span className="text-xs font-semibold">Laura</span></div>
                <p className="text-lg font-bold tabular-nums">{fmtMXN(stocksByOwner.laura)}</p>
                <p className="text-xs text-[hsl(var(--text-secondary))]">{stocksByOwner.lCount} position{stocksByOwner.lCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}

          {/* Private Equity section */}
          {privateEquityHoldings.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-3">
                Private Equity
              </p>
              {privateEquityHoldings.map(h => (
                <PrivateEquityCard key={h.id} holding={h as PrivateEquityHolding} fxRate={fxRate} />
              ))}
            </div>
          )}

          <div>
            {filteredStocks.length > 0 && (
              <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-3">
                Public Stocks
              </p>
            )}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Stock Holdings</h2>
            <button onClick={() => { setStockForm({ ticker: '', name: '', exchange: 'US', asset_type: 'stock', shares: 0, avg_cost_basis: 0, currency: 'MXN', broker: 'GBM', owner: 'Bernardo', notes: '' }); setShowStockForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Stock
            </button>
          </div>

          {filteredStocks.length === 0 ? (
            <GlassCard className="text-center py-12">
              <BarChart3 className="h-10 w-10 text-[hsl(var(--text-tertiary))] mx-auto mb-3" />
              <p className="text-sm font-medium">No stock holdings yet</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">Add stocks or ETFs you hold</p>
              <button onClick={() => { setStockForm({ ticker: '', name: '', exchange: 'US', asset_type: 'stock', shares: 0, avg_cost_basis: 0, currency: 'MXN', broker: 'GBM', owner: 'Bernardo' }); setShowStockForm(true) }}
                className="mt-4 px-4 py-2 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors">
                Add Stock
              </button>
            </GlassCard>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <GlassCard className="p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[hsl(var(--border))]">
                        <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-4">👤</th>
                        <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Ticker</th>
                        <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Name</th>
                        <th className="text-right text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Shares</th>
                        <th className="text-right text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Avg Cost</th>
                        <th className="text-right text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Value</th>
                        <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Broker</th>
                        <th className="py-3 px-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStocks.map(s => {
                        const value = s.shares * s.avg_cost_basis
                        return (
                          <tr key={s.id} className="border-b border-[hsl(var(--border))] last:border-0 group hover:bg-[hsl(var(--bg-elevated))]/50">
                            <td className="py-3 px-4"><OwnerDot owner={s.owner} size="sm" /></td>
                            <td className="py-3 px-3">
                              <span className="font-mono font-semibold text-blue-400">{s.ticker}</span>
                              {s.exchange === 'BMV' && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400">MX</span>}
                            </td>
                            <td className="py-3 px-3 text-[hsl(var(--text-secondary))]">{s.name}</td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums">{fmt(s.shares, 2)}</td>
                            <td className="py-3 px-3 text-right tabular-nums text-[hsl(var(--text-secondary))]">{fmtMXN(s.avg_cost_basis)}</td>
                            <td className="py-3 px-3 text-right tabular-nums font-semibold">{fmtMXN(value)}</td>
                            <td className="py-3 px-3 text-xs text-[hsl(var(--text-secondary))]">{s.broker}</td>
                            <td className="py-2 px-2">
                              <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <button onClick={() => { setStockForm(s); setShowStockForm(true) }} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]">
                                  <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" />
                                </button>
                                <button onClick={() => deleteStock(s.id)} className="p-1 rounded hover:bg-rose-500/10">
                                  <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </GlassCard>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {filteredStocks.map(s => (
                  <div key={s.id} className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))]">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-blue-400 text-sm">{s.ticker}</span>
                        {s.exchange === 'BMV' && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400">MX</span>}
                        <OwnerDot owner={s.owner} size="sm" />
                      </div>
                      <span className="text-sm font-semibold tabular-nums">{fmtMXN(s.shares * s.avg_cost_basis)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[hsl(var(--text-secondary))]">
                      <span>{s.name} · {s.broker}</span>
                      <span className="tabular-nums">{fmt(s.shares, 2)} shares</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {/* Private equity footnote */}
          {privateEquityHoldings.length > 0 && peTotal > 0 && (
            <p className="text-xs text-[hsl(var(--text-tertiary))] italic px-1">
              * Includes {`$${Math.round(peTotal).toLocaleString()} MXN`} estimated private equity (Nexaminds, illiquid until exit)
            </p>
          )}
          </div>{/* close Public Stocks div */}
        </div>
      )}

      {/* ═══════════ FIXED INCOME TAB ═══════════ */}
      {activeTab === 'Fixed Income' && (
        <div className="space-y-6">
          {/* Owner breakdown */}
          {ownerFilter === 'All' && (fiByOwner.bernardo > 0 || fiByOwner.laura > 0) && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))] border-l-2 border-l-blue-500">
                <div className="flex items-center gap-2 mb-1"><OwnerDot owner="Bernardo" size="sm" /><span className="text-xs font-semibold">Bernardo</span></div>
                <p className="text-lg font-bold tabular-nums">{fmtMXN(fiByOwner.bernardo)}</p>
                <p className="text-xs text-[hsl(var(--text-secondary))]">{fiByOwner.bCount} position{fiByOwner.bCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))] border-l-2 border-l-pink-500">
                <div className="flex items-center gap-2 mb-1"><OwnerDot owner="Laura" size="sm" /><span className="text-xs font-semibold">Laura</span></div>
                <p className="text-lg font-bold tabular-nums">{fmtMXN(fiByOwner.laura)}</p>
                <p className="text-xs text-[hsl(var(--text-secondary))]">{fiByOwner.lCount} position{fiByOwner.lCount !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
            <GlassCard>
              <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Invested</span>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-1 tabular-nums">{fmtMXN(fiTotal)}</p>
            </GlassCard>
            <GlassCard>
              <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Avg Yield</span>
              <p className="text-2xl sm:text-3xl font-bold mt-1 tabular-nums">
                {filteredFI.length > 0 ? `${(filteredFI.reduce((s, i) => s + i.annual_rate * i.principal, 0) / Math.max(fiTotal, 1) * 100).toFixed(2)}%` : '—'}
              </p>
            </GlassCard>
            <GlassCard className="col-span-2 sm:col-span-1">
              <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Monthly Interest</span>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-1 tabular-nums">
                {fmtMXN(filteredFI.reduce((s, i) => s + (i.principal * i.annual_rate) / 12, 0))}
              </p>
            </GlassCard>
          </div>

          <div className="flex justify-end">
            <button onClick={() => { setFIForm({ instrument_type: 'cetes', name: '', institution: '', principal: 0, annual_rate: 0, term_days: null, maturity_date: null, is_liquid: false, auto_renew: false, owner: 'Bernardo', tier: 1 }); setShowFIForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Instrument
            </button>
          </div>

          {groupedFI.length === 0 ? (
            <GlassCard className="text-center py-12">
              <Shield className="h-10 w-10 text-[hsl(var(--text-tertiary))] mx-auto mb-3" />
              <p className="text-sm font-medium">No fixed income instruments yet</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">Add your CETES, Hey Banco, Nu investments</p>
            </GlassCard>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {groupedFI.map(group => {
                const inst = group.representative
                const isMultiOwner = ownerFilter === 'All' && group.allMembers.length > 1
                const bernMember = group.allMembers.find(i => i.owner?.toLowerCase() === 'bernardo')
                const lauraMember = group.allMembers.find(i => i.owner?.toLowerCase() === 'laura')
                const netRate = effectiveNetRate(inst)
                return (
                  <GlassCard key={`${inst.institution}-${inst.name.trim()}-${inst.instrument_type}`} className="p-4 relative group">
                    <div className="absolute top-3 right-3 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {group.filtered.map(i => (
                        <button key={i.id} onClick={() => { setFIForm(i); setShowFIForm(true) }} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]" title={`Edit ${i.owner}`}>
                          <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" />
                        </button>
                      ))}
                      {group.filtered.map(i => (
                        <button key={`del-${i.id}`} onClick={() => deleteFI(i.id)} className="p-1 rounded hover:bg-rose-500/10" title={`Delete ${i.owner}`}>
                          <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                        {inst.institution.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                          {inst.name.trim()}
                          {/* Show all owners' dots when multi-owner */}
                          {isMultiOwner
                            ? group.allMembers.map(i => <OwnerDot key={i.id} owner={i.owner} size="sm" />)
                            : <OwnerDot owner={group.filtered[0]?.owner} size="sm" />
                          }
                        </h4>
                        <p className="text-xs text-[hsl(var(--text-secondary))]">{inst.institution}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-[hsl(var(--text-secondary))]">Principal</span>
                        <span className="font-semibold tabular-nums">{fmtMXN(group.totalPrincipal)}</span>
                      </div>

                      {/* Owner split when showing both */}
                      {isMultiOwner && (
                        <div className="flex flex-col gap-1 p-2 rounded-lg bg-[hsl(var(--bg-elevated))]/40 border border-[hsl(var(--border))]">
                          {bernMember && (
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5"><OwnerDot owner="Bernardo" size="sm" /><span className="text-[hsl(var(--text-secondary))]">Bernardo</span></span>
                              <span className="tabular-nums font-medium">{fmtMXN(bernMember.principal)} <span className="text-[hsl(var(--text-tertiary))]">({((bernMember.principal / group.totalPrincipal) * 100).toFixed(0)}%)</span></span>
                            </div>
                          )}
                          {lauraMember && (
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5"><OwnerDot owner="Laura" size="sm" /><span className="text-[hsl(var(--text-secondary))]">Laura</span></span>
                              <span className="tabular-nums font-medium">{fmtMXN(lauraMember.principal)} <span className="text-[hsl(var(--text-tertiary))]">({((lauraMember.principal / group.totalPrincipal) * 100).toFixed(0)}%)</span></span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rates */}
                      {inst.commission_rate ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-[hsl(var(--text-secondary))]">Gross Rate</span>
                            <span className="font-semibold text-[hsl(var(--text-secondary))] tabular-nums">{(normalizeRate(inst.annual_rate) * 100).toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[hsl(var(--text-secondary))]">Commission</span>
                            <span className="tabular-nums text-amber-400">-{(normalizeRate(inst.commission_rate) * 100).toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between border-t border-[hsl(var(--border))] pt-1">
                            <span className="text-[hsl(var(--text-secondary))] font-medium">Net Rate</span>
                            <span className="font-bold text-emerald-400 tabular-nums">{(netRate * 100).toFixed(2)}%</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--text-secondary))]">Rate</span>
                          <span className="font-semibold text-emerald-400 tabular-nums">{(normalizeRate(inst.annual_rate) * 100).toFixed(2)}%</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-[hsl(var(--text-secondary))]">Term</span>
                        <span>
                          {inst.is_liquid ? (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-medium">Liquid</span>
                          ) : inst.settlement_days ? (
                            <span className="tabular-nums">{inst.settlement_days}d settlement</span>
                          ) : (
                            <span className="tabular-nums">{inst.term_days}d{inst.maturity_date ? ` → ${inst.maturity_date.slice(5)}` : ''}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[hsl(var(--text-secondary))]">Net Annual Yield</span>
                        <span className="font-semibold tabular-nums">{fmtMXN(group.totalPrincipal * netRate)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[hsl(var(--border))]">
                      <TierBadge tier={inst.tier} />
                      {inst.auto_renew && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">Auto-renew</span>
                      )}
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ REAL ESTATE TAB ═══════════ */}
      {activeTab === 'Real Estate' && (
        <div className="space-y-6">
          {/* WEST Target Tracker — THE #1 widget, lives in Real Estate */}
          <WestTracker />

          {/* Owner breakdown */}
          {ownerFilter === 'All' && (reByOwner.bernardo > 0 || reByOwner.laura > 0) && (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))] border-l-2 border-l-blue-500">
                <div className="flex items-center gap-2 mb-1"><OwnerDot owner="Bernardo" size="sm" /><span className="text-xs font-semibold">Bernardo</span></div>
                <p className="text-lg font-bold tabular-nums">{fmtMXN(reByOwner.bernardo)}</p>
                <p className="text-xs text-[hsl(var(--text-secondary))]">{reByOwner.bCount} propert{reByOwner.bCount !== 1 ? 'ies' : 'y'}</p>
              </div>
              <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))] border-l-2 border-l-pink-500">
                <div className="flex items-center gap-2 mb-1"><OwnerDot owner="Laura" size="sm" /><span className="text-xs font-semibold">Laura</span></div>
                <p className="text-lg font-bold tabular-nums">{fmtMXN(reByOwner.laura)}</p>
                <p className="text-xs text-[hsl(var(--text-secondary))]">
                  {reByOwner.lCount} propert{reByOwner.lCount !== 1 ? 'ies' : 'y'}
                  {reByOwner.lCount === 0 && <span className="ml-1 text-[hsl(var(--text-tertiary))]">· Infonavit in Retirement</span>}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Properties</h2>
            <button onClick={() => { setREForm({ name: '', property_type: 'apartment', purchase_price: 0, current_value: 0, owner: 'Bernardo' }); setShowREForm(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-violet-600 hover:bg-violet-500 text-white transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Property
            </button>
          </div>

          {filteredRE.length === 0 ? (
            <GlassCard className="text-center py-12">
              <Home className="h-10 w-10 text-[hsl(var(--text-tertiary))] mx-auto mb-3" />
              <p className="text-sm font-medium">No properties yet</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">Add your real estate assets</p>
            </GlassCard>
          ) : (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {filteredRE.map(prop => {
                const isPreSale = prop.property_type === 'pre_sale'
                const isSalePending = prop.property_type === 'sale_pending'
                const equity = (prop.current_value || 0) - (prop.mortgage_balance || 0)
                const appreciation = prop.purchase_price > 0
                  ? ((prop.current_value - prop.purchase_price) / prop.purchase_price) * 100 : null
                const monthlyCashFlow = (prop.rental_income || 0) - (prop.monthly_mortgage || 0) - (prop.monthly_expenses || 0)
                const valuationAge = prop.last_valuation_date
                  ? Math.floor((Date.now() - new Date(prop.last_valuation_date).getTime()) / (1000 * 60 * 60 * 24 * 30)) : null
                const propertyTypeLabel = isPreSale ? 'Pre-sale' : isSalePending ? 'Sale Pending' : prop.property_type
                const propertyTypeColor = isPreSale ? 'bg-blue-500/10 text-blue-400' : isSalePending ? 'bg-amber-500/10 text-amber-400' : 'bg-violet-500/10 text-violet-400'
                const mortgageLabelText = isPreSale ? 'Remaining to Developer' : 'Mortgage'
                const equityLabelText = isPreSale ? 'Unrealized Equity' : isSalePending ? 'Net Proceeds' : 'Equity'

                return (
                  <GlassCard key={prop.id} className="p-4 relative group border-l-2 border-violet-500">
                    <div className="absolute top-3 right-3 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setREForm(prop); setShowREForm(true) }} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]">
                        <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" />
                      </button>
                      <button onClick={() => deleteRE(prop.id)} className="p-1 rounded hover:bg-rose-500/10">
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white">
                        <Home className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                          {prop.name} <OwnerDot owner={prop.owner} size="sm" />
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize", propertyTypeColor)}>{propertyTypeLabel}</span>
                          {valuationAge !== null && valuationAge > 6 && (
                            <span className="text-[10px] text-amber-400" title="Valuation older than 6 months">⚠️ Stale valuation</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">Current Value</span>
                        <p className="text-lg font-bold tabular-nums">{fmtMXN(prop.current_value)}</p>
                        {appreciation !== null && (
                          <span className={cn("text-xs font-medium", appreciation >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {appreciation >= 0 ? '↑' : '↓'} {Math.abs(appreciation).toFixed(1)}% from purchase
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-secondary))]">{equityLabelText}</span>
                        <p className="text-lg font-bold text-violet-400 tabular-nums">{fmtMXN(equity)}</p>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs border-t border-[hsl(var(--border))] pt-3">
                      {prop.mortgage_balance && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-[hsl(var(--text-secondary))]">{mortgageLabelText}</span>
                            <span className="tabular-nums">{fmtMXN(prop.mortgage_balance)} @ {((prop.mortgage_rate || 0) * 100).toFixed(1)}%</span>
                          </div>
                          {prop.monthly_mortgage && (
                            <div className="flex justify-between">
                              <span className="text-[hsl(var(--text-secondary))]">Monthly Payment</span>
                              <span className="tabular-nums text-red-400">-{fmtMXN(prop.monthly_mortgage)}</span>
                            </div>
                          )}
                        </>
                      )}
                      {(prop.rental_income || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--text-secondary))]">Rental Income</span>
                          <span className="tabular-nums text-emerald-400">+{fmtMXN(prop.rental_income!)}</span>
                        </div>
                      )}
                      {(prop.monthly_expenses || 0) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-[hsl(var(--text-secondary))]">Expenses</span>
                          <span className="tabular-nums text-red-400">-{fmtMXN(prop.monthly_expenses!)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-[hsl(var(--border))] font-semibold">
                        <span>Monthly Cash Flow</span>
                        <span className={cn("tabular-nums", monthlyCashFlow >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {monthlyCashFlow >= 0 ? '+' : ''}{fmtMXN(monthlyCashFlow)}
                        </span>
                      </div>
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ STOCK FORM MODAL ═══════════ */}
      {showStockForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setShowStockForm(false)}>
          <div className="w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{stockForm.id ? 'Edit Stock' : 'Add Stock'}</h2>
              <button onClick={() => setShowStockForm(false)} className="p-1 rounded-md hover:bg-[hsl(var(--accent))]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Ticker *</label>
                <input type="text" placeholder="AAPL, VOO, BIMBOA.MX" value={stockForm.ticker || ''}
                  onChange={e => setStockForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Name *</label>
                <input type="text" placeholder="Apple Inc." value={stockForm.name || ''}
                  onChange={e => setStockForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Exchange</label>
                  <div className="flex gap-2">
                    {['US', 'BMV'].map(ex => (
                      <button key={ex} onClick={() => setStockForm(f => ({ ...f, exchange: ex }))}
                        className={cn("flex-1 py-2 rounded-lg text-xs font-medium transition-colors", stockForm.exchange === ex ? "bg-blue-600 text-white" : "bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]")}>
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Type</label>
                  <select value={stockForm.asset_type || 'stock'} onChange={e => setStockForm(f => ({ ...f, asset_type: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                    <option value="stock">Stock</option>
                    <option value="etf">ETF</option>
                    <option value="fund">Fund</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Shares *</label>
                  <input type="number" step="any" value={stockForm.shares || ''} onChange={e => setStockForm(f => ({ ...f, shares: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Avg Cost *</label>
                  <input type="number" step="any" value={stockForm.avg_cost_basis || ''} onChange={e => setStockForm(f => ({ ...f, avg_cost_basis: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Broker</label>
                  <input type="text" placeholder="GBM" value={stockForm.broker || ''} onChange={e => setStockForm(f => ({ ...f, broker: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Owner</label>
                  <div className="flex gap-2">
                    {['Bernardo', 'Laura'].map(o => (
                      <button key={o} onClick={() => setStockForm(f => ({ ...f, owner: o }))}
                        className={cn("flex-1 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1", stockForm.owner === o ? "bg-blue-600 text-white" : "bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]")}>
                        <OwnerDot owner={o} size="sm" /> {o}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowStockForm(false)} className="flex-1 py-2 rounded-lg text-sm bg-[hsl(var(--accent))]">Cancel</button>
              <button onClick={saveStock} disabled={saving || !stockForm.ticker || !stockForm.name}
                className="flex-1 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
                {saving ? 'Saving...' : stockForm.id ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ FIXED INCOME FORM MODAL ═══════════ */}
      {showFIForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setShowFIForm(false)}>
          <div className="w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{fiForm.id ? 'Edit Instrument' : 'Add Instrument'}</h2>
              <button onClick={() => setShowFIForm(false)} className="p-1 rounded-md hover:bg-[hsl(var(--accent))]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Type</label>
                <select value={fiForm.instrument_type || 'cetes'} onChange={e => setFIForm(f => ({ ...f, instrument_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  <option value="cetes">CETES</option>
                  <option value="debt_fund">Debt Fund (GBM, etc.)</option>
                  <option value="hey_banco">Hey Banco</option>
                  <option value="nu">Nu</option>
                  <option value="supertasas">Supertasas</option>
                  <option value="kubo">Kubo Financiero</option>
                  <option value="mercadopago">Mercado Pago</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Name *</label>
                <input type="text" placeholder="CETES 28 días" value={fiForm.name || ''} onChange={e => setFIForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Institution *</label>
                <input type="text" placeholder="CETES Directo" value={fiForm.institution || ''} onChange={e => setFIForm(f => ({ ...f, institution: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Principal (MXN) *</label>
                  <input type="number" step="any" value={fiForm.principal || ''} onChange={e => setFIForm(f => ({ ...f, principal: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Annual Rate (decimal)</label>
                  <input type="number" step="0.0001" placeholder="0.1125" value={fiForm.annual_rate || ''} onChange={e => setFIForm(f => ({ ...f, annual_rate: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Term (days)</label>
                  <input type="number" placeholder="28" value={fiForm.term_days ?? ''} onChange={e => setFIForm(f => ({ ...f, term_days: e.target.value ? parseInt(e.target.value) : null }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Maturity Date</label>
                  <input type="date" value={fiForm.maturity_date || ''} onChange={e => setFIForm(f => ({ ...f, maturity_date: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                </div>
              </div>
              {/* Commission fields — shown for debt_fund type */}
              {fiForm.instrument_type === 'debt_fund' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <div>
                    <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Commission Rate</label>
                    <input type="number" step="0.0001" placeholder="0.0125" value={fiForm.commission_rate ?? ''}
                      onChange={e => {
                        const cr = parseFloat(e.target.value) || 0
                        setFIForm(f => ({ ...f, commission_rate: cr || null, net_annual_rate: (f.annual_rate || 0) - cr || null }))
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    <p className="text-[10px] text-[hsl(var(--text-secondary))] mt-0.5">e.g. 0.0125 = 1.25%</p>
                  </div>
                  <div>
                    <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Settlement Days</label>
                    <input type="number" placeholder="3" value={fiForm.settlement_days ?? ''}
                      onChange={e => setFIForm(f => ({ ...f, settlement_days: e.target.value ? parseInt(e.target.value) : null }))}
                      className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    <p className="text-[10px] text-[hsl(var(--text-secondary))] mt-0.5">GBM = 3 (48–72h)</p>
                  </div>
                  <div className="col-span-2 text-xs text-amber-400">
                    Net rate: <strong>{(((fiForm.annual_rate || 0) - (fiForm.commission_rate || 0)) * 100).toFixed(2)}%</strong>
                    {' '}(gross {((fiForm.annual_rate || 0) * 100).toFixed(2)}% − commission {((fiForm.commission_rate || 0) * 100).toFixed(2)}%)
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fiForm.is_liquid || false} onChange={e => setFIForm(f => ({ ...f, is_liquid: e.target.checked }))}
                    className="rounded border-[hsl(var(--border))]" />
                  Liquid
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fiForm.auto_renew || false} onChange={e => setFIForm(f => ({ ...f, auto_renew: e.target.checked }))}
                    className="rounded border-[hsl(var(--border))]" />
                  Auto-renew
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Tier</label>
                  <select value={fiForm.tier || 1} onChange={e => setFIForm(f => ({ ...f, tier: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                    <option value={1}>Tier 1 — Fintech</option>
                    <option value={2}>Tier 2 — Broker/Neobank</option>
                    <option value={3}>Tier 3 — Higher Yield</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Owner</label>
                  <div className="flex gap-2">
                    {['Bernardo', 'Laura'].map(o => (
                      <button key={o} onClick={() => setFIForm(f => ({ ...f, owner: o }))}
                        className={cn("flex-1 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1", fiForm.owner === o ? "bg-emerald-600 text-white" : "bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]")}>
                        <OwnerDot owner={o} size="sm" /> {o}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowFIForm(false)} className="flex-1 py-2 rounded-lg text-sm bg-[hsl(var(--accent))]">Cancel</button>
              <button onClick={saveFI} disabled={saving || !fiForm.name || !fiForm.institution}
                className="flex-1 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
                {saving ? 'Saving...' : fiForm.id ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ RETIREMENT TAB ═══════════ */}
      {activeTab === 'Retirement' && (
        <RetirementTab ownerFilter={ownerFilter.toLowerCase()} />
      )}

      {/* ═══════════ REAL ESTATE FORM MODAL ═══════════ */}
      {showREForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto" onClick={() => setShowREForm(false)}>
          <div className="w-full max-w-md bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4 my-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{reForm.id ? 'Edit Property' : 'Add Property'}</h2>
              <button onClick={() => setShowREForm(false)} className="p-1 rounded-md hover:bg-[hsl(var(--accent))]"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Name *</label>
                <input type="text" placeholder="Departamento Monterrey" value={reForm.name || ''} onChange={e => setREForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-violet-500" />
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Type</label>
                <select value={reForm.property_type || 'apartment'} onChange={e => setREForm(f => ({ ...f, property_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-violet-500">
                  <option value="apartment">Apartment</option>
                  <option value="pre_sale">Pre-sale</option>
                  <option value="sale_pending">Sale Pending</option>
                  <option value="house">House</option>
                  <option value="land">Land</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Purchase Price</label>
                  <input type="number" step="any" value={reForm.purchase_price || ''} onChange={e => setREForm(f => ({ ...f, purchase_price: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Current Value *</label>
                  <input type="number" step="any" value={reForm.current_value || ''} onChange={e => setREForm(f => ({ ...f, current_value: parseFloat(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Mortgage Balance</label>
                  <input type="number" step="any" value={reForm.mortgage_balance ?? ''} onChange={e => setREForm(f => ({ ...f, mortgage_balance: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Monthly Mortgage</label>
                  <input type="number" step="any" value={reForm.monthly_mortgage ?? ''} onChange={e => setREForm(f => ({ ...f, monthly_mortgage: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Mortgage Rate (decimal)</label>
                  <input type="number" step="0.0001" placeholder="0.093" value={reForm.mortgage_rate ?? ''} onChange={e => setREForm(f => ({ ...f, mortgage_rate: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Mortgage Bank</label>
                  <input type="text" placeholder="BBVA" value={reForm.mortgage_bank ?? ''} onChange={e => setREForm(f => ({ ...f, mortgage_bank: e.target.value || null }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Rental Income</label>
                  <input type="number" step="any" value={reForm.rental_income ?? ''} onChange={e => setREForm(f => ({ ...f, rental_income: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
                <div>
                  <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Monthly Expenses</label>
                  <input type="number" step="any" value={reForm.monthly_expenses ?? ''} onChange={e => setREForm(f => ({ ...f, monthly_expenses: e.target.value ? parseFloat(e.target.value) : null }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-violet-500" />
                </div>
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Owner</label>
                <div className="flex gap-2">
                  {['Bernardo', 'Laura'].map(o => (
                    <button key={o} onClick={() => setREForm(f => ({ ...f, owner: o }))}
                      className={cn("flex-1 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1", reForm.owner === o ? "bg-violet-600 text-white" : "bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]")}>
                      <OwnerDot owner={o} size="sm" /> {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowREForm(false)} className="flex-1 py-2 rounded-lg text-sm bg-[hsl(var(--accent))]">Cancel</button>
              <button onClick={saveRE} disabled={saving || !reForm.name}
                className="flex-1 py-2 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50">
                {saving ? 'Saving...' : reForm.id ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
