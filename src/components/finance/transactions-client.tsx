'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'
import { enrichTransactions, DEFAULT_CATEGORIES } from '@/lib/finance-utils'

const inputCls = "w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-blue-500 transition-colors"
const labelCls = "text-xs text-[hsl(var(--text-secondary))] mb-1 block"

function today() { return new Date().toISOString().slice(0, 10) }

interface TxForm {
  type: 'expense' | 'income'
  amount: string
  currency: string
  amount_mxn: string
  category_id: string
  merchant: string
  description: string
  transaction_date: string
  tags: string
  is_recurring: boolean
}

const emptyForm: TxForm = { type: 'expense', amount: '', currency: 'MXN', amount_mxn: '', category_id: '', merchant: '', description: '', transaction_date: today(), tags: '', is_recurring: false }

export default function TransactionsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TxForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const perPage = 25

  const fetchData = useCallback(async () => {
    const [catRes, txRes] = await Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }),
    ])
    
    
    const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
    const txs = txRes.data || []
    setCategories(cats)
    setTransactions(enrichTransactions(txs, cats))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(); const h = () => { if (document.visibilityState === "visible") fetchData() }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h) }, [fetchData])

  // Merchant autocomplete
  const knownMerchants = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach(t => { if (t.merchant) set.add(t.merchant) })
    return Array.from(set).sort()
  }, [transactions])

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (categoryFilter && t.category_id !== categoryFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!(t.merchant?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.category?.name.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [transactions, typeFilter, categoryFilter, search])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  // Open modal for add
  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  // Open modal for edit
  const openEdit = (tx: FinanceTransaction) => {
    setEditingId(tx.id)
    setForm({
      type: tx.type,
      amount: tx.amount.toString(),
      currency: tx.currency,
      amount_mxn: tx.amount_mxn.toString(),
      category_id: tx.category_id,
      merchant: tx.merchant || '',
      description: tx.description || '',
      transaction_date: tx.transaction_date,
      tags: tx.tags?.join(', ') || '',
      is_recurring: tx.is_recurring,
    })
    setModalOpen(true)
  }

  // Save (create or update)
  const handleSave = async () => {
    if (!form.amount || !form.category_id || !form.transaction_date) return
    setSaving(true)

    const amt = parseFloat(form.amount)
    const amtMxn = form.currency === 'USD' && form.amount_mxn ? parseFloat(form.amount_mxn) : amt
    const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []

    const record = {
      type: form.type,
      amount: amt,
      currency: form.currency,
      amount_mxn: amtMxn,
      category_id: form.category_id,
      merchant: form.merchant || null,
      description: form.description || null,
      transaction_date: form.transaction_date,
      tags,
      is_recurring: form.is_recurring,
    }

    if (editingId) {
      await supabase.from('finance_transactions').update(record).eq('id', editingId)
    } else {
      await supabase.from('finance_transactions').insert(record)
    }

    setModalOpen(false)
    setSaving(false)
    fetchData()
  }

  // Delete
  const handleDelete = async (id: string) => {
    await supabase.from('finance_transactions').delete().eq('id', id)
    setDeleteConfirm(null)
    fetchData()
  }

  const updateForm = (patch: Partial<TxForm>) => setForm(f => ({ ...f, ...patch }))

  const filteredCats = categories.filter(c => c.type === form.type || c.type === 'both')

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-[hsl(var(--text-secondary))]">All income and expenses</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> Add Transaction
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-3 p-3 rounded-xl bg-[hsl(var(--bg-elevated))]/50 border border-[hsl(var(--border))]">
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
          className="px-3 py-1.5 rounded-lg bg-[hsl(var(--bg-elevated))] text-xs border-none outline-none">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[hsl(var(--bg-elevated))]">
          {['all', 'expense', 'income'].map(t => (
            <button key={t} onClick={() => { setTypeFilter(t); setPage(1) }}
              className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                typeFilter === t ? "bg-blue-600 text-white" : "text-[hsl(var(--text-secondary))]"
              )}>
              {t === 'all' ? 'All' : t === 'expense' ? '↓ Expenses' : '↑ Income'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[hsl(var(--bg-elevated))] flex-1 min-w-[150px]">
          <Search className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
          <input placeholder="Search merchants, notes..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="bg-transparent text-xs flex-1 outline-none" />
        </div>
      </div>

      {/* Table */}
      <GlassCard>
        {paginated.length === 0 ? (
          <EmptyState icon="inbox" title="No transactions" description="No transactions match your filters" />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    {['Date', 'Merchant', 'Amount', 'Category', '', ''].map((h, i) => (
                      <th key={i} className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(tx => (
                    <tr key={tx.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors group">
                      <td className="py-3 px-4 text-sm text-[hsl(var(--text-secondary))]">{tx.transaction_date.slice(5)}</td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium">{tx.merchant || '—'}</p>
                        {tx.description && <p className="text-xs text-[hsl(var(--text-tertiary))] truncate max-w-[200px]">{tx.description}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn("text-sm font-semibold", tx.type === 'income' ? "text-emerald-400" : "text-rose-400")}>
                          {tx.type === 'income' ? '+' : '-'}${tx.amount_mxn.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
                          style={{ background: `${tx.category?.color || '#6B7280'}20`, color: tx.category?.color }}>
                          {tx.category?.icon} {tx.category?.name}
                        </span>
                      </td>
                      <td className="py-2 px-2 w-8">
                        <button onClick={() => openEdit(tx)} className="p-1.5 rounded-md sm:opacity-0 sm:group-hover:opacity-100 hover:bg-[hsl(var(--bg-elevated))] transition-all" title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
                        </button>
                      </td>
                      <td className="py-2 px-2 w-8">
                        {deleteConfirm === tx.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(tx.id)} className="px-2 py-1 rounded text-xs bg-rose-600 text-white">Yes</button>
                            <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 rounded text-xs bg-[hsl(var(--bg-elevated))]">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(tx.id)} className="p-1.5 rounded-md sm:opacity-0 sm:group-hover:opacity-100 hover:bg-rose-500/10 transition-all" title="Delete">
                            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden space-y-2">
              {paginated.map(tx => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))]"
                  onClick={() => openEdit(tx)}>
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: `${tx.category?.color || '#6B7280'}20` }}>
                    {tx.category?.icon || '📦'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{tx.merchant || '—'}</p>
                      <span className={cn("text-sm font-semibold shrink-0 ml-2",
                        tx.type === 'income' ? "text-emerald-400" : "text-rose-400")}>
                        {tx.type === 'income' ? '+' : '-'}${tx.amount_mxn.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[hsl(var(--text-tertiary))]">{tx.transaction_date.slice(5)}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ background: `${tx.category?.color}20`, color: tx.category?.color }}>
                        {tx.category?.name}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-[hsl(var(--border))]">
              <span className="text-xs text-[hsl(var(--text-tertiary))]">{filtered.length} transactions</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded text-xs disabled:opacity-30">◀</button>
                <span className="text-xs">Page {page} of {totalPages || 1}</span>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 rounded text-xs disabled:opacity-30">▶</button>
              </div>
            </div>
          </>
        )}
      </GlassCard>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Transaction' : 'Add Transaction'}>
        <form onSubmit={e => { e.preventDefault(); handleSave() }} className="space-y-4">
          {/* Type Toggle */}
          <div className="flex p-1 rounded-lg bg-[hsl(var(--bg-elevated))]">
            <button type="button" onClick={() => updateForm({ type: 'expense', category_id: '' })}
              className={cn("flex-1 py-2 rounded-md text-sm font-medium transition-all",
                form.type === 'expense' ? "bg-rose-500/20 text-rose-400" : "text-[hsl(var(--text-secondary))]"
              )}>↓ Expense</button>
            <button type="button" onClick={() => updateForm({ type: 'income', category_id: '' })}
              className={cn("flex-1 py-2 rounded-md text-sm font-medium transition-all",
                form.type === 'income' ? "bg-emerald-500/20 text-emerald-400" : "text-[hsl(var(--text-secondary))]"
              )}>↑ Income</button>
          </div>

          {/* Amount + Currency */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelCls}>Amount *</label>
              <input type="number" step="0.01" min="0" required placeholder="0.00" value={form.amount}
                onChange={e => updateForm({ amount: e.target.value, amount_mxn: form.currency === 'MXN' ? e.target.value : form.amount_mxn })}
                className={cn(inputCls, "text-lg font-semibold")} />
            </div>
            <div className="w-20">
              <label className={labelCls}>Currency</label>
              <select value={form.currency} onChange={e => updateForm({ currency: e.target.value })} className={inputCls}>
                <option>MXN</option><option>USD</option>
              </select>
            </div>
          </div>

          {form.currency === 'USD' && (
            <div>
              <label className={labelCls}>Amount in MXN *</label>
              <input type="number" step="0.01" required placeholder="Converted amount" value={form.amount_mxn}
                onChange={e => updateForm({ amount_mxn: e.target.value })} className={inputCls} />
            </div>
          )}

          {/* Category Grid */}
          <div>
            <label className={labelCls}>Category *</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 sm:max-h-40 overflow-y-auto">
              {filteredCats.map(cat => (
                <button key={cat.id} type="button" onClick={() => updateForm({ category_id: cat.id })}
                  className={cn("flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all",
                    form.category_id === cat.id ? "border-blue-500 bg-blue-500/10" : "border-[hsl(var(--border))] hover:bg-[hsl(var(--bg-elevated))]"
                  )}>
                  <span className="text-lg">{cat.icon}</span>
                  <span className="truncate w-full text-center">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Merchant with datalist */}
          <div>
            <label className={labelCls}>Merchant</label>
            <input type="text" list="merchants" placeholder="e.g., Walmart, Uber..." value={form.merchant}
              onChange={e => updateForm({ merchant: e.target.value })} className={inputCls} />
            <datalist id="merchants">
              {knownMerchants.map(m => <option key={m} value={m} />)}
            </datalist>
          </div>

          {/* Date */}
          <div>
            <label className={labelCls}>Date *</label>
            <input type="date" required value={form.transaction_date}
              onChange={e => updateForm({ transaction_date: e.target.value })} className={inputCls} />
          </div>

          {/* More Options */}
          <details>
            <summary className="text-xs text-[hsl(var(--text-secondary))] cursor-pointer">More options</summary>
            <div className="mt-2 space-y-3">
              <textarea placeholder="Notes..." rows={2} value={form.description}
                onChange={e => updateForm({ description: e.target.value })} className={inputCls} />
              <input placeholder="Tags (comma-separated)" value={form.tags}
                onChange={e => updateForm({ tags: e.target.value })} className={inputCls} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_recurring}
                  onChange={e => updateForm({ is_recurring: e.target.checked })} className="rounded" />
                Recurring transaction
              </label>
            </div>
          </details>

          <button type="submit" disabled={saving || !form.amount || !form.category_id}
            className={cn("w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50",
              form.type === 'expense' ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
            )}>
            {saving ? 'Saving...' : editingId ? 'Update Transaction' : form.type === 'expense' ? 'Log Expense' : 'Log Income'}
          </button>
        </form>
      </Modal>
    </div>
    </PageTransition>
  )
}
