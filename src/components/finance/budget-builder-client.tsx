'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { TrendBadge } from '@/components/ui/trend-badge'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import type { FinanceCategory, FinanceTransaction, FinanceBudget, FinanceIncomeSource } from '@/lib/finance-types'

const inputCls = "w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-blue-500 transition-colors"

const INCOME_ICONS: Record<string, string> = { salary: '💼', freelance: '📱', passive: '💤', side_hustle: '🔨', investment: '📈', other: '💵' }

function toMonthly(amount: number, freq: string): number {
  switch (freq) {
    case 'weekly': return amount * 4.33
    case 'biweekly': return amount * 2.17
    case 'monthly': return amount
    case 'quarterly': return amount / 3
    case 'yearly': return amount / 12
    default: return amount
  }
}

// Default budget type mapping
const NEEDS_CATS = ['Rent/Mortgage', 'Groceries', 'Utilities', 'Transport', 'Health', 'Maintenance']
const SAVINGS_CATS = ['Investments']
function defaultBudgetType(catName: string): 'needs' | 'wants' | 'savings' {
  if (NEEDS_CATS.includes(catName)) return 'needs'
  if (SAVINGS_CATS.includes(catName)) return 'savings'
  return 'wants'
}

interface IncomeForm { name: string; type: string; amount: string; frequency: string }
const emptyIncomeForm: IncomeForm = { name: '', type: 'salary', amount: '', frequency: 'monthly' }

