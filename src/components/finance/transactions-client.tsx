'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Search, Plus, Pencil, Trash2, Upload, Download, Sparkles, AlertTriangle, Check, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
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
import { applyRules, detectDuplicates, type FinanceRule } from '@/lib/finance-rules'

import { inputCls } from '@/lib/form-style'
import { localDateKey, prioritizeCategories, recentMerchantSuggestions, relativeLocalDateKey } from '@/lib/transaction-entry'

const labelCls = "text-xs text-[hsl(var(--text-secondary))] mb-1 block"

const QUICK_TAGS: { value: string; label: string }[] = [
  { value: 'fertility', label: '🧬 Fertility' },
]

function parseTagString(s: string): string[] {
  return s.split(',').map(t => t.trim()).filter(Boolean)
}
function serializeTags(tags: string[]): string {
  return tags.join(', ')
}

function today() { return localDateKey() }

function notifyWolff(body: Record<string, unknown>) {
  fetch('/api/finance/wolff-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: crypto.randomUUID(), ...body }),
  }).catch(() => {})
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i++
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values.map(v => v.replace(/^"|"$/g, ''))
}

function parseImportAmount(value: string): { amount: number; isExpense: boolean } {
  const raw = value.trim()
  const isParenthesized = raw.startsWith('(') && raw.endsWith(')')
  const normalized = raw
    .replace(/[,$\s]/g, '')
    .replace(/[()]/g, '')
  const parsed = parseFloat(normalized)
  const amount = Math.abs(Number.isFinite(parsed) ? parsed : 0)
  return { amount, isExpense: isParenthesized || raw.includes('-') || parsed < 0 }
}

