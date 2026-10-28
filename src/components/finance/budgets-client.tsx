'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { Page, PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatusPill } from '@/components/ui/status-pill'
import { CategoryIcon } from '@/components/ui/category-icon'
import { MoneyText } from '@/components/ui/money-text'
import { EmptyState } from '@/components/ui/empty-state'
import { useResumeRefresh } from '@/hooks/use-resume-refresh'
import { cn } from '@/lib/utils'
import { describeBudget } from '@/lib/budget-tone'
import { formatMoney } from '@/lib/format'
import { addMonthsKey, daysInMonth, localDateKey, monthEndKey } from '@/lib/dates'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'
import type { FinanceCategory, FinanceTransaction, FinanceBudget } from '@/lib/finance-types'
import { enrichBudgets, DEFAULT_CATEGORIES, cycleBudgetComparison, CYCLE_LABELS, CYCLE_MONTHS, allocatedMonthlySpend, monthKey } from '@/lib/finance-utils'
import { inputCls } from '@/lib/form-style'

// Charged at a fixed amount: exactly 100% reads "Paid", not a warning (VIS-03).
const FIXED_CATEGORIES = new Set(['Rent/Mortgage', 'Subscriptions', 'Insurance', 'Education'])
const TX_COLUMNS = 'id,type,amount_mxn,category_id,transaction_date,coverage_start,coverage_end'
// Longest billing cycle (annual) plus the selected month.
const LOOKBACK_MONTHS = Math.max(...Object.values(CYCLE_MONTHS))

type BudgetTx = Pick<FinanceTransaction, 'id' | 'type' | 'amount_mxn' | 'category_id' | 'transaction_date' | 'coverage_start' | 'coverage_end'>