export default function BudgetBuilderClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [budgets, setBudgets] = useState<FinanceBudget[]>([])
  const [incomeSources, setIncomeSources] = useState<FinanceIncomeSource[]>([])
  const [goals, setGoals] = useState<{ id: string; target_amount: number; current_amount: number; target_date: string | null; monthly_contribution?: number; is_active?: boolean; is_completed?: boolean }[]>([])
  const [loading, setLoading] = useState(true)

  // Income modal
  const [incomeModal, setIncomeModal] = useState(false)
  const [editingIncome, setEditingIncome] = useState<string | null>(null)
  const [incomeForm, setIncomeForm] = useState<IncomeForm>(emptyIncomeForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const now = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const fetchData = useCallback(async () => {
    const [catRes, txRes, budRes, incRes, goalsRes] = await Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }),
      supabase.from('finance_budgets').select('*'),
      supabase.from('finance_income_sources').select('*').order('created_at'),
      supabase.from('finance_goals').select('*'),
    ])
    setCategories((catRes.data?.length ? catRes.data : DEFAULT_CATEGORIES))
    setTransactions(txRes.data || [])
    setBudgets(budRes.data || [])
    setIncomeSources(incRes.data || [])
    setGoals(goalsRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Monthly income total
  const totalIncome = useMemo(() =>
    incomeSources.filter(s => s.is_active).reduce((sum, s) => sum + toMonthly(s.amount, s.frequency), 0),
    [incomeSources]
  )

  // Current month expenses by category
  const monthTxs = useMemo(() =>
    transactions.filter(t => t.transaction_date.startsWith(monthStr) && t.type === 'expense'),
    [transactions, monthStr]
  )

  // Budget rows with 50/30/20 classification
  const budgetRows = useMemo(() => {
    const monthBudgets = budgets.filter(b => b.month?.startsWith(monthStr))
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]))

    // Get all categories that have either a budget or spending
    const catIds = new Set([...monthBudgets.map(b => b.category_id), ...monthTxs.map(t => t.category_id)])

    return Array.from(catIds).map(catId => {
      const cat = catMap[catId]
      if (!cat) return null
      const budget = monthBudgets.find(b => b.category_id === catId)
      const actual = monthTxs.filter(t => t.category_id === catId).reduce((s, t) => s + t.amount_mxn, 0)
      const budgetAmt = budget?.amount || 0
      const budgetType = (budget as unknown as Record<string, unknown>)?.budget_type as string || defaultBudgetType(cat.name)
      return {
        categoryId: catId,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        budgetType: budgetType as 'needs' | 'wants' | 'savings',
        budget: budgetAmt,
        actual,
        pctOfIncome: totalIncome > 0 ? Math.round((actual / totalIncome) * 100) : 0,
        variance: actual - budgetAmt,
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)
  }, [budgets, monthTxs, categories, monthStr, totalIncome])

  // 50/30/20 totals
  const needsTotal = budgetRows.filter(r => r.budgetType === 'needs').reduce((s, r) => s + r.actual, 0)
  const wantsTotal = budgetRows.filter(r => r.budgetType === 'wants').reduce((s, r) => s + r.actual, 0)
  // Savings = savings-category spending + goal contributions
  const savingsCategoryTotal = budgetRows.filter(r => r.budgetType === 'savings').reduce((s, r) => s + r.actual, 0)
  const goalContributions = goals
    .filter(g => !g.is_completed)
    .reduce((s, g) => {
      // Use stored monthly_contribution if available (V2 schema), otherwise compute from target/current/date
      if (g.monthly_contribution && g.monthly_contribution > 0) return s + g.monthly_contribution
      const remaining = g.target_amount - g.current_amount
      if (remaining <= 0) return s
      const targetDate = g.target_date ? new Date(g.target_date) : null
      if (!targetDate) return s
      const monthsLeft = Math.max(1, (targetDate.getFullYear() - new Date().getFullYear()) * 12 + targetDate.getMonth() - new Date().getMonth())
      return s + Math.ceil(remaining / monthsLeft)
    }, 0)
  const savingsTotal = savingsCategoryTotal + goalContributions
  const totalSpent = needsTotal + wantsTotal + savingsTotal
  const needsPct = totalIncome > 0 ? Math.round((needsTotal / totalIncome) * 100) : 0
  const wantsPct = totalIncome > 0 ? Math.round((wantsTotal / totalIncome) * 100) : 0
  const savingsPct = totalIncome > 0 ? Math.round((savingsTotal / totalIncome) * 100) : 0
  const isHealthy = needsPct <= 55 && wantsPct <= 35 && savingsPct >= 15

  // Action items (auto-generated)
  const actions = useMemo(() => {
    const items: { title: string; description: string; priority: 'high' | 'medium' | 'low'; monthlySavings: number }[] = []
    if (needsPct > 50) items.push({ title: `Reduce needs spending by ${needsPct - 50}%`, description: 'Look for housing, insurance, or utility savings', priority: 'high', monthlySavings: Math.round((needsTotal - totalIncome * 0.5)) })
    if (wantsPct > 30) items.push({ title: `Cut wants spending by ${wantsPct - 30}%`, description: 'Review dining, entertainment, and shopping', priority: 'medium', monthlySavings: Math.round((wantsTotal - totalIncome * 0.3)) })
    if (savingsPct < 20) items.push({ title: `Boost savings to 20%`, description: 'Set up auto-transfer on payday', priority: 'low', monthlySavings: Math.round(totalIncome * 0.2 - savingsTotal) })
    if (items.length === 0) items.push({ title: 'Budget looks healthy!', description: 'Keep it up — you\'re within the 50/30/20 targets', priority: 'low', monthlySavings: 0 })
    return items
  }, [needsPct, wantsPct, savingsPct, needsTotal, wantsTotal, savingsTotal, totalIncome])

  // Income CRUD
  const openAddIncome = () => { setEditingIncome(null); setIncomeForm(emptyIncomeForm); setIncomeModal(true) }
  const openEditIncome = (src: FinanceIncomeSource) => {
    setEditingIncome(src.id)
    setIncomeForm({ name: src.name, type: src.type, amount: src.amount.toString(), frequency: src.frequency })
    setIncomeModal(true)
  }

  const handleSaveIncome = async () => {
    if (!incomeForm.name || !incomeForm.amount) return
    setSaving(true)
    const record = { name: incomeForm.name, type: incomeForm.type, amount: parseFloat(incomeForm.amount), frequency: incomeForm.frequency, is_active: true }
    if (editingIncome) {
      await supabase.from('finance_income_sources').update(record).eq('id', editingIncome)
    } else {
      await supabase.from('finance_income_sources').insert(record)
    }
    setSaving(false); setIncomeModal(false); fetchData()
  }

  const handleDeleteIncome = async (id: string) => {
    await supabase.from('finance_income_sources').delete().eq('id', id)
    setDeleteConfirm(null); fetchData()
  }

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Budget Builder</h1>
          <p className="text-[hsl(var(--text-secondary))]">Zero-based budgeting with 50/30/20 analysis</p>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Monthly Income</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">${Math.round(totalIncome).toLocaleString()}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">{incomeSources.filter(s => s.is_active).length} sources</p>
        </GlassCard>
        <GlassCard className="border-l-2 border-l-blue-500">
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Needs ({needsPct}%)</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-blue-400 mt-1">${needsTotal.toLocaleString()}</p>
          <TrendBadge value={(needsPct - 50) * -1} suffix="% vs ideal 50%" />
        </GlassCard>
        <GlassCard className="border-l-2 border-l-amber-500">
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Wants ({wantsPct}%)</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-amber-400 mt-1">${wantsTotal.toLocaleString()}</p>
          <TrendBadge value={(wantsPct - 30) * -1} suffix="% vs ideal 30%" />
        </GlassCard>
        <GlassCard className="border-l-2 border-l-emerald-500">
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Savings ({savingsPct}%)</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-400 mt-1">${savingsTotal.toLocaleString()}</p>
          <TrendBadge value={savingsPct - 20} suffix="% vs ideal 20%" />
        </GlassCard>
      </div>

      {/* 50/30/20 Visualization */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-4">50/30/20 Analysis</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium">Your Budget</span>
              <span className="text-xs text-[hsl(var(--text-tertiary))]">{needsPct}/{wantsPct}/{savingsPct}</span>
            </div>
            <div className="h-8 sm:h-10 rounded-lg overflow-hidden flex bg-[hsl(var(--bg-elevated))]">
              {totalIncome > 0 && <>
                <motion.div className="bg-blue-500 flex items-center justify-center" initial={{ width: 0 }} animate={{ width: `${needsPct}%` }} transition={{ duration: 0.8 }}>
                  {needsPct > 10 && <span className="text-[10px] sm:text-xs font-bold text-white">Needs {needsPct}%</span>}
                </motion.div>
                <motion.div className="bg-amber-500 flex items-center justify-center" initial={{ width: 0 }} animate={{ width: `${wantsPct}%` }} transition={{ duration: 0.8, delay: 0.1 }}>
                  {wantsPct > 10 && <span className="text-[10px] sm:text-xs font-bold text-white">Wants {wantsPct}%</span>}
                </motion.div>
                <motion.div className="bg-emerald-500 flex items-center justify-center" initial={{ width: 0 }} animate={{ width: `${savingsPct}%` }} transition={{ duration: 0.8, delay: 0.2 }}>
                  {savingsPct > 8 && <span className="text-[10px] sm:text-xs font-bold text-white">Save {savingsPct}%</span>}
                </motion.div>
              </>}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[hsl(var(--text-tertiary))]">Ideal</span>
              <span className="text-xs text-[hsl(var(--text-tertiary))]">50/30/20</span>
            </div>
            <div className="h-4 rounded-lg overflow-hidden flex opacity-40">
              <div className="bg-blue-500" style={{ width: '50%' }} />
              <div className="bg-amber-500" style={{ width: '30%' }} />
              <div className="bg-emerald-500" style={{ width: '20%' }} />
            </div>
          </div>
        </div>
        <div className={cn("mt-4 p-3 rounded-lg text-sm", isHealthy ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400")}>
          {isHealthy ? "✅ Your budget is within healthy ranges" : `⚠️ ${needsPct > 50 ? 'Needs are ' + (needsPct - 50) + '% over target' : wantsPct > 30 ? 'Wants are ' + (wantsPct - 30) + '% over target' : 'Savings below 20% target'}`}
        </div>
      </GlassCard>

      {/* Income Sources + Budget Table */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Income Sources</h3>
            <button onClick={openAddIncome} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))] transition-colors"><Plus className="h-4 w-4" /></button>
          </div>
          {incomeSources.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-[hsl(var(--text-tertiary))]">No income sources yet</p>
              <button onClick={openAddIncome} className="text-xs text-blue-400 hover:underline mt-1">Add your first source</button>
            </div>
          ) : (
            <div className="space-y-2">
              {incomeSources.map(src => (
                <div key={src.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-[hsl(var(--bg-elevated))]/50 group">
                  <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-sm">{INCOME_ICONS[src.type] || '💵'}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{src.name}</p>
                    <p className="text-xs text-[hsl(var(--text-tertiary))] capitalize">{src.frequency}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-emerald-400">${Math.round(toMonthly(src.amount, src.frequency)).toLocaleString()}</span>
                  <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEditIncome(src)} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]"><Pencil className="h-3 w-3 text-[hsl(var(--text-tertiary))]" /></button>
                    {deleteConfirm === src.id ? (
                      <div className="flex gap-0.5">
                        <button onClick={() => handleDeleteIncome(src.id)} className="px-1.5 py-0.5 rounded text-[10px] bg-rose-600 text-white">Del</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-1.5 py-0.5 rounded text-[10px] bg-[hsl(var(--bg-elevated))]">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(src.id)} className="p-1 rounded hover:bg-rose-500/10"><Trash2 className="h-3 w-3 text-rose-400" /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <h3 className="text-base font-semibold mb-4">Budget Allocation</h3>
          {budgetRows.length === 0 ? (
            <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-6">No spending data this month. Add transactions first.</p>
          ) : (
            <>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))]">
                      {['Category', 'Type', 'Budget', 'Actual', '% Income', 'Variance'].map(h => (
                        <th key={h} className={cn("text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3", h === 'Category' || h === 'Type' ? 'text-left' : 'text-right')}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {budgetRows.map(row => (
                      <tr key={row.categoryId} className="border-b border-[hsl(var(--border))] last:border-0">
                        <td className="py-2.5 px-3"><div className="flex items-center gap-2"><span>{row.icon}</span><span className="text-sm font-medium">{row.name}</span></div></td>
                        <td className="py-2.5 px-3">
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                            row.budgetType === 'needs' && "bg-blue-500/15 text-blue-400",
                            row.budgetType === 'wants' && "bg-amber-500/15 text-amber-400",
                            row.budgetType === 'savings' && "bg-emerald-500/15 text-emerald-400",
                          )}>{row.budgetType}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right text-sm tabular-nums">${row.budget.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-sm tabular-nums">${row.actual.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right text-sm tabular-nums">{row.pctOfIncome}%</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className={cn("text-sm font-medium tabular-nums",
                            row.variance < 0 ? "text-emerald-400" : row.variance > 0 ? "text-rose-400" : "text-[hsl(var(--text-tertiary))]"
                          )}>{row.variance > 0 ? '+' : ''}{row.variance.toLocaleString()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sm:hidden space-y-2">
                {budgetRows.map(row => (
                  <div key={row.categoryId} className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))]">
                    <span className="text-lg">{row.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{row.name}</span>
                        <span className={cn("text-sm font-semibold tabular-nums",
                          row.variance < 0 ? "text-emerald-400" : row.variance > 0 ? "text-rose-400" : ""
                        )}>${row.actual.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full capitalize",
                          row.budgetType === 'needs' && "bg-blue-500/15 text-blue-400",
                          row.budgetType === 'wants' && "bg-amber-500/15 text-amber-400",
                          row.budgetType === 'savings' && "bg-emerald-500/15 text-emerald-400",
                        )}>{row.budgetType}</span>
                        <span className="text-xs text-[hsl(var(--text-tertiary))]">Budget: ${row.budget.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </GlassCard>
      </div>

      {/* Action Items */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-3">🎯 Top Actions</h3>
        <div className="space-y-2">
          {actions.map((action, i) => (
            <div key={i} className={cn("flex items-start gap-3 p-3 rounded-lg border",
              action.priority === 'high' && "border-rose-500/30 bg-rose-500/5",
              action.priority === 'medium' && "border-amber-500/30 bg-amber-500/5",
              action.priority === 'low' && "border-emerald-500/30 bg-emerald-500/5",
            )}>
              <span className="text-lg shrink-0">{action.priority === 'high' ? '🔴' : action.priority === 'medium' ? '🟡' : '🟢'}</span>
              <div className="flex-1">
                <p className="text-sm font-medium">{action.title}</p>
                <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{action.description}</p>
              </div>
              {action.monthlySavings > 0 && (
                <span className="text-sm font-semibold tabular-nums text-emerald-400 shrink-0">+${action.monthlySavings.toLocaleString()}/mo</span>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Income Source Modal */}
      <Modal open={incomeModal} onClose={() => setIncomeModal(false)} title={editingIncome ? 'Edit Income Source' : 'Add Income Source'}>
        <form onSubmit={e => { e.preventDefault(); handleSaveIncome() }} className="space-y-4">
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Source Name *</label>
            <input type="text" required placeholder="e.g., Nexaminds Salary" value={incomeForm.name}
              onChange={e => setIncomeForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['salary', 'freelance', 'investment', 'side_hustle', 'passive', 'other'] as const).map(t => (
                <button key={t} type="button" onClick={() => setIncomeForm(f => ({ ...f, type: t }))}
                  className={cn("p-2 rounded-lg border text-xs text-center transition-all capitalize",
                    incomeForm.type === t ? "border-blue-500 bg-blue-500/10" : "border-[hsl(var(--border))]"
                  )}>{INCOME_ICONS[t]} {t.replace('_', ' ')}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Amount *</label>
              <input type="number" step="100" min="0" required placeholder="55000" value={incomeForm.amount}
                onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} className={cn(inputCls, "font-semibold")} />
            </div>
            <div className="w-28">
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Frequency</label>
              <select value={incomeForm.frequency} onChange={e => setIncomeForm(f => ({ ...f, frequency: e.target.value }))} className={inputCls}>
                {['monthly', 'biweekly', 'weekly', 'quarterly', 'yearly'].map(f => (
                  <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" disabled={saving || !incomeForm.name || !incomeForm.amount}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : editingIncome ? 'Update Source' : 'Add Source'}
          </button>
        </form>
      </Modal>
    </div>
    </PageTransition>
  )
}
