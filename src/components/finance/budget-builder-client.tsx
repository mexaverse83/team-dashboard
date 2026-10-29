'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2, CheckCircle2, AlertTriangle, Briefcase, Laptop, Moon, Hammer, TrendingUp, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { Page, PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import { MoneyText } from '@/components/ui/money-text'
import { StatusPill } from '@/components/ui/status-pill'
import { useResumeRefresh } from '@/hooks/use-resume-refresh'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { describeBudget, type Tone } from '@/lib/budget-tone'
import { formatDelta } from '@/lib/format'
import { addMonthsKey, localDateKey, monthEndKey } from '@/lib/dates'
import { DEFAULT_CATEGORIES, defaultBudgetType, allocatedAmount, monthKey } from '@/lib/finance-utils'
import { categoryMonthSpend, fetchBudgetTransactions, type BudgetTx } from '@/components/finance/budgets-client'
import { getNextTreatmentEvent, getTreatmentEventForMonth } from '@/lib/fertility-plan'
import type { FinanceCategory, FinanceTransaction, FinanceBudget, FinanceIncomeSource } from '@/lib/finance-types'

import { inputCls } from '@/lib/form-style'
import Link from 'next/link'

/** finance_recurring_income: the salaries (source of truth), posted automatically. */
interface RecurringIncomeRow { id?: string; name?: string; owner?: string; amount: number; recurrence: string; active: boolean; start_date: string | null }

const INCOME_ICONS: Record<string, typeof Wallet> = { salary: Briefcase, freelance: Laptop, passive: Moon, side_hustle: Hammer, investment: TrendingUp, other: Wallet }
const INCOME_COLUMNS = 'id,type,amount_mxn,category_id,transaction_date'
type IncomeTx = Pick<FinanceTransaction, 'id' | 'type' | 'amount_mxn' | 'category_id' | 'transaction_date'>
const card = 'rounded-2xl border border-border bg-surface p-4 sm:p-5'

/** '12 pts under 50% target' — plain words, no arrows (VIS-16). */
export function targetGap(pct: number, target: number): string {
  const diff = pct - target
  if (diff === 0) return `On the ${target}% target`
  return `${Math.abs(diff)} pts ${diff < 0 ? 'under' : 'over'} ${target}% target`
}

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

interface IncomeForm { name: string; type: string; amount: string; frequency: string }
const emptyIncomeForm: IncomeForm = { name: '', type: 'salary', amount: '', frequency: 'monthly' }

