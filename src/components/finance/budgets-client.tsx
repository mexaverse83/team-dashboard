'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

import type { FinanceCategory, FinanceTransaction, FinanceBudget } from '@/lib/finance-types'
import { enrichTransactions, enrichBudgets, DEFAULT_CATEGORIES, cycleBudgetComparison, CYCLE_LABELS, allocatedMonthlySpend } from '@/lib/finance-utils'

const inputCls = "w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-blue-500 transition-colors"

export default function BudgetsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [budgets, setBudgets] = useState<FinanceBudget[]>([])
  const [currentMonth, setCurrentMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [loading, setLoading] = useState(true)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formCat, setFormCat] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [catRes, txRes, budRes] = await Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*'),
      supabase.from('finance_budgets').select('*'),
    ])
    const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
    const txs = txRes.data || []
    const buds = budRes.data || []
    setCategories(cats)
    setTransactions(enrichTransactions(txs, cats))
    setBudgets(enrichBudgets(buds, cats))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(); const h = () => { if (document.visibilityState === "visible") fetchData() }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h) }, [fetchData])

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
    const cat = categories.find(c => c.id === b.category_id)
    const cycle = cat?.billing_cycle || 'monthly'
    if (cycle === 'monthly') {
      // Use allocated amounts (respects coverage periods for arrears billing)
      const spent = allocatedMonthlySpend(transactions, b.category_id, monthStr)
      const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0
      return { ...b, spent, pct, cycle, monthlyAvg: spent }
    }
    // Non-monthly: compare over full billing cycle window
    const comparison = cycleBudgetComparison(transactions, b.category_id, b.amount, cycle, currentMonth)
    return { ...b, spent: comparison.monthlyAvg, pct: comparison.pct, cycle, monthlyAvg: comparison.monthlyAvg }
  }).sort((a, b) => b.pct - a.pct)

  // Categories that don't have a budget yet this month
  const expenseCats = categories.filter(c => c.type === 'expense' || c.type === 'both')
  const unbudgetedCats = expenseCats.filter(c => !monthBudgets.find(b => b.category_id === c.id))

  const openAdd = () => {
    setEditingId(null)
    setFormCat(unbudgetedCats[0]?.id || '')
    setFormAmount('')
    setModalOpen(true)
  }

  const openEdit = (b: FinanceBudget & { spent: number; pct: number }) => {
    setEditingId(b.id)
    setFormCat(b.category_id)
    setFormAmount(b.amount.toString())
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!formAmount || !formCat) return
    setSaving(true)
    const monthDate = `${monthStr}-01`
    if (editingId) {
      await supabase.from('finance_budgets').update({ category_id: formCat, amount: parseFloat(formAmount) }).eq('id', editingId)
    } else {
      await supabase.from('finance_budgets').insert({ category_id: formCat, month: monthDate, amount: parseFloat(formAmount) })
    }
    setSaving(false)
    setModalOpen(false)
    fetchData()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('finance_budgets').delete().eq('id', id)
    setDeleteConfirm(null)
    fetchData()
  }

  if (loading) return <div className="h-8 w-32 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Budgets</h1>
          <p className="text-[hsl(var(--text-secondary))]">Monthly spending limits by category</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))]"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
            <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))]"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" /> Add Budget
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 grid-cols-2">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Budgeted</span>
          <p className="text-2xl sm:text-3xl font-bold mt-1">${totalBudgeted.toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Spent</span>
          <p className="text-2xl sm:text-3xl font-bold mt-1">${totalSpent.toLocaleString()} <span className="text-lg text-[hsl(var(--text-tertiary))]">({overallPct}%)</span></p>
        </GlassCard>
      </div>

      {/* Budget Cards */}
      {budgetCards.length === 0 ? (
        <GlassCard><p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-8">No budgets set for this month — click &quot;Add Budget&quot; to start</p></GlassCard>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {budgetCards.map(b => {
            const barColor = b.pct < 60 ? 'bg-emerald-500' : b.pct < 80 ? 'bg-yellow-500' : b.pct < 100 ? 'bg-orange-500' : 'bg-rose-500'
            return (
              <GlassCard key={b.id} className={cn("relative overflow-hidden group", b.pct >= 100 && "ring-1 ring-rose-500/30")}>
                {b.pct >= 100 && <div className="absolute inset-0 bg-rose-500/5 pointer-events-none" />}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl flex items-center justify-center text-lg" style={{ background: `${b.category?.color}20` }}>
                    {b.category?.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-semibold">{b.category?.name}</h4>
                      {b.cycle && b.cycle !== 'monthly' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-medium">{CYCLE_LABELS[b.cycle as keyof typeof CYCLE_LABELS]}</span>
                      )}
                    </div>
                    <p className="text-xs text-[hsl(var(--text-tertiary))]">
                      {b.cycle && b.cycle !== 'monthly'
                        ? `~$${Math.round(b.monthlyAvg).toLocaleString()}/mo avg of $${b.amount.toLocaleString()} budget`
                        : `$${b.spent.toLocaleString()} of $${b.amount.toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(b)} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]">
                      <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
                    </button>
                    {deleteConfirm === b.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleDelete(b.id)} className="px-1.5 py-0.5 rounded text-[10px] bg-rose-600 text-white">Del</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-1.5 py-0.5 rounded text-[10px] bg-[hsl(var(--bg-elevated))]">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(b.id)} className="p-1 rounded hover:bg-rose-500/10">
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                      </button>
                    )}
                  </div>
                  <span className={cn("text-lg font-bold",
                    b.pct < 60 ? "text-emerald-400" : b.pct < 80 ? "text-yellow-400" : b.pct < 100 ? "text-orange-400" : "text-rose-400"
                  )}>{Math.round(b.pct)}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-[hsl(var(--bg-elevated))]">
                  <motion.div className={cn("h-2.5 rounded-full", barColor)} initial={{ width: 0 }} animate={{ width: `${Math.min(b.pct, 100)}%` }} transition={{ duration: 0.6 }} />
                </div>
                <p className="text-xs mt-2 text-[hsl(var(--text-tertiary))]">
                  {b.pct < 100 ? `$${Math.round(b.amount - b.spent).toLocaleString()} remaining` : b.pct <= 100 ? 'On budget' : `$${Math.round(b.spent - b.amount).toLocaleString()} over budget`}
                </p>
              </GlassCard>
            )
          })}
        </div>
      )}

      {/* Add/Edit Budget Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Budget' : 'Add Budget'}>
        <form onSubmit={e => { e.preventDefault(); handleSave() }} className="space-y-4">
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Category *</label>
            <select value={formCat} onChange={e => setFormCat(e.target.value)} className={inputCls} required>
              <option value="">Select category</option>
              {(editingId ? expenseCats : unbudgetedCats).map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Monthly Limit (MXN) *</label>
            <input type="number" step="100" min="0" required placeholder="5000" value={formAmount}
              onChange={e => setFormAmount(e.target.value)} className={cn(inputCls, "text-lg font-semibold")} />
          </div>
          <button type="submit" disabled={saving || !formAmount || !formCat}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update Budget' : 'Set Budget'}
          </button>
        </form>
      </Modal>
    </div>
    </PageTransition>
  )
}
