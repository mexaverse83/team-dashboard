'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Power, CreditCard, Check, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageTransition } from '@/components/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { Page, PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { MoneyText } from '@/components/ui/money-text'
import { StatusPill } from '@/components/ui/status-pill'
import { BillsTimeline, type ForecastEvent } from '@/components/finance/bills-timeline'
import { useResumeRefresh } from '@/hooks/use-resume-refresh'
import { cn } from '@/lib/utils'

import type { FinanceCategory, FinanceRecurring } from '@/lib/finance-types'
import { enrichRecurring, DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import { OWNERS, getOwnerName, getOwnerColor, canonicalOwner } from '@/lib/owners'
import { PAYMENT_METHODS, getPaymentMethod } from '@/lib/payment-methods'
import { addDaysKey, addMonthsKey, daysInMonth, localDateKey } from '@/lib/dates'
import { formatDateShort, formatMoney, formatRelativeDue } from '@/lib/format'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'
import { inputCls } from '@/lib/form-style'

/** Next due date after `dateKey`, on local calendar keys (no UTC round-trip, F16). */
export function advanceDueDate(dateKey: string, frequency: string): string {
  if (frequency === 'weekly') return addDaysKey(dateKey, 7)
  if (frequency === 'biweekly') return addDaysKey(dateKey, 14)
  const months = frequency === 'quarterly' ? 3 : frequency === 'yearly' ? 12 : frequency === 'monthly' ? 1 : 0
  if (!months) return dateKey
  const month = addMonthsKey(dateKey.slice(0, 7), months)
  const [y, m] = month.split('-').map(Number)
  const day = Math.min(Number(dateKey.slice(8, 10)), daysInMonth(y, m))
  return `${month}-${String(day).padStart(2, '0')}`
}

function monthlyEquivalent(amount: number, freq: string): number {
  switch (freq) {
    case 'weekly': return amount * 4.33
    case 'biweekly': return amount * 2.17
    case 'monthly': return amount
    case 'quarterly': return amount / 3
    case 'yearly': return amount / 12
    default: return amount
  }
}

const FREQUENCY_LABEL: Record<string, string> = { weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }

export interface PriceChange { from: number; to: number; date: string }

/** Latest auto-posted charge per subscription that the processor flagged price_changed (OPP-01). */
export function latestPriceChanges(rows: Array<{ recurring_id: string | null; amount: number; transaction_date: string; description: string | null; flags?: string[] | null }>): Record<string, PriceChange> {
  const latest: Record<string, PriceChange | null> = {}
  for (const row of rows) {
    if (!row.recurring_id || row.recurring_id in latest) continue
    const flagged = row.flags?.includes('price_changed')
    const match = row.description?.match(/from \$([\d,.]+)\s*→\s*\$([\d,.]+)/)
    latest[row.recurring_id] = flagged && match
      ? { from: Number(match[1].replace(/,/g, '')), to: Number(match[2].replace(/,/g, '')), date: row.transaction_date }
      : null
  }
  return Object.fromEntries(Object.entries(latest).filter((e): e is [string, PriceChange] => e[1] != null))
}

interface ProcessResponse {
  total_created?: number
  results?: { errors?: string[]; item_warnings?: string[] }
  errors?: string[]
  item_warnings?: string[]
  error?: string
  ok?: boolean
}

interface ProcessOutcome { tone: 'positive' | 'warning' | 'negative'; title: string; details: string[] }

export function describeProcessResult(res: { ok: boolean; statusText?: string }, data: ProcessResponse): ProcessOutcome {
  const created = data.total_created || 0
  const errors = (data.results?.errors ?? data.errors ?? []).filter(e => !/^Month close deferred/.test(e))
  const warnings = data.item_warnings ?? data.results?.item_warnings ?? []
  const details = [...errors, ...warnings]
  if (!res.ok && created === 0 && details.length === 0) {
    return { tone: 'negative', title: `Could not post due items: ${data.error || res.statusText || 'server error'}`, details: [] }
  }
  if (!res.ok && created === 0) {
    return { tone: 'negative', title: `Could not post due items; ${details.length} error${details.length === 1 ? '' : 's'}`, details }
  }
  const posted = created > 0 ? `Posted ${created} transaction${created === 1 ? '' : 's'}` : 'Nothing was due'
  if (details.length === 0) return { tone: 'positive', title: posted, details: [] }
  return { tone: 'warning', title: `${posted}; ${details.length} item${details.length === 1 ? '' : 's'} need attention`, details }
}

interface SubForm {
  name: string
  amount: string
  currency: string
  category_id: string
  frequency: string
  next_due_date: string
  merchant: string
  notes: string
  owner: string
  debt_id: string
  payment_method: string
}

interface Debt { id: string; name: string; balance: number }
interface LoggedPayment { subId: string; name: string; txId: string; prevDue: string | null; newDue: string | null }

/** Logging up to this many days before the due date counts as paying that period. */
const LOG_ADVANCE_DAYS = 3
const UNDO_LOG_MS = 5000

const emptyForm: SubForm = { name: '', amount: '', currency: 'MXN', category_id: '', frequency: 'monthly', next_due_date: '', merchant: '', notes: '', owner: '', debt_id: '', payment_method: '' }
const label = 'mb-1 block text-xs font-medium text-fg-secondary'

export default function SubscriptionsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [recurring, setRecurring] = useState<FinanceRecurring[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [priceChanges, setPriceChanges] = useState<Record<string, PriceChange>>({})
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SubForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [defaultOwner, setDefaultOwner] = useState('')
  const [logAlso, setLogAlso] = useState(true)
  const [lastLog, setLastLog] = useState<LoggedPayment | null>(null)
  const logTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (logTimer.current) clearTimeout(logTimer.current) }, [])
  const [confirmProcess, setConfirmProcess] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [processResult, setProcessResult] = useState<ProcessOutcome | null>(null)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setDefaultOwner(getOwnerName(data.user?.email ?? undefined))) }, [])

  const fetchData = useCallback(async () => {
    const since = addDaysKey(localDateKey(), -120)
    const [catRes, recRes, debtRes, postedRes] = await Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_recurring').select('*').order('next_due_date'),
      supabase.from('finance_debts').select('id,name,balance').eq('is_active', true).order('name'),
      supabase.from('finance_transactions').select('recurring_id,amount,transaction_date,description,flags')
        .gte('transaction_date', since).order('transaction_date', { ascending: false }).order('id').limit(1000),
    ])
    const cats = (catRes.data && catRes.data.length > 0) ? catRes.data : DEFAULT_CATEGORIES
    setCategories(cats)
    setRecurring(enrichRecurring(recRes.data || [], cats))
    setDebts(debtRes.data || [])
    setPriceChanges(latestPriceChanges(postedRes.data || []))
    setLoading(false)
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])
  useResumeRefresh(fetchData)

  const today = localDateKey()
  const active = recurring.filter(r => r.is_active)
  const monthlyBurn = active.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0)
  const dueNow = active.filter(r => r.next_due_date && r.next_due_date <= today)
  const horizon = addDaysKey(today, 30)
  const timeline: ForecastEvent[] = active
    .filter(r => r.next_due_date && r.next_due_date >= today && r.next_due_date <= horizon)
    .map(r => ({ date: r.next_due_date!, type: 'subscription', amount_mxn: -r.amount, name: r.name, owner: canonicalOwner(r.owner) }))
  const next30 = timeline.reduce((s, e) => s - e.amount_mxn, 0)

  const updateForm = (patch: Partial<SubForm>) => setForm(f => ({ ...f, ...patch }))

  const openAdd = () => {
    setEditingId(null)
    setDeleteConfirm(false)
    // Default the first due date to today so the processor doesn't skip it.
    setForm({ ...emptyForm, owner: defaultOwner, next_due_date: localDateKey() })
    setModalOpen(true)
  }

  const openEdit = (sub: FinanceRecurring) => {
    setEditingId(sub.id)
    setDeleteConfirm(false)
    setForm({
      name: sub.name,
      amount: sub.amount.toString(),
      currency: sub.currency,
      category_id: sub.category_id,
      frequency: sub.frequency,
      next_due_date: sub.next_due_date || '',
      merchant: sub.merchant || '',
      notes: sub.notes || '',
      owner: canonicalOwner(sub.owner) || defaultOwner,
      debt_id: (sub as FinanceRecurring & { debt_id?: string | null }).debt_id || '',
      payment_method: sub.payment_method || '',
    })
    setModalOpen(true)
  }

  const processNow = async () => {
    setConfirmProcess(false)
    setProcessing(true)
    setProcessResult(null)
    try {
      const res = await fetch('/api/finance/process-recurring', { method: 'POST' })
      const data: ProcessResponse = await res.json().catch(() => ({}))
      setProcessResult(describeProcessResult(res, data))
      // Items can be created even when another row failed (503), so refetch on any creation (AUTO-12).
      if ((data.total_created || 0) > 0) {
        dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'process-recurring' })
        void fetchData()
      }
    } catch (e) {
      setProcessResult({ tone: 'negative', title: `Could not reach the server: ${(e as Error).message}`, details: [] })
    }
    setProcessing(false)
  }

  const handleSave = async () => {
    if (!form.name || !form.amount || !form.category_id || !form.next_due_date) return
    setSaving(true)
    const amt = parseFloat(form.amount)
    const todayStr = localDateKey()
    // Logging today's payment moves the schedule to the next period so the processor doesn't double-post it.
    const nextDue = !editingId && logAlso && form.next_due_date <= todayStr ? advanceDueDate(form.next_due_date, form.frequency) : form.next_due_date

    const record = {
      name: form.name,
      amount: amt,
      currency: form.currency,
      category_id: form.category_id,
      frequency: form.frequency,
      next_due_date: nextDue,
      merchant: form.merchant || form.name,
      notes: form.notes || null,
      owner: canonicalOwner(form.owner) || null,
      debt_id: form.debt_id || null,
      payment_method: form.payment_method || null,
      is_active: true,
    }
    if (editingId) {
      await supabase.from('finance_recurring').update(record).eq('id', editingId)
      // Keep linked transactions in the subscription's category.
      await supabase.from('finance_transactions').update({ category_id: form.category_id }).eq('recurring_id', editingId)
    } else {
      const { data } = await supabase.from('finance_recurring').insert(record).select('id').single()
      if (logAlso && data) {
        await supabase.from('finance_transactions').insert({
          type: 'expense',
          amount: amt,
          currency: form.currency,
          amount_mxn: amt,
          category_id: form.category_id,
          merchant: form.merchant || form.name,
          description: `${form.name} (${form.frequency})`,
          transaction_date: todayStr,
          is_recurring: true,
          recurring_id: data.id,
          owner: canonicalOwner(form.owner),
          payment_method: form.payment_method || null,
        })
      }
    }
    setSaving(false)
    setModalOpen(false)
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_recurring' })
    void fetchData()
  }

  const logPayment = async (sub: FinanceRecurring) => {
    const todayKey = localDateKey()
    const { data, error } = await supabase.from('finance_transactions').insert({
      type: 'expense',
      amount: sub.amount,
      currency: sub.currency,
      amount_mxn: sub.amount,
      category_id: sub.category_id,
      merchant: sub.merchant || sub.name,
      description: `${sub.name} (${sub.frequency})`,
      transaction_date: todayKey,
      is_recurring: true,
      recurring_id: sub.id,
      owner: canonicalOwner(sub.owner),
      payment_method: sub.payment_method || null,
    }).select('id').single()
    if (error || !data) {
      setProcessResult({ tone: 'negative', title: `Could not log ${sub.name}: ${error?.message || 'unknown error'}`, details: [] })
      return
    }
    // A charge logged on/near its due date settles that period, so the processor must not post it again.
    const prevDue = sub.next_due_date || null
    const newDue = prevDue && prevDue <= addDaysKey(todayKey, LOG_ADVANCE_DAYS) ? advanceDueDate(prevDue, sub.frequency) : null
    if (newDue) await supabase.from('finance_recurring').update({ next_due_date: newDue }).eq('id', sub.id)
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_transactions' })
    if (logTimer.current) clearTimeout(logTimer.current)
    setLastLog({ subId: sub.id, name: sub.name, txId: data.id, prevDue, newDue })
    logTimer.current = setTimeout(() => setLastLog(null), UNDO_LOG_MS)
    if (newDue) void fetchData()
  }

  const undoLog = async () => {
    const log = lastLog
    if (!log) return
    if (logTimer.current) clearTimeout(logTimer.current)
    setLastLog(null)
    await supabase.from('finance_transactions').delete().eq('id', log.txId)
    if (log.newDue) await supabase.from('finance_recurring').update({ next_due_date: log.prevDue }).eq('id', log.subId)
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_transactions' })
    void fetchData()
  }

  const toggleActive = async (sub: FinanceRecurring) => {
    await supabase.from('finance_recurring').update({ is_active: !sub.is_active }).eq('id', sub.id)
    void fetchData()
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/finance/subscriptions/${id}`, { method: 'DELETE', referrerPolicy: 'origin' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('Delete failed:', data.error || res.statusText)
    }
    setDeleteConfirm(false)
    setModalOpen(false)
    void fetchData()
  }

  if (loading) return <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />

  const kpis: Array<[string, number]> = [['Monthly burn', monthlyBurn], ['Per year', monthlyBurn * 12], ['Next 30 days', next30]]

  return (
    <PageTransition>
      <Page>
        <PageHeader
          title="Subscriptions"
          description="Recurring charges and subscription tracking"
          actions={<>
            <Button variant="secondary" onClick={() => setConfirmProcess(true)} disabled={processing}
              aria-label="Post due items (subscriptions, income, MSI)">
              {processing ? 'Posting…' : <>Post due items<span className="hidden xl:inline font-normal text-fg-secondary"> (subscriptions, income, MSI)</span></>}
            </Button>
            <Button onClick={openAdd}><Plus className="h-4 w-4" aria-hidden="true" /> Add subscription</Button>
          </>}
        />

        {processResult && (
          <div role="status" className={cn('rounded-xl border px-4 py-3 text-sm text-fg',
            processResult.tone === 'positive' ? 'border-positive/30 bg-positive-bg' : processResult.tone === 'warning' ? 'border-warning/40 bg-warning-bg' : 'border-negative/40 bg-negative-bg')}>
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{processResult.title}</p>
              <button type="button" onClick={() => setProcessResult(null)} className="-my-2.5 h-11 shrink-0 rounded-lg px-2 text-xs font-semibold text-fg-secondary hover:text-fg">Dismiss</button>
            </div>
            {processResult.details.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-fg-secondary">
                {processResult.details.slice(0, 6).map((d, i) => <li key={i}>{d}</li>)}
                {processResult.details.length > 6 && <li>…and {processResult.details.length - 6} more</li>}
              </ul>
            )}
          </div>
        )}

        <section className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {kpis.map(([name, value]) => (
            <div key={name} className="min-w-0 px-3 py-3 sm:px-5 sm:py-4">
              <p className="truncate text-xs font-medium text-fg-tertiary">{name}</p>
              <MoneyText value={value} className="num-metric mt-1 block !text-left text-base font-semibold text-fg sm:text-2xl" />
            </div>
          ))}
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-2xl border border-border bg-surface" aria-labelledby="subs-heading">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 id="subs-heading" className="text-base font-semibold text-fg">All subscriptions</h2>
              <span className="text-xs text-fg-tertiary">{active.length} active</span>
            </div>
            {recurring.length === 0 ? (
              <EmptyState icon="radio" title="No subscriptions" description="Track recurring charges to see your monthly burn" action={<Button onClick={openAdd}>Add subscription</Button>} />
            ) : (
              <ul className="divide-y divide-border">
                {recurring.map(sub => {
                  const method = getPaymentMethod(sub.payment_method)
                  const change = priceChanges[sub.id]
                  const due = sub.next_due_date
                  return (
                    <li key={sub.id} className={cn('group flex items-center gap-1 pr-2', !sub.is_active && 'opacity-70')}>
                      <button type="button" onClick={() => openEdit(sub)}
                        aria-label={`Edit ${sub.name}, ${formatMoney(sub.amount)} ${FREQUENCY_LABEL[sub.frequency]?.toLowerCase() ?? sub.frequency}${due ? `, next ${formatDateShort(due)}` : ''}`}
                        className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none">
                        <CategoryIcon name={sub.category?.name} emoji={sub.category?.icon} colorIndex={sub.category?.sort_order ?? 0} size={36} className="rounded-xl" />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-[0.9375rem] font-medium text-fg">{sub.name}</span>
                            <OwnerAvatar owner={sub.owner} size={18} />
                            {!sub.is_active && <StatusPill className="text-xs" tone="neutral">Paused</StatusPill>}
                            {change && (
                              <StatusPill className="text-xs" tone="warning" title={`Price changed on ${formatDateShort(change.date)}`}>
                                <TrendingUp className="h-3 w-3" aria-hidden="true" />{formatMoney(change.from)} → {formatMoney(change.to)}
                              </StatusPill>
                            )}
                          </span>
                          {/* Wraps on phones (two icon actions share the row) so cycle and card stay readable. */}
                          <span className="mt-0.5 block text-xs text-fg-tertiary sm:truncate">
                            {due && sub.is_active && <span className={cn(due < today && 'font-medium text-warning')}>{formatDateShort(due)} · {formatRelativeDue(due)} · </span>}
                            {FREQUENCY_LABEL[sub.frequency] ?? sub.frequency}{method ? ` · ${method.short}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <MoneyText value={sub.amount} className="num-metric text-[0.9375rem] font-semibold text-fg" />
                          {sub.currency !== 'MXN' && <span className="block text-[0.6875rem] text-fg-tertiary">{sub.currency}</span>}
                        </span>
                      </button>
                      {lastLog?.subId === sub.id ? (
                        <span className="flex h-11 w-11 items-center justify-center text-positive" aria-label="Payment logged"><Check className="h-4 w-4" aria-hidden="true" /></span>
                      ) : (
                        <Button variant="ghost" size="icon" aria-label={`Log ${sub.name} payment`} title="Log payment as expense" onClick={() => logPayment(sub)}>
                          <CreditCard className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label={sub.is_active ? `Pause ${sub.name}` : `Resume ${sub.name}`} title={sub.is_active ? 'Pause' : 'Resume'} onClick={() => toggleActive(sub)}>
                        <Power className={cn('h-4 w-4', !sub.is_active && 'text-positive')} aria-hidden="true" />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4" aria-labelledby="upcoming-heading">
            <h2 id="upcoming-heading" className="mb-3 text-base font-semibold text-fg">Upcoming · next 30 days</h2>
            <BillsTimeline events={timeline} daysAhead={30} maxItems={10} />
          </section>
        </div>

        <Modal open={confirmProcess} onClose={() => setConfirmProcess(false)} title="Post due items?">
          <div className="space-y-4 text-sm">
            <p className="text-fg-secondary">This runs the recurring processor now, the same job the daily automation runs. It posts everything due today or earlier:</p>
            {dueNow.length > 0 ? (
              <ul className="divide-y divide-border rounded-xl border border-border">
                {dueNow.map(sub => (
                  <li key={sub.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate text-fg">{sub.name} <span className="text-fg-tertiary">· due {formatDateShort(sub.next_due_date!)}</span></span>
                    <MoneyText value={sub.amount} className="shrink-0 text-fg" />
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl border border-border px-3 py-2 text-fg-secondary">No subscriptions are due right now.</p>}
            <p className="text-fg-secondary">Due recurring income and MSI installments are posted too. Anything already posted for its date is skipped.</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmProcess(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => void processNow()}>Post now</Button>
            </div>
          </div>
        </Modal>

        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit subscription' : 'Add subscription'}>
          <form onSubmit={e => { e.preventDefault(); void handleSave() }} className="space-y-4">
            <div>
              <label htmlFor="sub-name" className={label}>Name</label>
              <input id="sub-name" type="text" required placeholder="e.g., Netflix, Spotify…" value={form.name}
                onChange={e => updateForm({ name: e.target.value })} className={inputCls} />
            </div>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <label htmlFor="sub-amount" className={label}>Amount</label>
                <input id="sub-amount" type="number" inputMode="decimal" step="0.01" min="0" required placeholder="0.00" value={form.amount}
                  onChange={e => updateForm({ amount: e.target.value })} className={cn(inputCls, 'font-semibold')} />
              </div>
              <div className="w-24 shrink-0">
                <label htmlFor="sub-currency" className={label}>Currency</label>
                <select id="sub-currency" value={form.currency} onChange={e => updateForm({ currency: e.target.value })} className={inputCls}>
                  <option>MXN</option><option>USD</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="sub-category" className={label}>Category</label>
              <select id="sub-category" value={form.category_id} onChange={e => updateForm({ category_id: e.target.value })} className={inputCls} required>
                <option value="">Select category</option>
                {categories.filter(c => c.type === 'expense' || c.type === 'both').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="sub-frequency" className={label}>Frequency</label>
                <select id="sub-frequency" value={form.frequency} onChange={e => updateForm({ frequency: e.target.value })} className={inputCls}>
                  {['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].map(f => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="sub-next-due" className={label}>Next due</label>
                <input id="sub-next-due" type="date" required value={form.next_due_date} onChange={e => updateForm({ next_due_date: e.target.value })} className={inputCls} />
              </div>
            </div>
            <div>
              <label htmlFor="sub-merchant" className={label}>Merchant</label>
              <input id="sub-merchant" type="text" placeholder="e.g., Netflix Inc." value={form.merchant}
                onChange={e => updateForm({ merchant: e.target.value })} className={inputCls} />
            </div>
            <div>
              <span className={label}>Owner</span>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Owner">
                {OWNERS.map(name => (
                  <button key={name} type="button" aria-pressed={form.owner === name} onClick={() => updateForm({ owner: name })}
                    className={cn('flex h-11 items-center justify-center gap-1.5 rounded-xl border text-sm font-semibold transition-colors',
                      form.owner === name ? 'border-primary bg-primary/15 text-fg' : 'border-border bg-surface-2 text-fg-secondary')}>
                    <span className="h-2 w-2 rounded-full" style={{ background: getOwnerColor(name) }} aria-hidden="true" />{name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Paid with</span>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label="Payment method">
                {PAYMENT_METHODS.map(m => (
                  <button key={m.value} type="button" aria-pressed={form.payment_method === m.value} title={m.label}
                    onClick={() => updateForm({ payment_method: form.payment_method === m.value ? '' : m.value })}
                    className={cn('h-11 min-w-0 truncate rounded-xl border px-1 text-[0.8125rem] font-semibold transition-colors',
                      form.payment_method === m.value ? 'border-primary bg-primary/15 text-fg' : 'border-border bg-surface-2 text-fg-secondary')}>
                    {m.short}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label htmlFor="sub-notes" className={label}>Notes</label>
              <textarea id="sub-notes" rows={2} placeholder="Optional notes…" value={form.notes}
                onChange={e => updateForm({ notes: e.target.value })} className={inputCls} />
            </div>
            {debts.length > 0 && (
              <div>
                <label htmlFor="sub-debt" className={label}>Link to debt (keeps its balance in sync)</label>
                <select id="sub-debt" value={form.debt_id} onChange={e => updateForm({ debt_id: e.target.value })} className={inputCls}>
                  <option value="">None — not a debt payment</option>
                  {debts.map(d => <option key={d.id} value={d.id}>{d.name} ({formatMoney(d.balance)} remaining)</option>)}
                </select>
              </div>
            )}
            {!editingId && (
              <label className="flex min-h-11 items-center gap-2 text-sm text-fg">
                <input type="checkbox" checked={logAlso} onChange={e => setLogAlso(e.target.checked)} className="h-4 w-4 rounded" />
                Also log today&apos;s payment as an expense
              </label>
            )}
            <div className="flex gap-2">
              {editingId && (deleteConfirm ? (
                <Button variant="danger" size="lg" onClick={() => handleDelete(editingId)}>Confirm delete</Button>
              ) : (
                <Button variant="ghost" size="lg" className="text-negative" onClick={() => setDeleteConfirm(true)}><Trash2 className="h-4 w-4" aria-hidden="true" /> Delete</Button>
              ))}
              <Button type="submit" size="lg" className="flex-1" disabled={saving || !form.name || !form.amount || !form.category_id || !form.next_due_date}>
                {saving ? 'Saving…' : editingId ? 'Update subscription' : 'Add subscription'}
              </Button>
            </div>
          </form>
        </Modal>

        {lastLog && (
          <div role="status" className="animate-fade-up fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] flex items-center gap-3 rounded-2xl border border-border bg-surface p-2 pl-4 shadow-card sm:bottom-6 sm:left-auto sm:right-6 sm:w-96">
            <span className="min-w-0 flex-1 text-sm text-fg">
              <span className="block truncate">Logged <strong>{lastLog.name}</strong></span>
              {lastLog.newDue && <span className="block truncate text-xs text-fg-secondary">Next due {formatDateShort(lastLog.newDue)}</span>}
            </span>
            <button type="button" onClick={() => void undoLog()} className="h-11 rounded-xl px-3 text-sm font-semibold text-primary hover:bg-primary/10">Undo</button>
          </div>
        )}
      </Page>
    </PageTransition>
  )
}
