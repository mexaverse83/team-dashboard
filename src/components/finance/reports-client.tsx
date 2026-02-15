'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { TrendBadge } from '@/components/ui/trend-badge'
import { PageTransition } from '@/components/page-transition'
import { cn } from '@/lib/utils'

import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'
import { enrichTransactions } from '@/lib/finance-utils'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area,
} from 'recharts'

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

  useEffect(() => {
    Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: true }),
    ]).then(([catRes, txRes]) => {
      const cats = catRes.data || []
      const txs = txRes.data || []
      setCategories(cats)
      setTransactions(enrichTransactions(txs, cats))
      setLoading(false)
    })
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
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-[hsl(var(--text-secondary))]">Financial trends and analytics</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Income</span>
          <p className="text-3xl font-bold text-emerald-400 mt-1">${totalIncome.toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Expenses</span>
          <p className="text-3xl font-bold text-rose-400 mt-1">${totalExpenses.toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Net</span>
          <p className={cn("text-3xl font-bold mt-1", net >= 0 ? "text-emerald-400" : "text-rose-400")}>${Math.abs(net).toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Savings Rate</span>
          <p className="text-3xl font-bold mt-1">{savingsRate}%</p>
        </GlassCard>
      </div>

      {/* Income vs Expenses */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-4">Income vs Expenses</h3>
        <div className="h-72">
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
          <div className="h-72">
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
                <span className="text-sm font-bold text-[hsl(var(--text-tertiary))] w-6">{i + 1}</span>
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
    </div>
    </PageTransition>
  )
}
