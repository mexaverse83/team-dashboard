'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { TrendBadge } from '@/components/ui/trend-badge'
import { PageTransition } from '@/components/page-transition'
import { cn } from '@/lib/utils'

import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'
import { enrichTransactions, DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area, BarChart, Bar,
} from 'recharts'
import { OwnerBar } from '@/components/finance/owner-dot'

const tooltipStyle = {
  contentStyle: {
    background: 'hsl(222, 47%, 6%)',
    border: '1px solid hsl(222, 20%, 18%)',
    borderRadius: '8px',
    fontSize: '12px',
  },
}

export default function ReportsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [investmentAudit, setInvestmentAudit] = useState<{
    score: number; score_label: string;
    net_worth: { total: number; by_class: Record<string, number> };
    findings: Array<{ severity: string; title: string; detail: string }>;
  } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: true }),
    ]).then(([catRes, txRes]) => {
      const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
      const txs = txRes.data || []
      setCategories(cats)
      setTransactions(enrichTransactions(txs, cats))
      setLoading(false)
    })
    // Load investment audit for reports
    fetch('/api/finance/audit/investments')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setInvestmentAudit(d))
      .catch(() => null)
  }, [])

  // Monthly income vs expenses
  const monthlyData = useMemo(() => {
    const map: Record<string, { income: number; expenses: number }> = {}
    transactions.forEach(t => {
      const month = t.transaction_date.slice(0, 7)
      if (!map[month]) map[month] = { income: 0, expenses: 0 }
      if (t.type === 'income') map[month].income += t.amount_mxn
      else map[month].expenses += t.amount_mxn
    })
    return Object.entries(map)
      .map(([month, data]) => ({ month, ...data, net: data.income - data.expenses }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [transactions])

  // By-owner monthly spending
  const ownerMonthly = useMemo(() => {
    const map: Record<string, { bernardo: number; laura: number }> = {}
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const m = t.transaction_date.slice(0, 7)
      if (!map[m]) map[m] = { bernardo: 0, laura: 0 }
      if (t.owner === 'Bernardo') map[m].bernardo += t.amount_mxn
      else if (t.owner === 'Laura') map[m].laura += t.amount_mxn
    })
    return Object.entries(map).map(([month, d]) => ({ month, ...d })).sort((a, b) => a.month.localeCompare(b.month)).slice(-6)
  }, [transactions])

  // By-owner category breakdown
  const ownerByCategory = useMemo(() => {
    const map: Record<string, { name: string; bernardo: number; laura: number; icon: string }> = {}
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const catName = t.category?.name || 'Other'
      const catIcon = t.category?.icon || '📦'
      if (!map[catName]) map[catName] = { name: catName, bernardo: 0, laura: 0, icon: catIcon }
      if (t.owner === 'Bernardo') map[catName].bernardo += t.amount_mxn
      else if (t.owner === 'Laura') map[catName].laura += t.amount_mxn
    })
    return Object.values(map).sort((a, b) => (b.bernardo + b.laura) - (a.bernardo + a.laura)).slice(0, 8)
  }, [transactions])

  // Category trends (stacked area)
  const categoryTrends = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    const topCats = new Set<string>()
    // Find top 6 expense categories
    const catTotals: Record<string, number> = {}
    transactions.filter(t => t.type === 'expense').forEach(t => {
      catTotals[t.category_id] = (catTotals[t.category_id] || 0) + t.amount_mxn
    })
    Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([id]) => topCats.add(id))

    transactions.filter(t => t.type === 'expense' && topCats.has(t.category_id)).forEach(t => {
      const month = t.transaction_date.slice(0, 7)
      if (!map[month]) map[month] = {}
      const catName = t.category?.name || 'Other'
      map[month][catName] = (map[month][catName] || 0) + t.amount_mxn
    })
    return Object.entries(map)
      .map(([month, cats]) => ({ month, ...cats }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [transactions])

  const topCatNames = useMemo(() => {
    const catTotals: Record<string, number> = {}
    transactions.filter(t => t.type === 'expense').forEach(t => {
      const name = t.category?.name || 'Other'
      catTotals[name] = (catTotals[name] || 0) + t.amount_mxn
    })
    return Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name)
  }, [transactions])

  const catColors: Record<string, string> = {}
  categories.forEach(c => { catColors[c.name] = c.color })

  // Top merchants
  const topMerchants = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {}
    transactions.filter(t => t.type === 'expense' && t.merchant).forEach(t => {
      if (!map[t.merchant!]) map[t.merchant!] = { total: 0, count: 0 }
      map[t.merchant!].total += t.amount_mxn
      map[t.merchant!].count++
    })
    return Object.entries(map)
      .map(([merchant, data]) => ({ merchant, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
  }, [transactions])

  // KPIs
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_mxn, 0)
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_mxn, 0)
  const net = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? Math.round((net / totalIncome) * 100) : 0

  if (loading) return <div className="h-8 w-36 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-[hsl(var(--text-secondary))]">Financial trends and analytics</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Income</span>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-400 mt-1">${totalIncome.toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Expenses</span>
          <p className="text-2xl sm:text-3xl font-bold text-rose-400 mt-1">${totalExpenses.toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Net</span>
          <p className={cn("text-2xl sm:text-3xl font-bold mt-1", net >= 0 ? "text-emerald-400" : "text-rose-400")}>${Math.abs(net).toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Savings Rate</span>
          <p className="text-2xl sm:text-3xl font-bold mt-1">{savingsRate}%</p>
        </GlassCard>
      </div>

      {/* Income vs Expenses */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-4">Income vs Expenses</h3>
        <div className="h-52 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(222, 15%, 55%)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip {...tooltipStyle} formatter={(val) => [`$${Number(val).toLocaleString()}`]} />
              <Line type="monotone" dataKey="income" stroke="#10B981" strokeWidth={2} dot={false} name="Income" />
              <Line type="monotone" dataKey="expenses" stroke="#F43F5E" strokeWidth={2} dot={false} name="Expenses" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-6 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-6 rounded-full bg-emerald-500" />
            <span className="text-xs text-[hsl(var(--text-secondary))]">Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-6 rounded-full bg-rose-500" />
            <span className="text-xs text-[hsl(var(--text-secondary))]">Expenses</span>
          </div>
        </div>
      </GlassCard>

      {/* Category Trends + Top Merchants */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Category Trends</h3>
          <div className="h-52 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={categoryTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(222, 15%, 55%)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} formatter={(val) => [`$${Number(val).toLocaleString()}`]} />
                {topCatNames.map(name => (
                  <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={catColors[name] || '#6B7280'} fill={catColors[name] || '#6B7280'} fillOpacity={0.3} strokeWidth={1.5} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Top Merchants</h3>
          <div className="space-y-3">
            {topMerchants.map((m, i) => (
              <div key={m.merchant} className="flex items-center gap-3">
                <span className="text-sm font-bold text-[hsl(var(--text-tertiary))] w-7">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{m.merchant}</p>
                  <div className="h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] mt-1">
                    <div className="h-1.5 rounded-full bg-rose-500/60"
                      style={{ width: `${topMerchants[0] ? (m.total / topMerchants[0].total) * 100 : 0}%` }} />
                  </div>
                </div>
                <span className="text-sm font-semibold">${m.total.toLocaleString()}</span>
                <span className="text-xs text-[hsl(var(--text-tertiary))]">{m.count} txns</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
      {/* ── INVESTMENTS & NET WORTH SECTION ── */}
      {investmentAudit && (() => {
        const nw = investmentAudit.net_worth
        const nwItems = [
          { label: 'Real Estate (equity)', value: nw.by_class.real_estate || 0, color: 'bg-violet-500' },
          { label: 'Retirement (locked)', value: nw.by_class.retirement || 0, color: 'bg-slate-500' },
          { label: 'Fixed Income (GBM)', value: nw.by_class.fixed_income || 0, color: 'bg-emerald-500' },
          { label: 'Crypto', value: nw.by_class.crypto || 0, color: 'bg-amber-500' },
        ]
        const investmentRows = [
          { asset: 'Crypto', color: 'bg-amber-500', value: nw.by_class.crypto || 0, momChange: null, ytdReturn: null, ytdEstimate: 'volatile' },
          { asset: 'Fixed Income (GBM)', color: 'bg-emerald-500', value: nw.by_class.fixed_income || 0, momChange: null, ytdReturn: 9.5, ytdEstimate: '9.5% net' },
          { asset: 'Real Estate', color: 'bg-violet-500', value: nw.by_class.real_estate || 0, momChange: null, ytdReturn: null, ytdEstimate: '+10–15% est.' },
          { asset: 'Retirement (AFORE)', color: 'bg-slate-500', value: nw.by_class.retirement || 0, momChange: null, ytdReturn: null, ytdEstimate: '+8.5% est.' },
        ]
        const topFindings = investmentAudit.findings.filter(f => f.severity !== 'green').slice(0, 3)
        const fmtN = (n: number) => `$${n.toLocaleString()} MXN`

        return (
          <>
            <div className="flex items-center justify-between mb-3 mt-8">
              <h2 className="text-base font-semibold">Investments & Net Worth</h2>
            </div>

            {/* Net Worth Statement */}
            <GlassCard className="mb-4">
              <h3 className="text-sm font-semibold mb-4">Net Worth Statement</h3>
              <div className="space-y-2 text-sm">
                {nwItems.map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[hsl(var(--text-secondary))]">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${item.color}`} />
                      {item.label}
                    </span>
                    <div className="text-right">
                      <span className="font-medium tabular-nums">{fmtN(item.value)}</span>
                      <span className="text-xs text-[hsl(var(--text-secondary))] ml-2 tabular-nums">
                        ({nw.total > 0 ? ((item.value / nw.total) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  </div>
                ))}
                <div className="pt-2 mt-1 border-t border-[hsl(var(--border))] flex justify-between font-bold">
                  <span>Total Net Worth</span>
                  <span className="tabular-nums">{fmtN(nw.total)}</span>
                </div>
              </div>
            </GlassCard>

            {/* WEST compact */}
            <GlassCard className="mb-4 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">🏗️ WEST Apartment</h3>
                <span className="text-xs text-emerald-400 tabular-nums font-semibold">91.2% funded</span>
              </div>
              <div className="flex h-2 w-full rounded-full overflow-hidden bg-[hsl(var(--bg-elevated))] mb-2">
                <div className="h-full bg-emerald-500" style={{ width: '22.4%' }} />
                <div className="h-full bg-blue-500" style={{ width: '6.7%' }} />
                <div className="h-full bg-amber-500/60" style={{ width: '62.1%' }} />
              </div>
              <div className="flex justify-between text-xs text-[hsl(var(--text-secondary))]">
                <span>Projected $10,213,365 / $11,204,000</span>
                <span className="text-red-400">Gap $990,635</span>
              </div>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">
                Est. market value: <span className="text-emerald-400 font-medium">$16,753,803 MXN</span> · +$5,549,803 equity
              </p>
            </GlassCard>

            {/* Investment Performance */}
            <GlassCard className="mb-4">
              <h3 className="text-sm font-semibold mb-4">Investment Performance</h3>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))]">
                      <th className="text-left text-xs text-[hsl(var(--text-secondary))] uppercase tracking-wider py-2 px-3">Asset</th>
                      <th className="text-right text-xs text-[hsl(var(--text-secondary))] uppercase tracking-wider py-2 px-3">Current Value</th>
                      <th className="text-right text-xs text-[hsl(var(--text-secondary))] uppercase tracking-wider py-2 px-3">MoM</th>
                      <th className="text-right text-xs text-[hsl(var(--text-secondary))] uppercase tracking-wider py-2 px-3">Return YTD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investmentRows.map(row => (
                      <tr key={row.asset} className="border-b border-[hsl(var(--border))] last:border-0">
                        <td className="py-2.5 px-3 font-medium">
                          <span className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${row.color}`} />
                            {row.asset}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right tabular-nums">{fmtN(row.value)}</td>
                        <td className="py-2.5 px-3 text-right text-[hsl(var(--text-secondary))] text-xs">Manual</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-xs">
                          {row.ytdReturn !== null
                            ? <span className={row.ytdReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}>{row.ytdReturn >= 0 ? '+' : ''}{row.ytdReturn.toFixed(1)}%</span>
                            : <span className="text-[hsl(var(--text-secondary))]">Est. {row.ytdEstimate}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Mobile stacked */}
              <div className="sm:hidden space-y-2">
                {investmentRows.map(row => (
                  <div key={row.asset} className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))]">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${row.color}`} />
                      <span className="text-sm font-medium">{row.asset}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">{fmtN(row.value)}</p>
                      <p className="text-xs text-[hsl(var(--text-secondary))]">Est. {row.ytdEstimate}</p>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Top Audit Findings */}
            {topFindings.length > 0 && (
              <GlassCard className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Top Audit Findings</h3>
                  <a href="/finance/audit" className="text-xs text-blue-400 hover:underline">View all →</a>
                </div>
                <div className="space-y-2">
                  {topFindings.map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="text-xs mt-0.5 shrink-0">{f.severity === 'red' ? '🔴' : '🟡'}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{f.title}</p>
                        <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5 line-clamp-1">{f.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}
          </>
        )
      })()}

      {/* By Owner Section */}
      <h3 className="text-lg font-semibold mt-2">By Owner</h3>
      <div className="grid gap-6 lg:grid-cols-2">
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Monthly Spending Comparison</h3>
          <div className="h-52 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ownerMonthly}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(222, 10%, 50%)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(222, 10%, 50%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} formatter={(v: number | undefined) => [`$${(v ?? 0).toLocaleString()}`, '']} />
                <Legend />
                <Bar dataKey="bernardo" name="Bernardo" fill="#3B82F6" radius={[4,4,0,0]} />
                <Bar dataKey="laura" name="Laura" fill="#EC4899" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Category Breakdown by Person</h3>
          <div className="space-y-3">
            {ownerByCategory.map(cat => {
              const total = cat.bernardo + cat.laura
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span>{cat.icon} {cat.name}</span>
                    <span className="font-medium tabular-nums">${total.toLocaleString()}</span>
                  </div>
                  <OwnerBar bernardo={cat.bernardo} laura={cat.laura} />
                </div>
              )
            })}
          </div>
        </GlassCard>
      </div>
    </div>
    </PageTransition>
  )
}
