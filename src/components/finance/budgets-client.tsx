'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { PageTransition } from '@/components/page-transition'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { SEED_CATEGORIES, SEED_TRANSACTIONS, SEED_BUDGETS, enrichBudgets, enrichTransactions } from '@/lib/seed-finance'
import type { FinanceCategory, FinanceTransaction, FinanceBudget } from '@/lib/finance-types'

export default function BudgetsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [budgets, setBudgets] = useState<FinanceBudget[]>([])
  const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*'),
      supabase.from('finance_budgets').select('*'),
    ]).then(([catRes, txRes, budRes]) => {
      const cats = catRes.data?.length ? catRes.data : SEED_CATEGORIES
      const txs = txRes.data?.length ? txRes.data : SEED_TRANSACTIONS
      const buds = budRes.data?.length ? budRes.data : SEED_BUDGETS
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

  const monthTxs = useMemo(() => transactions.filter(t => t.transaction_date.startsWith(monthStr) && t.type === 'expense'), [transactions, monthStr])
  const monthBudgets = useMemo(() => budgets.filter(b => b.month.startsWith(monthStr)), [budgets, monthStr])

  const totalBudgeted = monthBudgets.reduce((s, b) => s + b.amount, 0)
  const totalSpent = monthTxs.reduce((s, t) => s + t.amount_mxn, 0)
  const overallPct = totalBudgeted > 0 ? Math.round((totalSpent / totalBudgeted) * 100) : 0

  const budgetCards = monthBudgets.map(b => {
    const spent = monthTxs.filter(t => t.category_id === b.category_id).reduce((s, t) => s + t.amount_mxn, 0)
    const pct = (spent / b.amount) * 100
    return { ...b, spent, pct }
  }).sort((a, b) => b.pct - a.pct)

  if (loading) return <div className="h-8 w-32 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Budgets</h1>
          <p className="text-[hsl(var(--text-secondary))]">Monthly spending limits by category</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))]"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))]"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Budgeted</span>
          <p className="text-3xl font-bold mt-1">${totalBudgeted.toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Spent</span>
          <p className="text-3xl font-bold mt-1">${totalSpent.toLocaleString()} <span className="text-lg text-[hsl(var(--text-tertiary))]">({overallPct}%)</span></p>
        </GlassCard>
      </div>

      {/* Budget Cards */}
      {budgetCards.length === 0 ? (
        <GlassCard><p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">No budgets set for this month</p></GlassCard>
      ) : (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {budgetCards.map(b => {
            const barColor = b.pct < 60 ? 'bg-emerald-500' : b.pct < 80 ? 'bg-yellow-500' : b.pct < 100 ? 'bg-orange-500' : 'bg-rose-500'
            return (
              <GlassCard key={b.id} className={cn("relative overflow-hidden", b.pct >= 100 && "ring-1 ring-rose-500/30")}>
                {b.pct >= 100 && <div className="absolute inset-0 bg-rose-500/5 pointer-events-none" />}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${b.category?.color}20` }}>
                    {b.category?.icon}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold">{b.category?.name}</h4>
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">${b.spent.toLocaleString()} of ${b.amount.toLocaleString()}</p>
                  </div>
                  <span className={cn("text-lg font-bold",
                    b.pct < 60 ? "text-emerald-400" : b.pct < 80 ? "text-yellow-400" : b.pct < 100 ? "text-orange-400" : "text-rose-400"
                  )}>{Math.round(b.pct)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-[hsl(var(--bg-elevated))]">
                  <motion.div className={cn("h-2.5 rounded-full", barColor)} initial={{ width: 0 }} animate={{ width: `${Math.min(b.pct, 100)}%` }} transition={{ duration: 0.6 }} />
                </div>
                <p className="text-xs mt-2 text-[hsl(var(--text-tertiary))]">
                  {b.pct < 100 ? `$${(b.amount - b.spent).toLocaleString()} remaining` : `$${(b.spent - b.amount).toLocaleString()} over budget`}
                </p>
              </GlassCard>
            )
          })}
        </div>
      )}
    </div>
    </PageTransition>
  )
}