export default function BudgetBuilderClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [expenses, setExpenses] = useState<BudgetTx[]>([])
  const [incomeTxs, setIncomeTxs] = useState<IncomeTx[]>([])
  const [budgets, setBudgets] = useState<FinanceBudget[]>([])
  const [incomeSources, setIncomeSources] = useState<FinanceIncomeSource[]>([])
  // Salaries live in finance_recurring_income (the income source of truth);
  // finance_income_sources only holds extras. Income must combine both, or the
  // 50/30/20 ratios divide by a tiny number and blow up to thousands of %.
  const [recurringIncome, setRecurringIncome] = useState<RecurringIncomeRow[]>([])
  const [goals, setGoals] = useState<{ id: string; target_amount: number; current_amount: number; target_date: string | null; monthly_contribution?: number; is_active?: boolean; is_completed?: boolean }[]>([])
  const [msiCommitment, setMsiCommitment] = useState(0)
  const [loading, setLoading] = useState(true)
  const [txError, setTxError] = useState(false)

  // Income modal
  const [incomeModal, setIncomeModal] = useState(false)
  const [editingIncome, setEditingIncome] = useState<string | null>(null)
  const [incomeForm, setIncomeForm] = useState<IncomeForm>(emptyIncomeForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [now] = useState(() => new Date())
  const todayKey = localDateKey(now)
  const monthStr = monthKey(now)

  const fetchData = useCallback(async () => {
    const [catRes, expRes, incTxRes, budRes, incRes, goalsRes, instRes, riRes] = await Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      // Same rows and allocation as the Budgets page, so both pages agree (VIS-03d, CH-11).
      fetchBudgetTransactions(monthStr).then(rows => rows, () => null),
      // Trailing three full months of income for the 50/30/20 denominator.
      fetchAllRows<IncomeTx>((from, to) => supabase.from('finance_transactions').select(INCOME_COLUMNS)
        .eq('type', 'income').gte('transaction_date', `${addMonthsKey(monthStr, -3)}-01`)
        .order('transaction_date', { ascending: false }).order('id').range(from, to), 1000, 20000, true)
        .then(rows => rows, () => null),
      supabase.from('finance_budgets').select('*').gte('month', `${monthStr}-01`).lte('month', monthEndKey(monthStr)),
      supabase.from('finance_income_sources').select('*').order('created_at'),
      supabase.from('finance_goals').select('*'),
      supabase.from('finance_installments').select('*').eq('is_active', true),
      // Server route: the browser key can't read finance_recurring_income under RLS (salaries live there).
      fetch('/api/finance/recurring-income', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ])
    setCategories((catRes.data?.length ? catRes.data : DEFAULT_CATEGORIES))
    setTxError(expRes == null || incTxRes == null)
    setExpenses(expRes || [])
    setIncomeTxs(incTxRes || [])
    setBudgets(budRes.data || [])
    setIncomeSources(incRes.data || [])
    setRecurringIncome(((riRes?.data || []) as RecurringIncomeRow[]).filter(r => r.active))
    setGoals(goalsRes.data || [])
    setMsiCommitment((instRes.data || []).reduce((s: number, i: { installment_amount: number }) => s + i.installment_amount, 0))
    setLoading(false)
  }, [monthStr])

  useEffect(() => { void fetchData() }, [fetchData])
  useResumeRefresh(fetchData)

  // Monthly income for the 50/30/20 denominator.
  // Salaries are logged as actual income transactions (not configured income
  // sources), so the truest figure is the trailing average of real income.
  // Fall back to configured sources + recurring income when no transactions
  // exist yet. Using a tiny configured-only number blows the ratios up to
  // thousands of percent.
  const configuredIncome = useMemo(() => {
    const RI_DIVISOR: Record<string, number> = { monthly: 1, bimonthly: 2, annual: 12 }
    const todayStr = localDateKey()
    const sources = incomeSources.filter(s => s.is_active).reduce((sum, s) => sum + toMonthly(s.amount, s.frequency), 0)
    const recurring = recurringIncome
      .filter(r => r.active && (!r.start_date || r.start_date <= todayStr))
      .reduce((sum, r) => sum + r.amount / (RI_DIVISOR[r.recurrence] || 1), 0)
    return sources + recurring
  }, [incomeSources, recurringIncome])

  const actualMonthlyIncome = useMemo(() => {
    const ref = new Date()
    // Trailing 3 prior full months (exclude the current, possibly-partial month)
    const months = [1, 2, 3].map(i => addMonthsKey(monthKey(ref), -i))
    const totals = months
      .map(m => incomeTxs.filter(t => t.type === 'income' && t.transaction_date.startsWith(m)).reduce((s, t) => s + t.amount_mxn, 0))
      .filter(v => v > 0)
    if (totals.length === 0) return 0
    return totals.reduce((a, b) => a + b, 0) / totals.length
  }, [incomeTxs])

  const totalIncome = actualMonthlyIncome > 0 ? actualMonthlyIncome : configuredIncome
  const incomeIsActual = actualMonthlyIncome > 0

  // Expenses that land in this month, including spread (coverage) rows.
  const monthTxs = useMemo(() =>
    expenses.filter(t => t.type === 'expense' && allocatedAmount(t as FinanceTransaction, monthStr) > 0),
    [expenses, monthStr]
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
      const cycle = cat.billing_cycle || 'monthly'
      const actual = categoryMonthSpend(expenses, catId, cycle, monthStr, todayKey)
      const budgetAmt = budget?.amount || 0
      const budgetType = (budget as unknown as Record<string, unknown>)?.budget_type as string || defaultBudgetType(cat.name)
      return {
        categoryId: catId,
        name: cat.name,
        icon: cat.icon,
        sortOrder: cat.sort_order,
        color: cat.color,
        budgetType: budgetType as 'needs' | 'wants' | 'savings',
        budget: budgetAmt,
        actual,
        pctOfIncome: totalIncome > 0 ? Math.round((actual / totalIncome) * 100) : 0,
        variance: actual - budgetAmt,
      }
    }).filter((r): r is NonNullable<typeof r> => r !== null)
  }, [budgets, monthTxs, categories, monthStr, totalIncome, expenses, todayKey])

  // 50/30/20 totals (MSI installments count as committed "needs" spending)
  const needsTotal = budgetRows.filter(r => r.budgetType === 'needs').reduce((s, r) => s + r.actual, 0) + msiCommitment
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
  // Same over-budget rule as the Budgets page (VIS-03d): a ledger over budget is never "healthy".
  const budgetedRows = budgetRows.filter(r => r.budget > 0)
  const budgetStatus = describeBudget({ actual: budgetedRows.reduce((s, r) => s + r.actual, 0), budget: budgetedRows.reduce((s, r) => s + r.budget, 0) })
  const overBudget = budgetStatus.tone === 'negative'
  const overRows = budgetedRows.filter(r => r.actual > r.budget).sort((a, b) => (b.actual - b.budget) - (a.actual - a.budget))
  const isHealthy = needsPct <= 55 && wantsPct <= 35 && savingsPct >= 15 && !overBudget
  const healthMessage = overBudget
    ? `Spending is at ${budgetStatus.pct}% of budget this month`
    : needsPct > 50 ? `Needs are ${needsPct - 50} pts over the 50% target`
      : wantsPct > 30 ? `Wants are ${wantsPct - 30} pts over the 30% target`
        : savingsPct < 20 ? `Savings are ${20 - savingsPct} pts under the 20% target`
          : 'Your budget is within healthy ranges'
  const treatmentEvent = getTreatmentEventForMonth(monthStr) ?? getNextTreatmentEvent(now)
  const treatmentReserve = treatmentEvent?.amount ?? 0

  // Action items (auto-generated)
  const actions = useMemo(() => {
    const items: { title: React.ReactNode; description: React.ReactNode; priority: 'high' | 'medium' | 'low'; monthlySavings: number }[] = []
    if (overRows.length > 0) {
      const names = overRows.slice(0, 3).map((r, i) => (
        <React.Fragment key={r.categoryId}>{i > 0 && ', '}{r.name} <MoneyText value={r.actual - r.budget} /> over</React.Fragment>
      ))
      items.push({
        title: `${overRows.length} ${overRows.length === 1 ? 'category' : 'categories'} over budget`,
        description: <>{names}{overRows.length > 3 ? `, and ${overRows.length - 3} more` : ''}.</>,
        priority: 'high',
        monthlySavings: Math.round(overRows.reduce((s, r) => s + r.actual - r.budget, 0)),
      })
    }
    if (treatmentReserve > 0) {
      items.push({
        title: <>Reserve <MoneyText value={treatmentReserve} /> for fertility treatment</>,
        description: 'Temporary May-July commitment; protect active goal contributions first, then cut wants.',
        priority: 'high',
        monthlySavings: treatmentReserve,
      })
    }
    if (needsPct > 50) items.push({ title: `Bring needs down ${needsPct - 50} pts`, description: 'Look for housing, insurance, or utility savings', priority: 'high', monthlySavings: Math.round((needsTotal - totalIncome * 0.5)) })
    if (wantsPct > 30) items.push({ title: `Bring wants down ${wantsPct - 30} pts`, description: 'Review dining, entertainment, and shopping', priority: 'medium', monthlySavings: Math.round((wantsTotal - totalIncome * 0.3)) })
    if (savingsPct < 20) items.push({ title: `Boost savings to 20%`, description: 'Set up auto-transfer on payday', priority: 'low', monthlySavings: Math.round(totalIncome * 0.2 - savingsTotal) })
    if (items.length === 0 && !overBudget) items.push({ title: 'Budget looks healthy!', description: 'Keep it up — you\'re within the 50/30/20 targets', priority: 'low', monthlySavings: 0 })
    return items
  }, [needsPct, wantsPct, savingsPct, needsTotal, wantsTotal, savingsTotal, totalIncome, treatmentReserve, overRows, overBudget])

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

  if (loading) return <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />

  const split: { key: 'needs' | 'wants' | 'savings'; label: string; pct: number; total: number; target: number; over: boolean; bar: string }[] = [
    { key: 'needs', label: 'Needs', pct: needsPct, total: needsTotal, target: 50, over: needsPct > 50, bar: 'bg-cat-2' },
    { key: 'wants', label: 'Wants', pct: wantsPct, total: wantsTotal, target: 30, over: wantsPct > 30, bar: 'bg-cat-4' },
    { key: 'savings', label: 'Savings', pct: savingsPct, total: savingsTotal, target: 20, over: savingsPct < 20, bar: 'bg-cat-1' },
  ]
  const TYPE_TONE: Record<string, Tone> = { needs: 'neutral', wants: 'neutral', savings: 'positive' }
  const priorityTone: Record<'high' | 'medium' | 'low', Tone> = { high: 'negative', medium: 'warning', low: 'positive' }
  const priorityWord: Record<'high' | 'medium' | 'low', string> = { high: 'Now', medium: 'Soon', low: 'Later' }

  return (
    <PageTransition>
      <Page>
        <PageHeader title="Budget Builder" description="Zero-based budgeting with 50/30/20 analysis" />

        {txError && <div role="alert" className="rounded-xl border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-fg">Could not load every transaction, so spending figures may be incomplete. <button type="button" onClick={() => void fetchData()} className="font-semibold underline">Retry</button></div>}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className={card}>
            <p className="text-xs font-medium text-fg-tertiary">Monthly income</p>
            <MoneyText value={totalIncome} className="num-metric mt-1 block !text-left text-xl font-semibold text-fg sm:text-2xl" />
            <p className="mt-1 text-xs text-fg-tertiary">{incomeIsActual ? '3-month average, actual' : `${incomeSources.filter(s => s.is_active).length} configured`}</p>
          </div>
          {split.map(item => (
            <div key={item.key} className={card}>
              <p className="flex items-center gap-1.5 text-xs font-medium text-fg-tertiary">
                <span className={cn('h-2 w-2 rounded-full', item.bar)} aria-hidden="true" />{item.label} · {item.pct}%
              </p>
              <MoneyText value={item.total} className="num-metric mt-1 block !text-left text-xl font-semibold text-fg sm:text-2xl" />
              <p className={cn('mt-1 flex items-center gap-1 text-xs', item.over ? 'text-warning' : 'text-fg-secondary')}>
                {!item.over && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-positive" aria-hidden="true" />}
                {targetGap(item.pct, item.target)}
              </p>
            </div>
          ))}
        </section>

        <section className={card}>
          <h2 className="mb-4 text-base font-semibold text-fg">50/30/20 Analysis</h2>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-fg">Your month</span>
                <span className="text-fg-tertiary">{needsPct} / {wantsPct} / {savingsPct}</span>
              </div>
              <div className="flex h-8 overflow-hidden rounded-lg bg-surface-2 sm:h-10" role="img"
                aria-label={`Needs ${needsPct}%, wants ${wantsPct}%, savings ${savingsPct}% of income`}>
                {totalIncome > 0 && split.map((item, i) => (
                  <motion.div key={item.key} className={cn('flex items-center justify-center', item.bar)} initial={{ width: 0 }} animate={{ width: `${Math.min(100, item.pct)}%` }} transition={{ duration: 0.8, delay: i * 0.1 }}>
                    {item.pct > 10 && <span className="truncate whitespace-nowrap px-1 text-xs font-semibold text-[hsl(var(--background))]">{item.pct >= 20 ? `${item.label} ` : ''}{item.pct}%</span>}
                  </motion.div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-fg-tertiary">
                <span className="font-medium">Ideal</span><span>50 / 30 / 20</span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-lg opacity-40" aria-hidden="true">
                <div className="bg-cat-2" style={{ width: '50%' }} />
                <div className="bg-cat-4" style={{ width: '30%' }} />
                <div className="bg-cat-1" style={{ width: '20%' }} />
              </div>
            </div>
          </div>
          <div role="status" className={cn('mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-fg', overBudget ? 'bg-negative-bg' : isHealthy ? 'bg-positive-bg' : 'bg-warning-bg')}>
            {isHealthy
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" aria-hidden="true" />
              : <AlertTriangle className={cn('h-4 w-4 shrink-0', overBudget ? 'text-negative' : 'text-warning')} aria-hidden="true" />}
            {healthMessage}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-fg">Income Sources</h2>
              <Button variant="ghost" size="icon" aria-label="Add income source" onClick={openAddIncome}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
            </div>
            {recurringIncome.length > 0 && (
              <ul className="mb-3 space-y-2" aria-label="Salaries">
                {recurringIncome.map((r, i) => (
                  <li key={r.id || i} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-secondary"><Briefcase className="h-4 w-4" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{r.name || 'Salary'}</p>
                      <p className="text-xs text-fg-tertiary">
                        {r.start_date && r.start_date > localDateKey() ? `Starts ${r.start_date.slice(0, 7)} · ` : 'Posts automatically · '}
                        <MoneyText value={r.amount / ({ monthly: 1, bimonthly: 2, annual: 12 } as Record<string, number>)[r.recurrence] || r.amount} className="text-fg-secondary" />/mo
                      </p>
                    </div>
                  </li>
                ))}
                <li><Link href="/finance/income" className="text-xs font-medium text-fg-secondary hover:text-fg">Edit salaries on Income</Link></li>
              </ul>
            )}
            {recurringIncome.length > 0 && <p className="mb-2 text-xs font-medium text-fg-tertiary">Extras</p>}
            {incomeSources.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-fg-secondary">No extra income sources yet</p>
                <Button variant="ghost" size="sm" className="mt-1" onClick={openAddIncome}>Add a source</Button>
              </div>
            ) : (
              <ul className="space-y-2">
                {incomeSources.map(src => {
                  const Icon = INCOME_ICONS[src.type] || Wallet
                  return (
                    <li key={src.id} className={cn('group relative flex items-center gap-3 rounded-xl bg-surface-2 p-2.5', !src.is_active && 'opacity-60')}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-secondary"><Icon className="h-4 w-4" aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg"><span className="truncate">{src.name}</span>{!src.is_active && <StatusPill tone="neutral" className="shrink-0 text-xs">Inactive</StatusPill>}</p>
                        <p className="text-xs text-fg-tertiary"><span className="capitalize">{src.frequency}</span> · <MoneyText value={toMonthly(src.amount, src.frequency)} className="text-fg-secondary" />/mo</p>
                      </div>
                      {/* Hover actions float over the row on sm+ so they don't steal width from the name. */}
                      <div className="flex shrink-0 items-center opacity-100 transition-opacity sm:absolute sm:inset-y-0 sm:right-1 sm:rounded-r-xl sm:bg-surface-2 sm:pl-1 sm:opacity-0 sm:pointer-events-none sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${src.name}`} onClick={() => openEditIncome(src)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                        {deleteConfirm === src.id ? (
                          <>
                            <Button variant="danger" size="sm" onClick={() => handleDeleteIncome(src.id)}>Delete</Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Keep</Button>
                          </>
                        ) : (
                          <Button variant="ghost" size="icon" aria-label={`Delete ${src.name}`} onClick={() => setDeleteConfirm(src.id)} className="hover:text-negative"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className={cn(card, 'lg:col-span-2')}>
            <h2 className="mb-3 text-base font-semibold text-fg">Budget Allocation</h2>
            {budgetRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-secondary">No spending data this month. Add transactions first.</p>
            ) : (
              <>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {['Category', 'Type', 'Budget', 'Actual', '% Income', 'Variance'].map(h => (
                          <th key={h} scope="col" className={cn('px-3 py-2.5 text-xs font-medium text-fg-secondary', h === 'Category' || h === 'Type' ? 'text-left' : 'text-right')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {budgetRows.map(row => (
                        <tr key={row.categoryId} className="border-b border-border last:border-0">
                          <td className="px-3 py-2.5"><div className="flex items-center gap-2"><CategoryIcon name={row.name} emoji={row.icon} colorIndex={row.sortOrder} size={24} /><span className="text-sm font-medium text-fg">{row.name}</span></div></td>
                          <td className="px-3 py-2.5"><StatusPill tone={TYPE_TONE[row.budgetType]} className="text-xs capitalize">{row.budgetType}</StatusPill></td>
                          <td className="num px-3 py-2.5 text-sm text-fg-secondary">{row.budget ? <MoneyText value={row.budget} /> : '—'}</td>
                          <td className="num px-3 py-2.5 text-sm text-fg"><MoneyText value={row.actual} /></td>
                          <td className="num px-3 py-2.5 text-sm text-fg-secondary">{row.pctOfIncome}%</td>
                          <td className={cn('num px-3 py-2.5 text-sm font-medium', row.budget > 0 && row.variance > 0 ? 'text-negative' : 'text-fg-secondary')}>
                            {row.budget > 0 ? <span data-money="">{formatDelta(row.variance, { mode: 'full' })}</span> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="space-y-2 sm:hidden">
                  {budgetRows.map(row => (
                    <li key={row.categoryId} className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
                      <CategoryIcon name={row.name} emoji={row.icon} colorIndex={row.sortOrder} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-fg">{row.name}</span>
                          <MoneyText value={row.actual} className="shrink-0 text-sm font-semibold text-fg" />
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-fg-tertiary">
                          <span className="capitalize">{row.budgetType} · budget {row.budget ? <MoneyText value={row.budget} /> : '—'}</span>
                          {row.budget > 0 && <span data-money="" className={row.variance > 0 ? 'font-medium text-negative' : ''}>{formatDelta(row.variance, { mode: 'full' })}</span>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <section className={card}>
          <h2 className="mb-3 text-base font-semibold text-fg">Top Actions</h2>
          <ul className="space-y-2">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3">
                <StatusPill tone={priorityTone[action.priority]} className="text-xs mt-0.5 shrink-0">{priorityWord[action.priority]}</StatusPill>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{action.title}</p>
                  <p className="mt-0.5 text-xs text-fg-tertiary">{action.description}</p>
                </div>
                {action.monthlySavings > 0 && <span className="shrink-0 text-sm font-semibold text-fg"><MoneyText value={action.monthlySavings} sign="always" />/mo</span>}
              </li>
            ))}
          </ul>
        </section>

        <Modal open={incomeModal} onClose={() => setIncomeModal(false)} title={editingIncome ? 'Edit income source' : 'Add income source'}>
          <form onSubmit={e => { e.preventDefault(); void handleSaveIncome() }} className="space-y-4">
            <div>
              <label htmlFor="income-name" className="mb-1 block text-xs font-medium text-fg-secondary">Source name</label>
              <input id="income-name" type="text" required placeholder="e.g., Nexaminds Salary" value={incomeForm.name}
                onChange={e => setIncomeForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-fg-secondary">Type</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Income type">
                {(['salary', 'freelance', 'investment', 'side_hustle', 'passive', 'other'] as const).map(t => {
                  const Icon = INCOME_ICONS[t]
                  return (
                    <button key={t} type="button" aria-pressed={incomeForm.type === t} onClick={() => setIncomeForm(f => ({ ...f, type: t }))}
                      className={cn('flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm capitalize transition-colors',
                        incomeForm.type === t ? 'border-primary bg-primary/15 text-fg' : 'border-border bg-surface-2 text-fg-secondary')}>
                      <Icon className="h-4 w-4" aria-hidden="true" />{t.replace('_', ' ')}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="income-amount" className="mb-1 block text-xs font-medium text-fg-secondary">Amount</label>
                <input id="income-amount" type="number" inputMode="decimal" step="100" min="0" required placeholder="55000" value={incomeForm.amount}
                  onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} className={cn(inputCls, 'font-semibold')} />
              </div>
              <div className="w-32">
                <label htmlFor="income-frequency" className="mb-1 block text-xs font-medium text-fg-secondary">Frequency</label>
                <select id="income-frequency" value={incomeForm.frequency} onChange={e => setIncomeForm(f => ({ ...f, frequency: e.target.value }))} className={inputCls}>
                  {['monthly', 'biweekly', 'weekly', 'quarterly', 'yearly'].map(f => (
                    <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={saving || !incomeForm.name || !incomeForm.amount}>
              {saving ? 'Saving…' : editingIncome ? 'Update source' : 'Add source'}
            </Button>
          </form>
        </Modal>
      </Page>
    </PageTransition>
  )
}