function monthFromUrl(): Date {
  const now = new Date()
  if (typeof window !== 'undefined') {
    const m = new URLSearchParams(window.location.search).get('month')
    if (m && /^\d{4}-\d{2}$/.test(m)) {
      const [y, mo] = m.split('-').map(Number)
      return new Date(y, mo - 1, 1)
    }
  }
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/**
 * Expense rows that can affect `month`: dated in the 12-month lookback window,
 * plus older/newer rows whose coverage window overlaps it (perf-08, F15, CH-11).
 */
async function fetchBudgetTransactions(month: string): Promise<BudgetTx[]> {
  const windowStart = `${addMonthsKey(month, -LOOKBACK_MONTHS)}-01`
  const monthStart = `${month}-01`
  const monthEnd = monthEndKey(month)
  const [dated, covering] = await Promise.all([
    fetchAllRows<BudgetTx>((from, to) => supabase.from('finance_transactions').select(TX_COLUMNS)
      .eq('type', 'expense').gte('transaction_date', windowStart).lte('transaction_date', monthEnd)
      .order('transaction_date', { ascending: false }).order('id').range(from, to), 1000, 20000, true),
    fetchAllRows<BudgetTx>((from, to) => supabase.from('finance_transactions').select(TX_COLUMNS)
      .eq('type', 'expense').gte('coverage_end', monthStart).lte('coverage_start', monthEnd)
      .order('transaction_date', { ascending: false }).order('id').range(from, to), 1000, 20000, true),
  ])
  const byId = new Map<string, BudgetTx>()
  for (const row of [...dated, ...covering]) byId.set(row.id, row)
  return Array.from(byId.values())
}

export default function BudgetsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<BudgetTx[]>([])
  const [budgets, setBudgets] = useState<FinanceBudget[]>([])
  const [currentMonth, setCurrentMonth] = useState(monthFromUrl)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formCat, setFormCat] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const monthStr = monthKey(currentMonth)

  const fetchData = useCallback(async () => {
    try {
      const [catRes, txs, budRes] = await Promise.all([
        supabase.from('finance_categories').select('*').order('sort_order'),
        fetchBudgetTransactions(monthStr),
        supabase.from('finance_budgets').select('*'),
      ])
      const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
      setCategories(cats)
      setTransactions(txs)
      setBudgets(enrichBudgets(budRes.data || [], cats))
      setLoadError('')
    } catch {
      setLoadError('Could not load every transaction for this month, so totals are hidden rather than shown wrong.')
    } finally {
      setLoading(false)
    }
  }, [monthStr])

  useEffect(() => { void fetchData() }, [fetchData])
  useResumeRefresh(fetchData)

  const changeMonth = (delta: number) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1)
    setCurrentMonth(next)
    const params = new URLSearchParams(window.location.search)
    params.set('month', monthKey(next))
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`)
  }

  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const todayKey = localDateKey()
  const isCurrentMonth = todayKey.startsWith(monthStr)
  const dim = daysInMonth(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
  const elapsed = isCurrentMonth ? Number(todayKey.slice(8, 10)) / dim : 1

  const monthBudgets = useMemo(() => budgets.filter(b => b.month.startsWith(monthStr)), [budgets, monthStr])
  const asFull = transactions as FinanceTransaction[]

  const budgetCards = monthBudgets.map(b => {
    const cat = categories.find(c => c.id === b.category_id)
    const cycle = cat?.billing_cycle || 'monthly'
    const isFixed = FIXED_CATEGORIES.has(cat?.name || '')
    if (cycle === 'monthly') {
      const spent = allocatedMonthlySpend(asFull, b.category_id, monthStr)
      const projected = isCurrentMonth && !isFixed && elapsed >= 0.2 ? spent / elapsed : null
      return { ...b, cat, cycle, isFixed, spent, projected, pct: b.amount > 0 ? (spent / b.amount) * 100 : 0 }
    }
    const comparison = cycleBudgetComparison(asFull, b.category_id, b.amount, cycle, currentMonth)
    return { ...b, cat, cycle, isFixed, spent: comparison.monthlyAvg, projected: null, pct: comparison.pct }
  }).sort((a, b) => b.pct - a.pct)

  const expenseCats = categories.filter(c => c.type === 'expense' || c.type === 'both')
  const unbudgetedCats = expenseCats.filter(c => !monthBudgets.find(b => b.category_id === c.id))

  // Like-for-like header: spend in budgeted categories vs their budgets; the rest is listed separately (UX-06 #3).
  const totalBudgeted = monthBudgets.reduce((s, b) => s + b.amount, 0)
  const budgetedSpent = budgetCards.reduce((s, b) => s + b.spent, 0)
  const unbudgetedSpend = unbudgetedCats
    .map(c => ({ cat: c, spent: allocatedMonthlySpend(asFull, c.id, monthStr) }))
    .filter(row => row.spent >= 1)
    .sort((a, b) => b.spent - a.spent)
  const uncategorized = asFull
    .filter(t => !t.category_id || !categories.some(c => c.id === t.category_id))
    .reduce((s, t) => s + (t.transaction_date.startsWith(monthStr) ? t.amount_mxn : 0), 0)
  const outsideTotal = unbudgetedSpend.reduce((s, r) => s + r.spent, 0) + uncategorized
  const overall = describeBudget({ actual: budgetedSpent, budget: totalBudgeted })

  const openAdd = () => {
    setEditingId(null)
    setFormCat(unbudgetedCats[0]?.id || '')
    setFormAmount('')
    setModalOpen(true)
  }

  const openEdit = (b: FinanceBudget) => {
    setEditingId(b.id)
    setFormCat(b.category_id)
    setFormAmount(b.amount.toString())
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!formAmount || !formCat) return
    setSaving(true)
    if (editingId) {
      await supabase.from('finance_budgets').update({ category_id: formCat, amount: parseFloat(formAmount) }).eq('id', editingId)
    } else {
      await supabase.from('finance_budgets').insert({ category_id: formCat, month: `${monthStr}-01`, amount: parseFloat(formAmount) })
    }
    setSaving(false)
    setModalOpen(false)
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_budgets' })
    void fetchData()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('finance_budgets').delete().eq('id', id)
    setDeleteConfirm(null)
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_budgets' })
    void fetchData()
  }

  if (loading) return <div className="h-8 w-32 animate-pulse rounded bg-surface-2" />

  return (
    <PageTransition>
      <Page>
        <PageHeader
          title="Budgets"
          description="Monthly spending limits by category"
          actions={<>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-xl border border-border bg-surface-2 p-1 sm:flex-none">
              <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
              <span className="min-w-[8.5rem] text-center text-sm font-semibold text-fg" aria-live="polite">{monthLabel}</span>
              <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => changeMonth(1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
            </div>
            <Button onClick={openAdd}><Plus className="h-4 w-4" aria-hidden="true" /> Add budget</Button>
          </>}
        />

        {loadError && <div role="alert" className="rounded-xl border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-fg">{loadError} <button type="button" onClick={() => void fetchData()} className="font-semibold underline">Retry</button></div>}

        {!loadError && (
          <section className="grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-label font-medium text-fg-tertiary">Spent in budgeted categories</p>
                  <p className="mt-1 text-[1.75rem] font-semibold leading-tight text-fg">
                    <MoneyText value={budgetedSpent} className="num-metric text-left" />
                    <span className="text-base font-normal text-fg-tertiary"> of <MoneyText value={totalBudgeted} /></span>
                  </p>
                </div>
                {totalBudgeted > 0 && <StatusPill tone={overall.tone}>{overall.pct}%</StatusPill>}
              </div>
              <ProgressBar className="mt-4" value={budgetedSpent} max={totalBudgeted} label={`${monthLabel} budget`}
                marker={isCurrentMonth ? totalBudgeted * elapsed : null}
                valueText={`${overall.pct}% of budget used`} />
              {isCurrentMonth && <p className="mt-2 text-label text-fg-tertiary">Marker shows where spending would be at an even pace (day {todayKey.slice(8, 10).replace(/^0/, '')} of {dim}).</p>}
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <p className="text-label font-medium text-fg-tertiary">Outside any budget</p>
              <p className="mt-1 text-[1.75rem] font-semibold leading-tight text-fg"><MoneyText value={outsideTotal} className="num-metric text-left" /></p>
              {unbudgetedSpend.length > 0 || uncategorized > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Categories without a budget">
                  {unbudgetedSpend.slice(0, 6).map(row => (
                    <li key={row.cat.id}>
                      <Link href={`/finance/transactions?category=${row.cat.id}&month=${monthStr}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 text-label font-medium text-fg-secondary hover:text-fg">
                        {row.cat.name} <MoneyText value={row.spent} mode="compact" className="text-fg" />
                      </Link>
                    </li>
                  ))}
                  {uncategorized > 0 && <li className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 text-label text-fg-secondary">Uncategorized <MoneyText value={uncategorized} mode="compact" className="text-fg" /></li>}
                </ul>
              ) : <p className="mt-2 text-sm text-fg-secondary">Every peso this month landed in a budgeted category.</p>}
            </div>
          </section>
        )}

        {budgetCards.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState icon="chart" title="No budgets for this month" description="Set a monthly limit for a category to track it here." action={<Button onClick={openAdd}><Plus className="h-4 w-4" aria-hidden="true" /> Add budget</Button>} />
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {budgetCards.map(b => {
              const name = b.cat?.name || b.category?.name || 'Category'
              const status = describeBudget({ actual: b.spent, budget: b.amount, projected: b.projected, isFixed: b.isFixed })
              const left = b.amount - b.spent
              const nonMonthly = b.cycle !== 'monthly'
              const detail = status.label === 'Paid'
                ? 'Paid'
                : left >= 0 ? `${formatMoney(left)} left` : `${formatMoney(-left)} over`
              const href = `/finance/transactions?category=${b.category_id}&month=${monthStr}`
              return (
                <li key={b.id} className={cn('group relative flex flex-col rounded-2xl border bg-surface p-4 transition-colors hover:border-border-strong', status.tone === 'negative' ? 'border-negative/40' : 'border-border')}>
                  <Link href={href} className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                    aria-label={`${name}: ${formatMoney(b.spent)} of ${formatMoney(b.amount)}, ${status.pct}% — ${detail}. View transactions`} />
                  <div className="pointer-events-none flex items-center gap-3">
                    <CategoryIcon name={name} emoji={b.cat?.icon} colorIndex={b.cat?.sort_order ?? 0} size={36} className="rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="truncate text-sm font-semibold text-fg">{name}</h3>
                        {nonMonthly && <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 text-micro font-medium text-fg-secondary">{CYCLE_LABELS[b.cycle as keyof typeof CYCLE_LABELS]}</span>}
                      </div>
                      <p className="text-label text-fg-tertiary">
                        {nonMonthly ? <>~<MoneyText value={b.spent} />/mo avg of <MoneyText value={b.amount} /></> : <><MoneyText value={b.spent} /> of <MoneyText value={b.amount} /></>}
                      </p>
                    </div>
                    <StatusPill tone={status.tone}>{status.label === 'Paid' ? 'Paid' : `${status.pct}%`}</StatusPill>
                  </div>
                  <ProgressBar className="pointer-events-none mt-3" value={b.spent} max={b.amount} projected={b.projected} isFixed={b.isFixed}
                    marker={isCurrentMonth && !nonMonthly && !b.isFixed ? b.amount * elapsed : null}
                    label={`${name} budget`} valueText={`${status.pct}% — ${detail}`} />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className={cn('pointer-events-none text-label', status.tone === 'negative' ? 'font-medium text-negative' : 'text-fg-secondary')}>
                      {detail}{b.projected != null && status.tone !== 'negative' && b.projected > b.amount && <span className="text-warning"> · on pace for {formatMoney(b.projected)}</span>}
                    </p>
                    <div className="relative z-10 -my-1.5 -mr-1.5 flex shrink-0 items-center opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${name} budget`} onClick={() => openEdit(b)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                      {deleteConfirm === b.id ? (
                        <>
                          <Button variant="danger" size="sm" onClick={() => handleDelete(b.id)}>Delete</Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>Keep</Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="icon" aria-label={`Delete ${name} budget`} onClick={() => setDeleteConfirm(b.id)} className="hover:text-negative"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit budget' : 'Add budget'}>
          <form onSubmit={e => { e.preventDefault(); void handleSave() }} className="space-y-4">
            <div>
              <label htmlFor="budget-category" className="mb-1 block text-label font-medium text-fg-secondary">Category</label>
              <select id="budget-category" value={formCat} onChange={e => setFormCat(e.target.value)} className={inputCls} required>
                <option value="">Select category</option>
                {(editingId ? expenseCats : unbudgetedCats).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="budget-amount" className="mb-1 block text-label font-medium text-fg-secondary">Monthly limit (MXN)</label>
              <input id="budget-amount" type="number" inputMode="decimal" step="100" min="0" required placeholder="5000" value={formAmount}
                onChange={e => setFormAmount(e.target.value)} className={cn(inputCls, 'text-lg font-semibold')} />
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={saving || !formAmount || !formCat}>
              {saving ? 'Saving…' : editingId ? 'Update budget' : 'Set budget'}
            </Button>
          </form>
        </Modal>
      </Page>
    </PageTransition>
  )
}
