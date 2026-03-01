'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Plus, Pencil, Trash2, Upload, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'
import { enrichTransactions, DEFAULT_CATEGORIES, suggestCoveragePeriod, CYCLE_LABELS } from '@/lib/finance-utils'
import { parseBBVAPdf, detectBankFormat, type ParsedTransaction } from '@/lib/pdf-parser'
import { OWNERS, getOwnerName, getOwnerColor } from '@/lib/owners'
import { OwnerDot } from '@/components/finance/owner-dot'

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
  coverage_start: string
  coverage_end: string
  owner: string
}

const emptyForm: TxForm = { type: 'expense', amount: '', currency: 'MXN', amount_mxn: '', category_id: '', merchant: '', description: '', transaction_date: today(), tags: '', is_recurring: false, coverage_start: '', coverage_end: '', owner: '' }

export default function TransactionsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [typeFilter, setTypeFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Current user owner
  const [defaultOwner, setDefaultOwner] = useState('')
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setDefaultOwner(getOwnerName(data.user?.email ?? undefined))
    })
  }, [])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TxForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // CSV Import
  const [importOpen, setImportOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null)
  const [pdfRows, setPdfRows] = useState<ParsedTransaction[]>([])
  const [importMode, setImportMode] = useState<'csv' | 'pdf' | null>(null)
  const [pdfParsing, setPdfParsing] = useState(false)

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
      if (ownerFilter !== 'all' && (t.owner || '') !== ownerFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!(t.merchant?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.category?.name.toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [transactions, typeFilter, categoryFilter, ownerFilter, search])

  const totalPages = Math.ceil(filtered.length / perPage)
  const paginated = filtered.slice((page - 1) * perPage, page * perPage)

  // Open modal for add
  const openAdd = () => {
    setEditingId(null)
    setForm({ ...emptyForm, owner: defaultOwner })
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
      coverage_start: tx.coverage_start || '',
      coverage_end: tx.coverage_end || '',
      owner: tx.owner || defaultOwner,
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

    const record: Record<string, unknown> = {
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
      owner: form.owner || null,
    }
    // Coverage period for arrears billing
    if (form.coverage_start) record.coverage_start = form.coverage_start
    if (form.coverage_end) record.coverage_end = form.coverage_end

    if (editingId) {
      const { error } = await supabase.from('finance_transactions').update(record).eq('id', editingId)
      if (error) { console.error('Update error:', error); alert(`Save failed: ${error.message}`); setSaving(false); return }
    } else {
      const { error } = await supabase.from('finance_transactions').insert(record)
      if (error) { console.error('Insert error:', error); alert(`Save failed: ${error.message}`); setSaving(false); return }
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

  // ── CSV Import ──────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // PDF handling
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      setPdfParsing(true)
      try {
        const bank = await detectBankFormat(file)
        if (bank === 'bbva') {
          const rows = await parseBBVAPdf(file)
          setPdfRows(rows)
          setImportMode('pdf')
        } else {
          // Unknown bank — still try BBVA parser as fallback
          const rows = await parseBBVAPdf(file)
          if (rows.length > 0) {
            setPdfRows(rows)
            setImportMode('pdf')
          } else {
            alert('No se pudieron extraer transacciones de este PDF. Intenta con CSV.')
          }
        }
      } catch {
        alert('Error al leer el PDF. Intenta con CSV.')
      }
      setPdfParsing(false)
      return
    }

    // CSV handling
    setImportMode('csv')
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target?.result as string
      if (!text) return
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) return
      // Parse headers
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
      setCsvHeaders(headers)
      // Parse rows
      const rows = lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^,]+)/g)?.map(v => v.trim().replace(/^"|"$/g, '')) || []
        const row: Record<string, string> = {}
        headers.forEach((h, i) => { row[h] = vals[i] || '' })
        return row
      })
      setCsvRows(rows)
      // Auto-map common column names
      const autoMap: Record<string, string> = {}
      const lower = headers.map(h => h.toLowerCase())
      if (lower.some(h => h.includes('date') || h.includes('fecha'))) autoMap.date = headers[lower.findIndex(h => h.includes('date') || h.includes('fecha'))]
      if (lower.some(h => h.includes('amount') || h.includes('monto') || h.includes('cargo') || h.includes('importe'))) autoMap.amount = headers[lower.findIndex(h => h.includes('amount') || h.includes('monto') || h.includes('cargo') || h.includes('importe'))]
      if (lower.some(h => h.includes('description') || h.includes('descripcion') || h.includes('concepto'))) autoMap.description = headers[lower.findIndex(h => h.includes('description') || h.includes('descripcion') || h.includes('concepto'))]
      if (lower.some(h => h.includes('merchant') || h.includes('comercio'))) autoMap.merchant = headers[lower.findIndex(h => h.includes('merchant') || h.includes('comercio'))]
      setColumnMap(autoMap)
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!columnMap.date || !columnMap.amount || csvRows.length === 0) return
    setImporting(true)
    let success = 0, errors = 0
    const batch = csvRows.map(row => {
      const rawAmt = parseFloat(row[columnMap.amount]?.replace(/[$,]/g, '') || '0')
      const amt = Math.abs(rawAmt)
      const isExpense = rawAmt < 0 || row[columnMap.amount]?.includes('-')
      const dateStr = row[columnMap.date] || ''
      // Try to parse date (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY)
      let txDate = dateStr
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/')
        if (parts[2]?.length === 4) txDate = `${parts[2]}-${parts[1]?.padStart(2, '0')}-${parts[0]?.padStart(2, '0')}`
      }
      return {
        type: isExpense ? 'expense' : 'income',
        amount: amt,
        currency: 'MXN',
        amount_mxn: amt,
        category_id: categories.find(c => c.name === 'Other' || c.name === 'Other Income')?.id || categories[0]?.id,
        merchant: columnMap.merchant ? (row[columnMap.merchant] || null) : null,
        description: columnMap.description ? (row[columnMap.description] || null) : null,
        transaction_date: txDate,
        tags: [],
        is_recurring: false,
      }
    }).filter(r => r.amount > 0 && r.transaction_date)

    // Insert in batches of 50
    for (let i = 0; i < batch.length; i += 50) {
      const chunk = batch.slice(i, i + 50)
      const { error } = await supabase.from('finance_transactions').insert(chunk)
      if (error) { console.error('CSV import error:', error); errors += chunk.length }
      else success += chunk.length
    }

    setImporting(false)
    setImportResult({ success, errors })
    if (success > 0) fetchData()
  }

  // ── PDF Import ──────────────────────────────────
  const handlePdfImport = async () => {
    if (pdfRows.length === 0) return
    setImporting(true)
    let success = 0, errors = 0

    const batch = pdfRows.map(row => ({
      type: row.type,
      amount: row.amount,
      currency: 'MXN',
      amount_mxn: row.amount,
      category_id: categories.find(c => c.name === 'Other' || c.name === 'Other Income')?.id || categories[0]?.id,
      merchant: row.merchant,
      description: row.description,
      transaction_date: row.date,
      tags: [],
      is_recurring: false,
    }))

    for (let i = 0; i < batch.length; i += 50) {
      const chunk = batch.slice(i, i + 50)
      const { error } = await supabase.from('finance_transactions').insert(chunk)
      if (error) errors += chunk.length
      else success += chunk.length
    }

    setImporting(false)
    setImportResult({ success, errors })
    if (success > 0) fetchData()
  }

  // ── CSV Export ──────────────────────────────────
  const exportCsv = () => {
    const header = 'Date,Type,Amount,Currency,Amount MXN,Category,Merchant,Description'
    const rows = transactions.map(t =>
      `${t.transaction_date},${t.type},${t.amount},${t.currency},${t.amount_mxn},"${t.category?.name || ''}","${t.merchant || ''}","${t.description || ''}"`
    )
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `transactions-${today()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

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
        <div className="flex items-center gap-2">
          <button onClick={() => { setImportOpen(true); setImportResult(null); setCsvRows([]); setCsvHeaders([]); setPdfRows([]); setImportMode(null) }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--bg-elevated))] text-sm font-medium transition-colors">
            <Upload className="h-4 w-4" /> Import CSV
          </button>
          <button onClick={exportCsv}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--bg-elevated))] text-sm transition-colors">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
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
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[hsl(var(--bg-elevated))]">
          {['all', ...OWNERS].map(o => (
            <button key={o} onClick={() => { setOwnerFilter(o); setPage(1) }}
              className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                ownerFilter === o ? "bg-blue-600 text-white" : "text-[hsl(var(--text-secondary))]"
              )}>
              {o === 'all' ? 'All' : o}
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
                    {['Date', 'Merchant', 'Amount', 'Category', 'Owner', '', ''].map((h, i) => (
                      <th key={i} className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(tx => (
                    <tr key={tx.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors group">
                      <td className="py-3 px-4 text-sm text-[hsl(var(--text-secondary))]">{tx.transaction_date.slice(5)}</td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          {tx.merchant || '—'}
                          {(tx.source === 'recurring_income' || tx.tags?.includes('auto-income')) && (
                            <span title="Auto-registered recurring income" className="text-emerald-400 text-xs">🔁</span>
                          )}
                        </p>
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
                      <td className="py-3 px-4"><OwnerDot owner={tx.owner} showLabel /></td>
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
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))]">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center text-sm shrink-0"
                    style={{ background: `${tx.category?.color || '#6B7280'}20` }}
                    onClick={() => openEdit(tx)}>
                    {tx.category?.icon || '📦'}
                  </div>
                  <div className="flex-1 min-w-0" onClick={() => openEdit(tx)}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate flex items-center gap-1">
                        {tx.merchant || '—'}
                        {(tx.source === 'recurring_income' || tx.tags?.includes('auto-income')) && (
                          <span title="Auto-registered" className="text-emerald-400 text-xs">🔁</span>
                        )}
                      </p>
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
                      <OwnerDot owner={tx.owner} size="md" showLabel />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => openEdit(tx)} className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-400 transition-colors" title="Edit">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteConfirm(tx.id)} className="p-2 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
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

          {/* Owner */}
          <div>
            <label className="text-xs font-medium text-[hsl(var(--text-secondary))] mb-1 block">Owner</label>
            <div className="flex gap-2">
              {OWNERS.map(name => (
                <button key={name} type="button" onClick={() => updateForm({ owner: name })}
                  className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all border",
                    form.owner === name
                      ? "border-blue-500 bg-blue-500/10 text-blue-400"
                      : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--bg-elevated))]"
                  )}>
                  <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: getOwnerColor(name) }} />
                  {name}
                </button>
              ))}
            </div>
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

          {/* Coverage period for non-monthly billing cycles */}
          {(() => {
            const selectedCat = categories.find(c => c.id === form.category_id)
            const cycle = selectedCat?.billing_cycle
            if (!cycle || cycle === 'monthly') return null
            return (
              <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-400">📅 Period Covered ({CYCLE_LABELS[cycle]})</span>
                  <button type="button" onClick={() => {
                    if (form.transaction_date) {
                      const suggestion = suggestCoveragePeriod(form.transaction_date, cycle)
                      updateForm({ coverage_start: suggestion.start, coverage_end: suggestion.end })
                    }
                  }} className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
                    Auto-suggest →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Coverage Start</label>
                    <input type="date" value={form.coverage_start} onChange={e => updateForm({ coverage_start: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Coverage End</label>
                    <input type="date" value={form.coverage_end} onChange={e => updateForm({ coverage_end: e.target.value })} className={inputCls} />
                  </div>
                </div>
                {form.coverage_start && form.coverage_end && form.amount && (() => {
                  // Parse as local date parts to avoid timezone shift (YYYY-MM-DD → UTC midnight → previous day in negative UTC offsets)
                  const [sy, sm] = form.coverage_start.split('-').map(Number)
                  const [ey, em] = form.coverage_end.split('-').map(Number)
                  const covMonths = Math.max(1, (ey - sy) * 12 + (em - sm) + 1)
                  const perMonth = parseFloat(form.amount) / covMonths
                  return <p className="text-xs text-blue-400/70">→ ${perMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo across {covMonths} months</p>
                })()}
              </div>
            )
          })()}

          <button type="submit" disabled={saving || !form.amount || !form.category_id}
            className={cn("w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50",
              form.type === 'expense' ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
            )}>
            {saving ? 'Saving...' : editingId ? 'Update Transaction' : form.type === 'expense' ? 'Log Expense' : 'Log Income'}
          </button>
        </form>
      </Modal>
      {/* CSV Import Modal */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import Transactions">
        {pdfParsing ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[hsl(var(--text-secondary))]">Leyendo PDF de BBVA...</p>
          </div>
        ) : !csvHeaders.length && !pdfRows.length ? (
          <div className="space-y-4">
            <p className="text-sm text-[hsl(var(--text-secondary))]">
              Upload a <strong>PDF statement</strong> or <strong>CSV file</strong> from your bank.
              BBVA PDF statements are auto-detected. CSV supports any bank with column mapping.
            </p>
            <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-[hsl(var(--border))] rounded-xl cursor-pointer hover:border-blue-500 transition-colors">
              <Upload className="h-8 w-8 text-[hsl(var(--text-secondary))]" />
              <span className="text-sm font-medium">Choose PDF or CSV file</span>
              <span className="text-xs text-[hsl(var(--text-secondary))]">BBVA, Banorte, and more</span>
              <input type="file" accept=".csv,.pdf" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        ) : importResult ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-sm font-medium text-emerald-400">✅ {importResult.success} transactions imported</p>
              {importResult.errors > 0 && <p className="text-sm text-rose-400 mt-1">⚠️ {importResult.errors} failed</p>}
            </div>
            <button onClick={() => setImportOpen(false)}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">
              Done
            </button>
          </div>
        ) : importMode === 'pdf' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span className="text-blue-400 text-sm font-medium">🏦 BBVA detected</span>
              <span className="text-xs text-[hsl(var(--text-secondary))]">— {pdfRows.length} transactions found</span>
            </div>
            {/* Preview */}
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
              <table className="w-full text-xs">
                <thead><tr className="bg-[hsl(var(--bg-elevated))]">
                  <th className="px-2 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Description</th>
                  <th className="px-2 py-1 text-right">Amount</th>
                  <th className="px-2 py-1 text-center">Type</th>
                </tr></thead>
                <tbody>
                  {pdfRows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="border-t border-[hsl(var(--border))]">
                      <td className="px-2 py-1">{row.date}</td>
                      <td className="px-2 py-1 max-w-[200px] truncate">{row.description}</td>
                      <td className={cn("px-2 py-1 text-right font-mono", row.type === 'expense' ? 'text-rose-400' : 'text-emerald-400')}>
                        ${row.amount.toLocaleString('en', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", row.type === 'expense' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400')}>
                          {row.type === 'expense' ? 'Cargo' : 'Abono'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {pdfRows.length > 8 && (
                    <tr className="border-t border-[hsl(var(--border))]">
                      <td colSpan={4} className="px-2 py-1 text-center text-[hsl(var(--text-secondary))] text-xs">
                        ...and {pdfRows.length - 8} more
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPdfRows([]); setImportMode(null) }}
                className="flex-1 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--bg-elevated))]">
                Back
              </button>
              <button onClick={handlePdfImport} disabled={importing}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
                {importing ? 'Importing...' : `Import ${pdfRows.length} transactions`}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[hsl(var(--text-secondary))]">
              Found <strong>{csvRows.length}</strong> rows. Map your columns:
            </p>
            {(['date', 'amount', 'description', 'merchant'] as const).map(field => (
              <div key={field} className="flex items-center gap-3">
                <span className="text-sm font-medium w-24 capitalize">{field}{field === 'date' || field === 'amount' ? ' *' : ''}</span>
                <select value={columnMap[field] || ''} onChange={e => setColumnMap(m => ({ ...m, [field]: e.target.value }))}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[hsl(var(--bg-elevated))] text-sm border border-[hsl(var(--border))]">
                  <option value="">— skip —</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
            {/* Preview */}
            {csvRows.length > 0 && columnMap.date && columnMap.amount && (
              <div className="mt-3">
                <p className="text-xs text-[hsl(var(--text-secondary))] mb-2">Preview (first 5 rows):</p>
                <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-[hsl(var(--bg-elevated))]">
                      <th className="px-2 py-1 text-left">Date</th>
                      <th className="px-2 py-1 text-right">Amount</th>
                      <th className="px-2 py-1 text-left">Description</th>
                    </tr></thead>
                    <tbody>
                      {csvRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-[hsl(var(--border))]">
                          <td className="px-2 py-1">{row[columnMap.date]}</td>
                          <td className="px-2 py-1 text-right">{row[columnMap.amount]}</td>
                          <td className="px-2 py-1">{columnMap.description ? row[columnMap.description] : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => { setCsvHeaders([]); setCsvRows([]) }}
                className="flex-1 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--bg-elevated))]">
                Back
              </button>
              <button onClick={handleImport} disabled={importing || !columnMap.date || !columnMap.amount}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
                {importing ? 'Importing...' : `Import ${csvRows.length} rows`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
    </PageTransition>
  )
}
