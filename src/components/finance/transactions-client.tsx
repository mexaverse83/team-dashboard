'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Plus, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { PageTransition } from '@/components/page-transition'
import { Page, PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { MoneyText } from '@/components/ui/money-text'
import { BbvaStatementCard } from '@/components/finance/card-statement'
import { useResumeRefresh } from '@/hooks/use-resume-refresh'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'
import { enrichTransactions, DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import { getOwnerName, ownersEqual } from '@/lib/owners'
import { localDateKey, relativeLocalDateKey } from '@/lib/transaction-entry'
import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'
import type { FinanceRule } from '@/lib/finance-rules'
import { QuickAddHost, openQuickAdd } from '@/components/finance/quick-add/quick-add-host'
import { loadQuickAddData, primeQuickAddData } from '@/components/finance/quick-add/quick-add-data'
import { TransactionList } from '@/components/finance/transactions/transaction-list'
import { TransactionFilters, EMPTY_FILTERS, type TransactionFilterState } from '@/components/finance/transactions/transaction-filters'
import { ImportDialog } from '@/components/finance/transactions/import-dialog'
import { useUndoDelete } from '@/components/finance/transactions/use-undo-delete'

const FIRST_PAINT_ROWS = 200

function byNewest(a: FinanceTransaction, b: FinanceTransaction): number {
  return b.transaction_date.localeCompare(a.transaction_date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

/** `?category=<id>&month=YYYY-MM` drill-down from Budgets (MOB-OPP-3). */
function filtersFromUrl(): TransactionFilterState {
  if (typeof window === 'undefined') return EMPTY_FILTERS
  const params = new URLSearchParams(window.location.search)
  const month = params.get('month') || ''
  return { ...EMPTY_FILTERS, category: params.get('category') || '', month: /^\d{4}-\d{2}$/.test(month) ? month : '' }
}

function syncUrl(filters: TransactionFilterState) {
  const params = new URLSearchParams(window.location.search)
  if (filters.category) params.set('category', filters.category); else params.delete('category')
  if (filters.month) params.set('month', filters.month); else params.delete('month')
  const qs = params.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
}

const transactionsQuery = () => supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }).order('id')

export default function TransactionsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [rules, setRules] = useState<FinanceRule[]>([])
  const [loading, setLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const [filters, setFilters] = useState<TransactionFilterState>(filtersFromUrl)
  const [importOpen, setImportOpen] = useState(false)
  const [defaultOwner, setDefaultOwner] = useState('')
  const refreshInFlight = useRef(false)
  const fullLoaded = useRef(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setDefaultOwner(getOwnerName(data.user?.email ?? undefined)))
  }, [])

  const applyData = useCallback((cats: FinanceCategory[], rows: FinanceTransaction[]) => {
    const enriched = enrichTransactions(rows, cats).sort(byNewest)
    setCategories(cats)
    setTransactions(enriched)
    primeQuickAddData({ categories: cats, history: enriched })
  }, [])

  const fetchCategories = async (): Promise<FinanceCategory[]> => {
    const res = await supabase.from('finance_categories').select('*').order('sort_order')
    if (res.error) throw res.error
    return res.data && res.data.length > 0 ? res.data : DEFAULT_CATEGORIES
  }

  // Full ledger (strict paging, id tiebreaker) — the list, search and the statement card need all of it.
  const fetchAll = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    try {
      const [cats, rows] = await Promise.all([
        fetchCategories(),
        fetchAllRows<FinanceTransaction>((from, to) => transactionsQuery().range(from, to), 1000, 20000, true),
      ])
      fullLoaded.current = true
      applyData(cats, rows)
      setDataError('')
    } catch {
      setDataError('Could not refresh transactions. Your last loaded list is still shown.')
    } finally {
      refreshInFlight.current = false
      setLoading(false)
    }
  }, [applyData])

  // First paint from the newest rows, then the rest in the background (MOB-08).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [cats, first] = await Promise.all([fetchCategories(), transactionsQuery().range(0, FIRST_PAINT_ROWS - 1)])
        if (cancelled || first.error || fullLoaded.current) return
        applyData(cats, (first.data || []) as FinanceTransaction[])
        setLoading(false)
      } catch {
        // fetchAll below reports errors.
      }
    })()
    void fetchAll()
    loadQuickAddData().then(d => { if (!cancelled) setRules(d.rules) }).catch(() => {})
    return () => { cancelled = true }
  }, [applyData, fetchAll])

  useResumeRefresh(fetchAll)

  const undoDelete = useUndoDelete<FinanceTransaction>(async tx => {
    setTransactions(prev => prev.filter(t => t.id !== tx.id))
    const { error } = await supabase.from('finance_transactions').delete().eq('id', tx.id)
    if (error) {
      setDataError('Could not delete this transaction. It has been restored.')
      setTransactions(prev => [...prev, tx].sort(byNewest))
      return
    }
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_transactions' })
  })

  const updateFilters = (patch: Partial<TransactionFilterState>) => {
    setFilters(current => {
      const next = { ...current, ...patch }
      if ('category' in patch || 'month' in patch) syncUrl(next)
      return next
    })
  }

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return transactions.filter(t => {
      if (undoDelete.hidden.has(t.id)) return false
      if (filters.type !== 'all' && t.type !== filters.type) return false
      if (filters.category && t.category_id !== filters.category) return false
      if (filters.month && !t.transaction_date.startsWith(filters.month)) return false
      if (filters.owner !== 'all' && !ownersEqual(t.owner, filters.owner)) return false
      if (filters.method && (t.payment_method || '') !== filters.method) return false
      if (q && !(t.merchant?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.category?.name.toLowerCase().includes(q))) return false
      return true
    })
  }, [transactions, filters, undoDelete.hidden])

  const periodSummary = useMemo(() => {
    const now = new Date()
    const todayKey = localDateKey(now)
    const month = todayKey.slice(0, 7)
    const weekStart = relativeLocalDateKey(-((now.getDay() || 7) - 1), now)
    let today = 0, week = 0, monthTotal = 0
    for (const t of transactions) {
      if (t.type !== 'expense' || undoDelete.hidden.has(t.id)) continue
      if (t.transaction_date === todayKey) today += t.amount_mxn
      if (t.transaction_date >= weekStart && t.transaction_date <= todayKey) week += t.amount_mxn
      if (t.transaction_date.startsWith(month)) monthTotal += t.amount_mxn
    }
    return [['Today', today], ['This week', week], ['This month', monthTotal]] as const
  }, [transactions, undoDelete.hidden])

  const exportCsv = () => {
    const header = 'Date,Type,Amount,Currency,Amount MXN,Category,Merchant,Description'
    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`
    const rows = transactions.map(t =>
      `${t.transaction_date},${t.type},${t.amount},${t.currency},${t.amount_mxn},${quote(t.category?.name || '')},${quote(t.merchant || '')},${quote(t.description || '')}`)
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `transactions-${localDateKey()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const openEdit = (tx: FinanceTransaction) => openQuickAdd({ editTransaction: tx, onDelete: undoDelete.remove })
  const resetKey = JSON.stringify(filters)
  const pendingDelete = undoDelete.last

  if (loading) return <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />

  return (
    <PageTransition>
      <Page>
        <PageHeader
          title="Transactions"
          description="Capture spending fast. Keep every peso accountable."
          actions={<>
            <Button variant="secondary" onClick={() => setImportOpen(true)} aria-label="Import transactions">
              <Upload className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">Import</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={exportCsv} aria-label="Export transactions" className="hidden sm:inline-flex">
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button onClick={() => openQuickAdd()} className="flex-1 sm:flex-none">
              <Plus className="h-4 w-4" aria-hidden="true" /> Add transaction
            </Button>
          </>}
        />

        {dataError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-fg">
            <span>{dataError}</span>
            <button type="button" onClick={() => void fetchAll()} className="h-10 shrink-0 rounded-lg px-3 font-semibold underline">Retry</button>
          </div>
        )}

        <section aria-label="Spending so far" className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {periodSummary.map(([label, amount]) => (
            <div key={label} className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
              <p className="truncate text-label font-medium text-fg-tertiary">{label}</p>
              <MoneyText value={amount} className="num-metric mt-1 block text-left text-base font-semibold text-fg sm:text-xl" />
            </div>
          ))}
        </section>

        <BbvaStatementCard transactions={transactions} />

        <TransactionFilters value={filters} onChange={updateFilters} categories={categories} />

        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {filtered.length === 0 ? (
            <EmptyState icon="inbox" title="No transactions" description={transactions.length ? 'Nothing matches these filters.' : 'Add your first expense to get started.'} />
          ) : (
            <TransactionList transactions={filtered} resetKey={resetKey} onEdit={openEdit} onDelete={undoDelete.remove} />
          )}
        </div>

        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} categories={categories} rules={rules}
          existing={transactions} owner={defaultOwner} onImported={() => void fetchAll()} />

        {pendingDelete && (
          <div role="status" className="animate-fade-up fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] flex items-center gap-3 rounded-2xl border border-border bg-surface p-2 pl-4 shadow-card sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
            <span className="min-w-0 flex-1 truncate text-sm text-fg">Deleted <strong>{pendingDelete.merchant || 'transaction'}</strong></span>
            <button type="button" onClick={() => undoDelete.undo(pendingDelete.id)} className="h-11 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary/10">Undo</button>
          </div>
        )}

        {/* Fallback until the finance layout mounts the global host; only one host ever answers. */}
        <QuickAddHost />
      </Page>
    </PageTransition>
  )
}