function parseImportDate(value: string): string {
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split(/[/-]/).map(p => p.trim())
  if (parts.length !== 3) return raw

  if (parts[0].length === 4) {
    const [y, m, d] = parts
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const [a, b, y] = parts
  if (y.length !== 4) return raw
  // Mexican bank exports are usually DD/MM/YYYY. If the first segment is >12,
  // it is definitely a day; otherwise prefer DD/MM to avoid US-date drift.
  const day = a
  const month = b
  return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

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
  const [saveError, setSaveError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const savedMessageTimer = useRef<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Auto-categorization rules + duplicate detection
  const [rules, setRules] = useState<FinanceRule[]>([])
  const [appliedRuleId, setAppliedRuleId] = useState<string | null>(null)
  const [confirmDuplicate, setConfirmDuplicate] = useState(false)

  // CSV Import
  const [importOpen, setImportOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [columnMap, setColumnMap] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ success: number; errors: number; skipped: number } | null>(null)
  const [pdfRows, setPdfRows] = useState<ParsedTransaction[]>([])
  const [importMode, setImportMode] = useState<'csv' | 'pdf' | null>(null)
  const [pdfParsing, setPdfParsing] = useState(false)

  const perPage = 25

  const fetchData = useCallback(async () => {
    const [catRes, txRes] = await Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      fetchAllRows<FinanceTransaction>((from, to) => supabase.from('finance_transactions').select('*').order('transaction_date', { ascending: false }).range(from, to)).then(rows => ({ data: rows })),
    ])
    
    
    const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
    const txs = txRes.data || []
    setCategories(cats)
    setTransactions(enrichTransactions(txs, cats))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(); const h = () => { if (document.visibilityState === "visible") fetchData() }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h) }, [fetchData])

  // Fetch auto-categorization rules
  useEffect(() => {
    fetch('/api/finance/rules')
      .then(r => r.ok ? r.json() : { rules: [] })
      .then(d => setRules(d.rules || []))
      .catch(() => setRules([]))
  }, [])

  // Auto-apply rule when merchant + amount are set and category is empty (or only when adding)
  useEffect(() => {
    if (!modalOpen || editingId) return
    if (form.category_id) return
    if (!form.merchant || !form.amount) return
    const amt = parseFloat(form.amount)
    if (!Number.isFinite(amt)) return
    const match = applyRules(rules, { merchant: form.merchant, amount_mxn: amt, owner: form.owner })
    if (match) {
      setForm(f => ({ ...f, category_id: match.category_id }))
      setAppliedRuleId(match.rule_id)
    }
  }, [form.merchant, form.amount, form.owner, rules, modalOpen, editingId, form.category_id])

  // Reset applied rule when modal closes
  useEffect(() => {
    if (!modalOpen) { setAppliedRuleId(null); setConfirmDuplicate(false) }
  }, [modalOpen])

  // Duplicate detection — same merchant + amount within 3 days
  const possibleDuplicates = useMemo(() => {
    if (!modalOpen || editingId) return []
    if (!form.merchant || !form.amount || !form.transaction_date) return []
    const amt = parseFloat(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) return []
    return detectDuplicates(
      { transaction_date: form.transaction_date, merchant: form.merchant, amount_mxn: amt },
      transactions.map(t => ({ id: t.id, transaction_date: t.transaction_date, merchant: t.merchant, amount_mxn: t.amount_mxn })),
    )
  }, [form.merchant, form.amount, form.transaction_date, transactions, modalOpen, editingId])

  const merchantSuggestions = useMemo(
    () => recentMerchantSuggestions(transactions, form.type),
    [transactions, form.type],
  )

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
  const openAdd = useCallback(() => {
    setEditingId(null)
    setForm({ ...emptyForm, owner: defaultOwner })
    setSaveError('')
    setSavedMessage('')
    if (savedMessageTimer.current) window.clearTimeout(savedMessageTimer.current)
    setModalOpen(true)
  }, [defaultOwner])

  useEffect(() => () => {
    if (savedMessageTimer.current) window.clearTimeout(savedMessageTimer.current)
  }, [])

  useEffect(() => {
    if (modalOpen && !editingId && defaultOwner) {
      setForm(current => current.owner ? current : { ...current, owner: defaultOwner })
    }
  }, [defaultOwner, editingId, modalOpen])

  // Auto-open the add sheet when arriving via the mobile FAB (?add=1),
  // then strip the param so back/refresh doesn't reopen it.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('add') === '1') {
      openAdd()
      params.delete('add')
      const qs = params.toString()
      window.history.replaceState(null, '', `/finance/transactions${qs ? `?${qs}` : ''}`)
    }
  }, [openAdd])

  // Open modal for edit
  const openEdit = (tx: FinanceTransaction) => {
    setEditingId(tx.id)
    setSaveError('')
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
    setSaveError('')
    const amt = parseFloat(form.amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setSaveError('Enter an amount greater than zero.')
      return
    }
    if (!form.transaction_date) {
      setSaveError('Choose a transaction date.')
      return
    }
    if (!form.category_id) {
      setSaveError('Choose a category.')
      return
    }
    if (form.currency === 'USD' && (!form.amount_mxn || parseFloat(form.amount_mxn) <= 0)) {
      setSaveError('Enter the converted amount in MXN.')
      return
    }
    if (possibleDuplicates.length > 0 && !confirmDuplicate && !editingId) {
      setConfirmDuplicate(true)
      return
    }
    setSaving(true)

    const amtMxn = form.currency === 'USD' && form.amount_mxn ? parseFloat(form.amount_mxn) : amt
    const tags = form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : []

    const record: Record<string, unknown> = {
      type: form.type,
      amount: amt,
      currency: form.currency,
      amount_mxn: amtMxn,
      category_id: form.category_id || null,
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
      if (error) { console.error('Update error:', error); setSaveError(`Could not save: ${error.message}`); setSaving(false); return }
      notifyWolff({
        kind: 'updated',
        type: form.type,
        amount_mxn: amtMxn,
        category_id: form.category_id || null,
        category_name: categories.find(category => category.id === form.category_id)?.name || null,
        merchant: form.merchant || null,
        transaction_date: form.transaction_date,
        is_recurring: form.is_recurring,
      })
    } else {
      const { error } = await supabase.from('finance_transactions').insert(record)
      if (error) { console.error('Insert error:', error); setSaveError(`Could not save: ${error.message}`); setSaving(false); return }
      notifyWolff({
        kind: 'created',
        type: form.type,
        amount_mxn: amtMxn,
        category_id: form.category_id || null,
        category_name: categories.find(category => category.id === form.category_id)?.name || null,
        merchant: form.merchant || null,
        transaction_date: form.transaction_date,
        is_recurring: form.is_recurring,
      })
      // Increment match_count on the auto-applied rule (fire & forget)
      if (appliedRuleId) {
        const rule = rules.find(r => r.id === appliedRuleId)
        if (rule) {
          fetch('/api/finance/rules', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: appliedRuleId, match_count: rule.match_count + 1, last_matched_at: new Date().toISOString() }),
          }).catch(() => {})
        }
      }
    }

    setModalOpen(false)
    setSaving(false)
    setSavedMessage(`${form.type === 'expense' ? 'Expense' : 'Income'} saved`)
    if (savedMessageTimer.current) window.clearTimeout(savedMessageTimer.current)
    savedMessageTimer.current = window.setTimeout(() => setSavedMessage(''), 4500)
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
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) return
      // Parse headers
      const headers = parseCsvLine(lines[0])
      setCsvHeaders(headers)
      // Parse rows
      const rows = lines.slice(1).map(line => {
        const vals = parseCsvLine(line)
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
    let success = 0, errors = 0, skipped = 0
    const batch = csvRows.map(row => {
      const { amount, isExpense } = parseImportAmount(row[columnMap.amount] || '0')
      const txDate = parseImportDate(row[columnMap.date] || '')
      const merchant = columnMap.merchant ? (row[columnMap.merchant] || null) : null
      const description = columnMap.description ? (row[columnMap.description] || null) : null
      const ruleMatch = applyRules(rules, {
        merchant: merchant || description,
        amount_mxn: amount,
        owner: defaultOwner,
      })
      const fallbackCategory = categories.find(c => c.name === (isExpense ? 'Other' : 'Other Income'))?.id || categories[0]?.id
      return {
        type: isExpense ? 'expense' : 'income',
        amount,
        currency: 'MXN',
        amount_mxn: amount,
        category_id: ruleMatch?.category_id || fallbackCategory,
        merchant,
        description,
        transaction_date: txDate,
        tags: ruleMatch?.tags || [],
        is_recurring: false,
        owner: defaultOwner || null,
      }
    }).filter(r => {
      if (r.amount <= 0 || !r.transaction_date) {
        skipped++
        return false
      }
      const duplicates = detectDuplicates(
        { transaction_date: r.transaction_date, merchant: r.merchant || r.description, amount_mxn: r.amount_mxn },
        transactions.map(t => ({ id: t.id, transaction_date: t.transaction_date, merchant: t.merchant || t.description, amount_mxn: t.amount_mxn })),
      )
      if (duplicates.length > 0) {
        skipped++
        return false
      }
      return true
    })

    // Insert in batches of 50
    for (let i = 0; i < batch.length; i += 50) {
      const chunk = batch.slice(i, i + 50)
      const { error } = await supabase.from('finance_transactions').insert(chunk)
      if (error) { console.error('CSV import error:', error); errors += chunk.length }
      else success += chunk.length
    }

    setImporting(false)
    setImportResult({ success, errors, skipped })
    if (success > 0) {
      const importedExpenses = batch.filter(row => row.type === 'expense')
      notifyWolff({
        kind: 'imported',
        type: 'expense',
        import_count: importedExpenses.length,
        import_total: importedExpenses.reduce((sum, row) => sum + row.amount_mxn, 0),
      })
      fetchData()
    }
  }

  // ── PDF Import ──────────────────────────────────
  const handlePdfImport = async () => {
    if (pdfRows.length === 0) return
    setImporting(true)
    let success = 0, errors = 0, skipped = 0

    const batch = pdfRows.map(row => {
      const ruleMatch = applyRules(rules, {
        merchant: row.merchant || row.description,
        amount_mxn: row.amount,
        owner: defaultOwner,
      })
      const fallbackCategory = categories.find(c => c.name === (row.type === 'expense' ? 'Other' : 'Other Income'))?.id || categories[0]?.id
      return {
        type: row.type,
        amount: row.amount,
        currency: 'MXN',
        amount_mxn: row.amount,
        category_id: ruleMatch?.category_id || fallbackCategory,
        merchant: row.merchant,
        description: row.description,
        transaction_date: row.date,
        tags: ruleMatch?.tags || [],
        is_recurring: false,
        owner: defaultOwner || null,
      }
    }).filter(r => {
      const duplicates = detectDuplicates(
        { transaction_date: r.transaction_date, merchant: r.merchant || r.description, amount_mxn: r.amount_mxn },
        transactions.map(t => ({ id: t.id, transaction_date: t.transaction_date, merchant: t.merchant || t.description, amount_mxn: t.amount_mxn })),
      )
      if (duplicates.length > 0) {
        skipped++
        return false
      }
      return true
    })

    for (let i = 0; i < batch.length; i += 50) {
      const chunk = batch.slice(i, i + 50)
      const { error } = await supabase.from('finance_transactions').insert(chunk)
      if (error) errors += chunk.length
      else success += chunk.length
    }

    setImporting(false)
    setImportResult({ success, errors, skipped })
    if (success > 0) {
      const importedExpenses = batch.filter(row => row.type === 'expense')
      notifyWolff({
        kind: 'imported',
        type: 'expense',
        import_count: importedExpenses.length,
        import_total: importedExpenses.reduce((sum, row) => sum + row.amount_mxn, 0),
      })
      fetchData()
    }
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

  const filteredCats = useMemo(
    () => prioritizeCategories(categories, transactions, form.type),
    [categories, transactions, form.type],
  )

  const periodSummary = useMemo(() => {
    const now = new Date()
    const todayKey = localDateKey(now)
    const monthKey = todayKey.slice(0, 7)
    const weekday = now.getDay() || 7
    const weekStart = relativeLocalDateKey(-(weekday - 1), now)
    const expenses = transactions.filter(transaction => transaction.type === 'expense')
    const sumFrom = (start: string) => expenses
      .filter(transaction => transaction.transaction_date >= start && transaction.transaction_date <= todayKey)
      .reduce((sum, transaction) => sum + transaction.amount_mxn, 0)
    return {
      today: sumFrom(todayKey),
      week: sumFrom(weekStart),
      month: expenses.filter(transaction => transaction.transaction_date.startsWith(monthKey))
        .reduce((sum, transaction) => sum + transaction.amount_mxn, 0),
    }
  }, [transactions])

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold tracking-tight"><span className="section-tick" aria-hidden />Transactions</h1>
          <p className="text-[hsl(var(--text-secondary))]">Capture spending fast. Keep every peso accountable.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setImportOpen(true); setImportResult(null); setCsvRows([]); setCsvHeaders([]); setPdfRows([]); setImportMode(null) }}
            aria-label="Import transactions"
            className="flex h-11 items-center gap-2 rounded-xl border border-[hsl(var(--border))] px-3 hover:bg-[hsl(var(--bg-elevated))] text-sm font-medium transition-colors sm:h-auto sm:px-4 sm:py-2">
            <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Import</span>
          </button>
          <button onClick={exportCsv}
            aria-label="Export transactions"
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--bg-elevated))] text-sm transition-colors">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={openAdd}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 transition-colors hover:bg-emerald-500 sm:h-auto sm:flex-none sm:py-2">
            <Plus className="h-4 w-4" /> Add transaction
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))]">
        {[
          ['Today', periodSummary.today],
          ['This week', periodSummary.week],
          ['This month', periodSummary.month],
        ].map(([label, amount], index) => (
          <div key={label as string} className={cn('min-w-0 px-3 py-3 sm:px-4', index > 0 && 'border-l border-[hsl(var(--border))]')}>
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[hsl(var(--text-tertiary))]">{label}</p>
            <p className="mt-1 truncate text-sm font-bold tabular-nums text-rose-500 sm:text-lg">${(amount as number).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Filter Bar — search leads, controls wrap below (one row on desktop) */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 p-3 rounded-xl bg-[hsl(var(--background))]/90 backdrop-blur-sm border border-[hsl(var(--border))]">
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[hsl(var(--bg-elevated))]">
          <Search className="h-4 w-4 text-[hsl(var(--text-tertiary))] shrink-0" />
          <input placeholder="Search merchants, notes..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="bg-transparent text-base sm:text-sm flex-1 outline-none min-w-0" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[hsl(var(--bg-elevated))]">
            {['all', 'expense', 'income'].map(t => (
              <button key={t} onClick={() => { setTypeFilter(t); setPage(1) }}
                className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  typeFilter === t ? "bg-blue-600 text-white" : "text-[hsl(var(--text-secondary))]"
                )}>
                {t === 'all' ? 'All' : t === 'expense' ? '↓ Out' : '↑ In'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[hsl(var(--bg-elevated))]">
            {['all', ...OWNERS].map(o => (
              <button key={o} onClick={() => { setOwnerFilter(o); setPage(1) }}
                className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  ownerFilter === o ? "bg-blue-600 text-white" : "text-[hsl(var(--text-secondary))]"
                )}>
                {o === 'all' ? 'Both' : o}
              </button>
            ))}
          </div>
          <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] text-xs border-none outline-none flex-1 min-w-[130px]">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
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
                      <th key={i} className={cn("text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-2.5 px-4", h === 'Amount' ? "text-right" : "text-left")}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(tx => (
                    <tr key={tx.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors group">
                      <td className="py-2 px-4 text-sm text-[hsl(var(--text-secondary))] tabular-nums whitespace-nowrap">{tx.transaction_date.slice(5)}</td>
                      <td className="py-2 px-4">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          {tx.merchant || '—'}
                          {(tx.source === 'recurring_income' || tx.tags?.includes('auto-income')) && (
                            <span title="Auto-registered recurring income" className="text-emerald-600 text-xs">🔁</span>
                          )}
                        </p>
                        {tx.description && <p className="text-xs text-[hsl(var(--text-tertiary))] truncate max-w-[200px]">{tx.description}</p>}
                      </td>
                      <td className="py-2 px-4 text-right">
                        <span className={cn("text-sm font-semibold num-metric tabular-nums", tx.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                          {tx.type === 'income' ? '+' : '-'}${tx.amount_mxn.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px]"
                          style={{ background: `${tx.category?.color || '#6B7280'}20`, color: tx.category?.color }}>
                          {tx.category?.icon} {tx.category?.name}
                        </span>
                      </td>
                      <td className="py-2 px-4"><OwnerDot owner={tx.owner} showLabel /></td>
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
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
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
                <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))] hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors">
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
                          <span title="Auto-registered" className="text-emerald-600 text-xs">🔁</span>
                        )}
                      </p>
                      <span className={cn("text-sm font-semibold num-metric tabular-nums shrink-0 ml-2 text-right",
                        tx.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                        {tx.type === 'income' ? '+' : '-'}${tx.amount_mxn.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[hsl(var(--text-tertiary))] tabular-nums">{tx.transaction_date.slice(5)}</span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px]"
                        style={{ background: `${tx.category?.color}20`, color: tx.category?.color }}>
                        {tx.category?.name}
                      </span>
                      <OwnerDot owner={tx.owner} size="md" showLabel />
                    </div>
                  </div>
                  {deleteConfirm === tx.id ? (
                    <div className="flex shrink-0 flex-col gap-1" aria-label="Confirm deletion">
                      <button onClick={() => handleDelete(tx.id)} className="rounded-md bg-rose-600 px-2 py-1.5 text-[11px] font-semibold text-white">Delete</button>
                      <button onClick={() => setDeleteConfirm(null)} className="rounded-md px-2 py-1 text-[11px] text-[hsl(var(--text-secondary))]">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(tx.id)} aria-label={`Delete ${tx.merchant || 'transaction'}`} className="shrink-0 rounded-lg p-2 text-[hsl(var(--text-tertiary))] transition-colors hover:bg-rose-500/10 hover:text-rose-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
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

      {!modalOpen && !savedMessage && (
        <button onClick={openAdd} aria-label="Add transaction"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-12 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white shadow-xl shadow-black/40 sm:hidden">
          <Plus className="h-5 w-5" /> Add
        </button>
      )}

      {savedMessage && (
        <div role="status" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-[hsl(var(--bg-surface))] p-3 shadow-2xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-80">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400"><Check className="h-4 w-4" /></span>
          <span className="flex-1 text-sm font-semibold">{savedMessage}</span>
          <button onClick={openAdd} className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Add another</button>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => { if (!saving) setModalOpen(false) }}
        title={editingId ? 'Edit transaction' : 'New transaction'}
        mobileFullScreen
        className="transaction-entry-surface sm:h-auto sm:max-w-lg"
        bodyClassName="transaction-entry-body overflow-y-auto overscroll-contain p-3 sm:p-4"
        footer={
          <button type="submit" form="tx-form" disabled={saving || !form.amount || !form.category_id || !form.transaction_date}
            className={cn("w-full py-3 rounded-xl text-base font-semibold text-white transition-colors disabled:opacity-50",
              form.type === 'expense' ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"
            )}>
            {saving ? 'Saving…' : confirmDuplicate ? 'Save anyway' : editingId ? 'Update transaction' : form.type === 'expense' ? 'Save expense' : 'Save income'}
          </button>
        }
      >
        <form id="tx-form" onSubmit={e => { e.preventDefault(); handleSave() }} className="mobile-compact-form transaction-entry-form space-y-2.5 sm:space-y-4" noValidate>
          {saveError && (
            <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{saveError}</div>
          )}
          {/* Duplicate warning */}
          {possibleDuplicates.length > 0 && !editingId && (
            <div className={cn(
              "flex items-start gap-2 p-3 rounded-lg border text-xs",
              confirmDuplicate
                ? "bg-rose-500/10 border-rose-500/30 text-rose-700"
                : "bg-amber-500/5 border-amber-500/30 text-amber-700"
            )}>
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">
                  {confirmDuplicate ? 'Save anyway?' : 'Possible duplicate'}
                </p>
                <p className="opacity-90 mt-0.5 leading-relaxed">
                  {possibleDuplicates.length} matching transaction{possibleDuplicates.length > 1 ? 's' : ''} found:{' '}
                  {possibleDuplicates.slice(0, 2).map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ', '}
                      <strong>{d.merchant}</strong> ${d.amount_mxn.toLocaleString()} on {d.date}
                    </span>
                  ))}
                  {possibleDuplicates.length > 2 && ` +${possibleDuplicates.length - 2} more`}.
                  {confirmDuplicate && ' Click Save again to confirm.'}
                </p>
              </div>
            </div>
          )}

          {/* Type Toggle */}
          <div className="tx-type-toggle flex p-1 rounded-xl bg-[hsl(var(--bg-elevated))]">
            <button type="button" onClick={() => { updateForm({ type: 'expense', category_id: '' }); setAppliedRuleId(null); setConfirmDuplicate(false) }}
              className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                form.type === 'expense' ? "bg-rose-500/20 text-rose-600" : "text-[hsl(var(--text-secondary))]"
              )}>↓ Expense</button>
            <button type="button" onClick={() => { updateForm({ type: 'income', category_id: '' }); setAppliedRuleId(null); setConfirmDuplicate(false) }}
              className={cn("flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all",
                form.type === 'income' ? "bg-emerald-500/20 text-emerald-600" : "text-[hsl(var(--text-secondary))]"
              )}>↑ Income</button>
          </div>

          {/* Amount leads and opens the numeric keyboard immediately. */}
          <div className="tx-amount-field">
            <label htmlFor="transaction-amount" className={cn(labelCls, 'tx-label')}>Amount *</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-[hsl(var(--text-tertiary))]">$</span>
              <input id="transaction-amount" type="number" inputMode="decimal" step="0.01" min="0.01" required placeholder="0.00" value={form.amount}
                autoFocus={!editingId}
                onChange={e => { updateForm({ amount: e.target.value, amount_mxn: form.currency === 'MXN' ? e.target.value : form.amount_mxn }); setSaveError(''); setConfirmDuplicate(false) }}
                className={cn(inputCls, "num-metric h-14 appearance-none pl-8 text-2xl font-bold sm:h-16 sm:text-3xl [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none")} />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold tracking-wide text-[hsl(var(--text-tertiary))]">{form.currency}</span>
            </div>
          </div>

          {/* Merchant comes before category so history and rules can do the work. */}
          <div className="tx-merchant-field">
            <label htmlFor="transaction-merchant" className={cn(labelCls, 'tx-label')}>{form.type === 'expense' ? 'Where did you spend?' : 'Who paid you?'}</label>
            <input id="transaction-merchant" type="text" list="merchants" autoComplete="off" placeholder={form.type === 'expense' ? 'Merchant or place' : 'Income source'} value={form.merchant}
              onChange={e => { updateForm({ merchant: e.target.value, ...(appliedRuleId ? { category_id: '' } : {}) }); if (appliedRuleId) setAppliedRuleId(null); setConfirmDuplicate(false) }} className={cn(inputCls, 'h-11 sm:h-12')} />
            <datalist id="merchants">
              {knownMerchants.map(m => <option key={m} value={m} />)}
            </datalist>
            {!editingId && merchantSuggestions.length > 0 && (
              <div className="tx-recent-merchants mt-1.5 grid grid-cols-3 gap-1.5 sm:flex sm:gap-2" aria-label="Recent merchants">
                {merchantSuggestions.map((suggestion, index) => (
                  <button key={suggestion.merchant} type="button"
                    onClick={() => { updateForm({ merchant: suggestion.merchant, category_id: suggestion.categoryId }); setAppliedRuleId(null); setConfirmDuplicate(false) }}
                    title={suggestion.merchant}
                    className={cn("min-w-0 truncate rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--bg-elevated))] px-2 py-1.5 text-xs font-medium text-[hsl(var(--text-secondary))] transition-colors hover:border-emerald-500/50 hover:text-[hsl(var(--foreground))] sm:shrink-0 sm:rounded-full sm:px-3", index > 2 && 'hidden sm:block')}>
                    <span className="block truncate">{suggestion.merchant}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {appliedRuleId && (
            <div className="tx-auto-category flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-300">
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">Category selected automatically</span>
              <button type="button" onClick={() => { setAppliedRuleId(null); setForm(f => ({ ...f, category_id: '' })) }} className="font-semibold underline">Change</button>
            </div>
          )}

          {/* Compact native picker on mobile; visual grid remains on desktop. */}
          <div className="tx-category-field">
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="transaction-category" className={cn(labelCls, 'tx-label')}>Category *</label>
              <span className="tx-helper text-[10px] text-[hsl(var(--text-tertiary))]">Frequent first</span>
            </div>
            <select id="transaction-category" required value={form.category_id} onChange={e => updateForm({ category_id: e.target.value })}
              className={cn(inputCls, 'h-11 sm:hidden')}>
              <option value="">Choose category</option>
              {filteredCats.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
            </select>
            <div className="hidden max-h-48 grid-cols-5 gap-2 overflow-y-auto overscroll-contain pr-0.5 sm:grid">
              {filteredCats.map(cat => (
                <button key={cat.id} type="button" onClick={() => updateForm({ category_id: cat.id })}
                  aria-pressed={form.category_id === cat.id}
                  className={cn("flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-xl border py-2 text-[11px] leading-tight transition-all sm:min-h-[56px]",
                    form.category_id === cat.id ? "border-emerald-500 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "border-[hsl(var(--border))] hover:bg-[hsl(var(--bg-elevated))]"
                  )}>
                  <span className="text-xl">{cat.icon}</span>
                  <span className="truncate w-full text-center px-0.5">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="tx-date-owner grid grid-cols-[1.1fr_1fr] gap-3">
            <div>
              <div className="tx-date-label flex items-center justify-between">
                <label htmlFor="transaction-date" className={cn(labelCls, 'tx-label')}>Date *</label>
                <span className="tx-date-shortcuts flex gap-1.5 text-[10px]">
                  <button type="button" onClick={() => updateForm({ transaction_date: today() })} className="font-medium text-blue-400">Today</button>
                  <button type="button" onClick={() => updateForm({ transaction_date: relativeLocalDateKey(-1) })} className="font-medium text-blue-400">Yesterday</button>
                </span>
              </div>
              <input id="transaction-date" type="date" required value={form.transaction_date}
                max={today()} onChange={e => { updateForm({ transaction_date: e.target.value }); setConfirmDuplicate(false) }} className={inputCls} />
            </div>
            <div>
              <label className={cn(labelCls, 'tx-label')}>Owner</label>
            <div className="flex gap-2">
              {OWNERS.map(name => (
                <button key={name} type="button" onClick={() => updateForm({ owner: name })}
                    aria-pressed={form.owner === name}
                  className={cn("flex-1 truncate rounded-lg border px-1 py-2.5 text-xs font-medium transition-all",
                    form.owner === name
                      ? "border-blue-500 bg-blue-500/10 text-blue-300"
                      : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--bg-elevated))]"
                  )}>
                  <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: getOwnerColor(name) }} />
                  <span className="tx-owner-long">{name}</span>
                  <span className="tx-owner-short hidden" aria-hidden="true">{name.slice(0, 1)}</span>
                </button>
              ))}
            </div>
            </div>
          </div>

          {/* Every standard field stays visible without opening another section. */}
          <div className="tx-secondary-row grid grid-cols-[5.5rem_1fr] gap-2">
            <div>
              <label className={cn(labelCls, 'tx-label')}>Currency</label>
              <select value={form.currency} onChange={e => updateForm({ currency: e.target.value, amount_mxn: e.target.value === 'MXN' ? form.amount : '' })} className={cn(inputCls, 'h-10 px-2')}>
                <option>MXN</option><option>USD</option>
              </select>
            </div>
            <div>
              <label htmlFor="transaction-notes" className={cn(labelCls, 'tx-label')}>Notes</label>
              <input id="transaction-notes" placeholder="Optional note" value={form.description}
                onChange={e => updateForm({ description: e.target.value })} className={cn(inputCls, 'h-10')} />
            </div>
          </div>

          {form.currency === 'USD' && (
            <div>
              <label className={labelCls}>Amount in MXN *</label>
              <input type="number" inputMode="decimal" step="0.01" min="0.01" placeholder="Converted amount" value={form.amount_mxn}
                onChange={e => updateForm({ amount_mxn: e.target.value })} className={cn(inputCls, 'h-10')} />
            </div>
          )}

          <div className="tx-tags-row grid grid-cols-[1fr_auto] items-end gap-2">
            <div>
              <label htmlFor="transaction-tags" className={cn(labelCls, 'tx-label')}>Tags</label>
              <input id="transaction-tags" placeholder="Optional tags" value={form.tags}
                onChange={e => updateForm({ tags: e.target.value })} className={cn(inputCls, 'h-10')} />
            </div>
            <div className="flex h-10 items-center gap-3 rounded-lg border border-[hsl(var(--border))] px-3 text-xs text-[hsl(var(--text-secondary))]">
              {QUICK_TAGS.map(({ value, label }) => {
                const active = parseTagString(form.tags).includes(value)
                return (
                  <button key={value} type="button" aria-pressed={active} aria-label={label} onClick={() => {
                      const current = parseTagString(form.tags)
                      updateForm({ tags: serializeTags(active ? current.filter(t => t !== value) : [...current, value]) })
                    }} className={cn('flex h-8 items-center gap-1 rounded-lg px-1.5 text-[10px] font-semibold sm:h-auto sm:px-2 sm:py-1.5', active ? 'bg-blue-500/15 text-blue-300' : 'text-[hsl(var(--text-secondary))]')}>
                    <span aria-hidden>🧬</span><span className="hidden sm:inline">Fertility</span>
                  </button>
                )
              })}
              <button type="button" aria-pressed={form.is_recurring} onClick={() => updateForm({ is_recurring: !form.is_recurring })}
                className={cn('flex h-8 items-center gap-1 rounded-lg px-1.5 text-[10px] font-semibold sm:h-auto sm:px-2 sm:py-1.5', form.is_recurring ? 'bg-emerald-500/15 text-emerald-300' : 'text-[hsl(var(--text-secondary))]')}>
                <RefreshCw className="h-3 w-3" /><span className="hidden sm:inline">Recurring</span><span className="sm:hidden">Repeat</span>
              </button>
            </div>
          </div>

          {/* Coverage period for non-monthly billing cycles */}
          {(() => {
            const selectedCat = categories.find(c => c.id === form.category_id)
            const cycle = selectedCat?.billing_cycle
            if (!cycle || cycle === 'monthly') return null
            return (
              <div className="tx-coverage space-y-1.5 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-600">📅 Period Covered ({CYCLE_LABELS[cycle]})</span>
                  <button type="button" onClick={() => {
                    if (form.transaction_date) {
                      const suggestion = suggestCoveragePeriod(form.transaction_date, cycle)
                      updateForm({ coverage_start: suggestion.start, coverage_end: suggestion.end })
                    }
                  }} className="text-[10px] text-blue-600 hover:text-blue-700 transition-colors">
                    Auto-suggest →
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[hsl(var(--text-secondary))]">Coverage start</label>
                    <input type="date" value={form.coverage_start} onChange={e => updateForm({ coverage_start: e.target.value })} className={cn(inputCls, 'h-9 py-1.5')} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[hsl(var(--text-secondary))]">Coverage end</label>
                    <input type="date" value={form.coverage_end} onChange={e => updateForm({ coverage_end: e.target.value })} className={cn(inputCls, 'h-9 py-1.5')} />
                  </div>
                </div>
                {form.coverage_start && form.coverage_end && form.amount && (() => {
                  // Parse as local date parts to avoid timezone shift (YYYY-MM-DD → UTC midnight → previous day in negative UTC offsets)
                  const [sy, sm] = form.coverage_start.split('-').map(Number)
                  const [ey, em] = form.coverage_end.split('-').map(Number)
                  const covMonths = Math.max(1, (ey - sy) * 12 + (em - sm) + 1)
                  const perMonth = parseFloat(form.amount) / covMonths
                  return <p className="text-[10px] text-blue-400">${perMonth.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo · {covMonths} months</p>
                })()}
              </div>
            )
          })()}

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
              <p className="text-sm font-medium text-emerald-600">✅ {importResult.success} transactions imported</p>
              {importResult.skipped > 0 && <p className="text-sm text-amber-600 mt-1">↷ {importResult.skipped} skipped as duplicates or invalid rows</p>}
              {importResult.errors > 0 && <p className="text-sm text-rose-600 mt-1">⚠️ {importResult.errors} failed</p>}
            </div>
            <button onClick={() => setImportOpen(false)}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium">
              Done
            </button>
          </div>
        ) : importMode === 'pdf' ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <span className="text-blue-600 text-sm font-medium">🏦 BBVA detected</span>
              <span className="text-xs text-[hsl(var(--text-secondary))]">— {pdfRows.length} transactions found</span>
            </div>
            {/* Preview */}
            <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
              <table className="w-full table-fixed text-[10px] sm:text-xs">
                <thead><tr className="bg-[hsl(var(--bg-elevated))]">
                  <th className="w-[24%] px-1.5 py-1 text-left">Date</th>
                  <th className="px-2 py-1 text-left">Description</th>
                  <th className="w-[23%] px-1.5 py-1 text-right">Amount</th>
                  <th className="w-[16%] px-1 py-1 text-center">Type</th>
                </tr></thead>
                <tbody>
                  {pdfRows.slice(0, 8).map((row, i) => (
                    <tr key={i} className="border-t border-[hsl(var(--border))]">
                      <td className="truncate px-1.5 py-1">{row.date}</td>
                      <td className="truncate px-2 py-1">{row.description}</td>
                      <td className={cn("truncate px-1.5 py-1 text-right font-mono", row.type === 'expense' ? 'text-rose-600' : 'text-emerald-600')}>
                        ${row.amount.toLocaleString('en', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <span className={cn("rounded-full px-1 py-0.5 text-[9px]", row.type === 'expense' ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600')}>
                          {row.type === 'expense' ? 'Out' : 'In'}
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
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
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
                <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
                  <table className="w-full table-fixed text-[10px] sm:text-xs">
                    <thead><tr className="bg-[hsl(var(--bg-elevated))]">
                      <th className="w-[28%] px-1.5 py-1 text-left">Date</th>
                      <th className="w-[25%] px-1.5 py-1 text-right">Amount</th>
                      <th className="px-2 py-1 text-left">Description</th>
                    </tr></thead>
                    <tbody>
                      {csvRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-t border-[hsl(var(--border))]">
                          <td className="truncate px-1.5 py-1">{row[columnMap.date]}</td>
                          <td className="truncate px-1.5 py-1 text-right">{row[columnMap.amount]}</td>
                          <td className="truncate px-2 py-1">{columnMap.description ? row[columnMap.description] : '—'}</td>
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
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
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
