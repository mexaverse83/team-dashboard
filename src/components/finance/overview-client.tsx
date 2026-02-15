'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { TrendingDown, TrendingUp, Wallet, Percent, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { TrendBadge } from '@/components/ui/trend-badge'
import { SparklineChart } from '@/components/ui/sparkline-chart'
import { PageTransition } from '@/components/page-transition'
import { SkeletonKPI, SkeletonGrid } from '@/components/ui/skeleton-card'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

import type { FinanceCategory, FinanceTransaction, FinanceBudget } from '@/lib/finance-types'
import { enrichTransactions, enrichBudgets, DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'

const tooltipStyle = {
  contentStyle: {
    background: 'hsl(222, 47%, 6%)',
    border: '1px solid hsl(222, 20%, 18%)',
    borderRadius: '8px',
    fontSize: '12px',
  },
}

export default function FinanceOverviewClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [budgets, setBudgets] = useState<FinanceBudget[]>([])
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('finance_budgets').select('*'),
    ]).then(([catRes, txRes, budRes]) => {
      const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
      const txs = txRes.data || []
      const buds = budRes.data || []
      setCategories(cats)
      setTransactions(enrichTransactions(txs, cats))
      setBudgets(enrichBudgets(buds, cats))
      setLoading(false)
    })
  }, [])

  const monthStr = currentMonth.toISOString().slice(0, 7)
  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))

  // Filter transactions for current month
  const monthTxs = useMemo(() =>
    transactions.filter(t => t.transaction_date.startsWith(monthStr)),
    [transactions, monthStr]
  )

  // Previous month for comparison
  const prevMonthDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
  const prevMonthStr = prevMonthDate.toISOString().slice(0, 7)
  const prevMonthTxs = useMemo(() =>
    transactions.filter(t => t.transaction_date.startsWith(prevMonthStr)),
    [transactions, prevMonthStr]
  )

  // KPIs
  const totalSpent = useMemo(() => monthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const totalIncome = useMemo(() => monthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_mxn, 0), [monthTxs])
  const netSavings = totalIncome - totalSpent
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0

  const prevSpent = prevMonthTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_mxn, 0)
  const prevIncome = prevMonthTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_mxn, 0)
  const spentDelta = prevSpent > 0 ? Math.round(((totalSpent - prevSpent) / prevSpent) * 100) : 0
  const incomeDelta = prevIncome > 0 ? Math.round(((totalIncome - prevIncome) / prevIncome) * 100) : 0
  const savingsDelta = (prevIncome - prevSpent) !== 0 ? Math.round(((netSavings - (prevIncome - prevSpent)) / Math.abs(prevIncome - prevSpent)) * 100) : 0

  // Category donut data
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {}
    monthTxs.filter(t => t.type === 'expense').forEach(t => {
      map[t.category_id] = (map[t.category_id] || 0) + t.amount_mxn
    })
    return Object.entries(map)
      .map(([catId, amount]) => {
        const cat = categories.find(c => c.id === catId)
        return { id: catId, name: cat?.name || 'Other', icon: cat?.icon || '📦', color: cat?.color || '#6B7280', amount }
      })
      .sort((a, b) => b.amount - a.amount)
  }, [monthTxs, categories])

  // Daily spending area chart
  const dailyData = useMemo(() => {
    const map: Record<string, number> = {}
    monthTxs.filter(t => t.type === 'expense').forEach(t => {
      const day = t.transaction_date.slice(8, 10)
      map[day] = (map[day] || 0) + t.amount_mxn
    })
    return Object.entries(map)
      .map(([day, amount]) => ({ day: parseInt(day), amount }))
      .sort((a, b) => a.day - b.day)
  }, [monthTxs])

  // Daily sparklines for KPI cards
  const dailySpendHistory = dailyData.map(d => d.amount)
  const dailyIncomeHistory = useMemo(() => {
    const map: Record<string, number> = {}
    monthTxs.filter(t => t.type === 'income').forEach(t => {
      const day = t.transaction_date.slice(8, 10)
      map[day] = (map[day] || 0) + t.amount_mxn
    })
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
  }, [monthTxs])

  // Budget status bars
  const budgetStatus = useMemo(() => {
    const monthBudgets = budgets.filter(b => b.month.startsWith(monthStr))
    return monthBudgets.map(b => {
      const spent = monthTxs
        .filter(t => t.type === 'expense' && t.category_id === b.category_id)
        .reduce((s, t) => s + t.amount_mxn, 0)
      const cat = categories.find(c => c.id === b.category_id)
      return { id: b.id, name: cat?.name || 'Other', icon: cat?.icon || '📦', spent, limit: b.amount }
    }).sort((a, b) => (b.spent / b.limit) - (a.spent / a.limit))
  }, [budgets, monthTxs, monthStr, categories])

  // Recent transactions
  const recentTxs = monthTxs.slice(0, 10)

  if (loading) {
    return (
      <div className="space-y-6">
        <div><div className="h-8 w-36 rounded bg-[hsl(var(--muted))] animate-pulse" /></div>
        <SkeletonKPI />
        <SkeletonGrid count={2} lines={6} />
      </div>
    )
  }

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
          <p className="text-[hsl(var(--text-secondary))]">Personal spending and income overview</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))] transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))] transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Spent</span>
            <TrendingDown className="h-4 w-4 text-rose-400" />
          </div>
          <p className="text-3xl font-bold text-rose-400">${totalSpent.toLocaleString()}</p>
          <TrendBadge value={spentDelta * -1} suffix="% vs last month" />
          <div className="mt-3 h-8"><SparklineChart data={dailySpendHistory} color="hsl(350, 80%, 55%)" /></div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Income</span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-3xl font-bold text-emerald-400">${totalIncome.toLocaleString()}</p>
          <TrendBadge value={incomeDelta} suffix="% vs last month" />
          <div className="mt-3 h-8"><SparklineChart data={dailyIncomeHistory} color="hsl(160, 60%, 45%)" /></div>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Net Savings</span>
            <Wallet className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
          </div>
          <p className={cn("text-3xl font-bold", netSavings >= 0 ? "text-emerald-400" : "text-rose-400")}>
            ${Math.abs(netSavings).toLocaleString()}
          </p>
          <TrendBadge value={savingsDelta} suffix="% vs last month" />
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Savings Rate</span>
            <Percent className="h-4 w-4 text-[hsl(var(--text-tertiary))]" />
          </div>
          <p className="text-3xl font-bold">{savingsRate}%</p>
          <div className="mt-2 h-2 rounded-full bg-[hsl(var(--bg-elevated))]">
            <motion.div
              className="h-2 rounded-full"
              style={{ background: savingsRate >= 20 ? '#10B981' : savingsRate >= 10 ? '#F59E0B' : '#F43F5E' }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(Math.max(savingsRate, 0), 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </GlassCard>
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Category Donut */}
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Spending by Category</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="amount" animationDuration={800} strokeWidth={0}>
                  {categoryData.map(entry => <Cell key={entry.id} fill={entry.color} />)}
                </Pie>
                <Tooltip {...tooltipStyle} formatter={(val) => [`$${Number(val).toLocaleString()}`]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-3">
            {categoryData.slice(0, 8).map(cat => (
              <div key={cat.id} className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full shrink-0" style={{ background: cat.color }} />
                <span className="text-xs text-[hsl(var(--text-secondary))] truncate">{cat.icon} {cat.name}</span>
                <span className="text-xs font-medium ml-auto">${cat.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Daily Spending Trend */}
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Daily Spending</h3>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip {...tooltipStyle} formatter={(val) => [`$${Number(val).toLocaleString()}`]} />
                <Area type="monotone" dataKey="amount" stroke="#F43F5E" strokeWidth={2} fill="url(#spendGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Budget Status */}
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Budget Status</h3>
          {budgetStatus.length === 0 ? (
            <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">No budgets set for this month</p>
          ) : (
            <div className="space-y-3">
              {budgetStatus.map(budget => {
                const pct = (budget.spent / budget.limit) * 100
                const barColor = pct < 60 ? 'bg-emerald-500' : pct < 80 ? 'bg-yellow-500' : pct < 100 ? 'bg-orange-500' : 'bg-rose-500'
                return (
                  <div key={budget.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">{budget.icon} {budget.name}</span>
                      <span className="text-xs text-[hsl(var(--text-secondary))]">
                        ${budget.spent.toLocaleString()} / ${budget.limit.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[hsl(var(--bg-elevated))]">
                      <motion.div
                        className={cn("h-2 rounded-full", barColor)}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(pct, 100)}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    {pct >= 80 && (
                      <span className={cn("text-[10px] font-medium mt-0.5 inline-block", pct >= 100 ? "text-rose-400" : "text-orange-400")}>
                        {pct >= 100 ? `⚠️ Over budget by $${(budget.spent - budget.limit).toLocaleString()}` : `${Math.round(pct)}% used`}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </GlassCard>

        {/* Recent Transactions */}
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Recent Transactions</h3>
            <Link href="/finance/transactions" className="text-xs text-blue-400 hover:underline">View all →</Link>
          </div>
          {recentTxs.length === 0 ? (
            <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">No transactions this month</p>
          ) : (
            <div className="space-y-2">
              {recentTxs.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 py-2 border-b border-[hsl(var(--border))] last:border-0">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: `${tx.category?.color || '#6B7280'}20` }}>
                    {tx.category?.icon || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.merchant || tx.description || '—'}</p>
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">{tx.category?.name} · {tx.transaction_date.slice(5)}</p>
                  </div>
                  <span className={cn("text-sm font-semibold", tx.type === 'income' ? "text-emerald-400" : "text-rose-400")}>
                    {tx.type === 'income' ? '+' : '-'}${tx.amount_mxn.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
    </PageTransition>
  )
}
