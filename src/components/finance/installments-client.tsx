'use client'

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react'
import { Plus, Pencil, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { paymentMethodFromCard } from '@/lib/payment-methods'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { EmptyState } from '@/components/ui/empty-state'
import { MoneyText } from '@/components/ui/money-text'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatusPill } from '@/components/ui/status-pill'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { cn } from '@/lib/utils'
import type { FinanceInstallment, FinanceCategory, FinanceIncomeSource, FinanceRecurringIncome } from '@/lib/finance-types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import { OWNERS, getOwnerName, getOwnerColor } from '@/lib/owners'
import { Page, PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { useResumeRefresh } from '@/hooks/use-resume-refresh'
import { addMonthsKey, daysInMonth, localDateKey, parseLocalDateKey } from '@/lib/dates'
import { formatDateShort, formatMoney } from '@/lib/format'
import { CHART, chartAxisProps, chartTooltipProps } from '@/lib/chart-theme'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'

import { inputCls } from '@/lib/form-style'

const MSI_PRESETS = [3, 6, 9, 12, 18, 24]

interface InstallmentForm {
  name: string; merchant: string; total_amount: string; installment_count: string
  start_date: string; credit_card: string; category_id: string; notes: string; owner: string
}
const emptyForm: InstallmentForm = {
  name: '', merchant: '', total_amount: '', installment_count: '12',
  start_date: '', credit_card: '', category_id: '', notes: '', owner: ''
}

/** Same day `months` later on local calendar keys, clamped to the month's end (F16). */
export function addMonths(date: string, months: number): string {
  const month = addMonthsKey(date.slice(0, 7), months)
  const [y, m] = month.split('-').map(Number)
  const day = Math.min(Number(date.slice(8, 10)) || 1, daysInMonth(y, m))
  return `${month}-${String(day).padStart(2, '0')}`
}

function monthsRemaining(endDate: string): number {
  const now = new Date()
  const end = parseLocalDateKey(endDate)
  const diff = (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth()
  return Math.max(0, diff + (end.getDate() >= now.getDate() ? 1 : 0))
}

function fmt(n: number): string {
  return formatMoney(n)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

type IncomeRow = Pick<FinanceRecurringIncome, 'amount' | 'recurrence' | 'active' | 'start_date'> & { end_date?: string | null }
const RECURRENCE_DIVISOR: Record<string, number> = { monthly: 1, bimonthly: 2, annual: 12 }
const SOURCE_MULTIPLIER: Record<string, number> = { weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }

/**
 * Monthly income for the MSI warning: salaries live in finance_recurring_income,
 * finance_income_sources only holds extras (same sum as Budget Builder).
 */
export function monthlyIncomeFrom(sources: Pick<FinanceIncomeSource, 'amount' | 'frequency'>[], recurring: IncomeRow[], todayKey: string = localDateKey()): number {
  const extras = sources.reduce((s, inc) => s + inc.amount * (SOURCE_MULTIPLIER[inc.frequency] ?? 1), 0)
  const salaries = recurring
    .filter(r => r.active && (!r.start_date || r.start_date <= todayKey) && (!r.end_date || r.end_date >= todayKey))
    .reduce((s, r) => s + r.amount / (RECURRENCE_DIVISOR[r.recurrence] || 1), 0)
  return extras + salaries
}

export function InstallmentsClient() {
  const [installments, setInstallments] = useState<FinanceInstallment[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [incomeSources, setIncomeSources] = useState<FinanceIncomeSource[]>([])
  const [recurringIncome, setRecurringIncome] = useState<IncomeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<InstallmentForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [defaultOwner, setDefaultOwner] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setDefaultOwner(getOwnerName(data.user?.email ?? undefined))
    })
  }, [])

  const fetchData = useCallback(async () => {
    const [instRes, catRes, incRes, riRes] = await Promise.all([
      supabase.from('finance_installments').select('*, category:finance_categories(*)').order('end_date', { ascending: true }),
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_income_sources').select('*').eq('is_active', true),
      // Server route: the browser key can't read finance_recurring_income under RLS (the Income page uses it too).
      fetch('/api/finance/recurring-income').then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] })),
    ])
    setInstallments(instRes.data ?? [])
    setCategories(catRes.data?.length ? catRes.data : DEFAULT_CATEGORIES as unknown as FinanceCategory[])
    setIncomeSources(incRes.data ?? [])
    setRecurringIncome(((riRes.data ?? []) as IncomeRow[]).filter(r => r.active))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useResumeRefresh(fetchData)

  const active = useMemo(() => installments.filter(i => i.is_active && monthsRemaining(i.end_date) > 0), [installments])
  const completed = useMemo(() => installments.filter(i => !i.is_active || monthsRemaining(i.end_date) === 0), [installments])

  const totalMonthlyCommitment = useMemo(() => active.reduce((s, i) => s + i.installment_amount, 0), [active])
  const totalRemaining = useMemo(() => active.reduce((s, i) => s + (i.installment_count - i.payments_made) * i.installment_amount, 0), [active])
  const monthlyIncome = useMemo(() => monthlyIncomeFrom(incomeSources, recurringIncome), [incomeSources, recurringIncome])
  const msiIncomeRatio = monthlyIncome > 0 ? (totalMonthlyCommitment / monthlyIncome) * 100 : 0

  const nextToFinish = useMemo(() => {
    if (active.length === 0) return null
    return active.reduce((earliest, i) => i.end_date < earliest.end_date ? i : earliest)
  }, [active])

  // Timeline data: horizontal bars per installment
  const timelineData = useMemo(() => {
    const now = new Date()
    return active.map(inst => {
      const start = parseLocalDateKey(inst.start_date)
      const totalMonths = inst.installment_count
      const elapsed = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth())
      const remaining = Math.max(0, totalMonths - elapsed)
      return {
        name: inst.name.length > 20 ? inst.name.slice(0, 18) + '…' : inst.name,
        fullName: inst.name,
        paid: Math.min(elapsed, totalMonths),
        remaining,
        total: totalMonths,
        monthlyAmt: inst.installment_amount,
        endDate: formatDateShort(inst.end_date, { withYear: true }),
      }
    }).sort((a, b) => a.remaining - b.remaining)
  }, [active])

  const openAdd = () => { setEditId(null); setForm({ ...emptyForm, owner: defaultOwner, start_date: localDateKey() }); setModalOpen(true) }
  const openEdit = (inst: FinanceInstallment) => {
    setEditId(inst.id)
    setForm({
      name: inst.name, merchant: inst.merchant || '', total_amount: String(inst.total_amount),
      installment_count: String(inst.installment_count), start_date: inst.start_date,
      credit_card: inst.credit_card || '', category_id: inst.category_id || '', notes: inst.notes || '',
      owner: inst.owner || defaultOwner,
    })
    setModalOpen(true)
  }

  // Create a transaction entry for an MSI payment
  const createMsiTransaction = async (inst: { name: string; merchant: string | null; installment_amount: number; category_id: string | null; id: string; credit_card: string | null; owner?: string | null }, paymentDate: string, paymentNum: number, totalPayments: number) => {
    await supabase.from('finance_transactions').insert({
      type: 'expense',
      amount: inst.installment_amount,
      currency: 'MXN',
      amount_mxn: inst.installment_amount,
      category_id: inst.category_id || null,
      merchant: `MSI: ${inst.name}`,
      description: `Auto-MSI: ${inst.name} (${paymentNum}/${totalPayments})${inst.merchant ? ` — ${inst.merchant}` : ''}${inst.credit_card ? ` (${inst.credit_card})` : ''}`,
      transaction_date: paymentDate,
      is_recurring: true,
      installment_id: inst.id,
      tags: ['auto-msi'],
      owner: inst.owner || null,
      payment_method: paymentMethodFromCard(inst.credit_card),
    })
  }

  const handleSave = async () => {
    // Uncategorized MSI rows fall outside every budget (UX-18), so a category is required.
    if (!form.name || !form.total_amount || !form.category_id) return
    setSaving(true)
    const total = parseFloat(form.total_amount) || 0
    const count = parseInt(form.installment_count) || 12
    const installmentAmt = Math.round((total / count) * 100) / 100
    const endDate = addMonths(form.start_date, count - 1)

    const payload = {
      name: form.name, merchant: form.merchant || null, total_amount: total,
      installment_count: count, installment_amount: installmentAmt,
      start_date: form.start_date, end_date: endDate,
      credit_card: form.credit_card || null, category_id: form.category_id || null,
      notes: form.notes || null, is_active: true, owner: form.owner || null,
    }

    if (editId) {
      await supabase.from('finance_installments').update(payload).eq('id', editId)
    } else {
      // Insert installment
      const { data: newInst } = await supabase.from('finance_installments').insert(payload).select().single()
      // Auto-create transaction entries for past + current month payments
      if (newInst) {
        const today = localDateKey()
        for (let i = 0; i < count; i++) {
          const payDate = addMonths(form.start_date, i)
          if (payDate <= today) {
            await createMsiTransaction(
              { ...newInst, installment_amount: installmentAmt },
              payDate, i + 1, count
            )
            // Update payments_made count
            await supabase.from('finance_installments').update({ payments_made: i + 1 }).eq('id', newInst.id)
          }
        }
      }
    }
    setSaving(false)
    setModalOpen(false)
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_installments' })
    fetchData()
  }

  const handleDelete = async (id: string) => {
    // Delete linked transactions (covers both legacy recurring_id and current installment_id)
    await supabase.from('finance_transactions').delete().eq('installment_id', id)
    await supabase.from('finance_transactions').delete().eq('recurring_id', id)
    await supabase.from('finance_installments').delete().eq('id', id)
    setDeleteConfirm(null)
    fetchData()
  }

  const handleMarkPayment = async (inst: FinanceInstallment) => {
    const newPayments = Math.min(inst.payments_made + 1, inst.installment_count)
    const isComplete = newPayments >= inst.installment_count
    // Create transaction for this payment
    const paymentDate = addMonths(inst.start_date, inst.payments_made)
    await createMsiTransaction(inst, paymentDate, newPayments, inst.installment_count)
    await supabase.from('finance_installments').update({
      payments_made: newPayments,
      is_active: !isComplete,
    }).eq('id', inst.id)
    fetchData()
  }

  if (loading) return <div className="h-8 w-48 animate-pulse rounded bg-surface-2" />

  const kpis: Array<{ label: string; value: ReactNode; hint: string }> = [
    { label: 'Monthly MSI', value: <MoneyText value={totalMonthlyCommitment} />, hint: 'committed per month' },
    { label: 'Active plans', value: active.length, hint: `${completed.length} completed` },
    { label: 'Remaining balance', value: <MoneyText value={totalRemaining} />, hint: 'left to pay' },
    {
      label: 'Next to finish',
      value: <span className="block truncate text-base">{nextToFinish?.name ?? '—'}</span>,
      hint: nextToFinish ? `${formatDateShort(nextToFinish.end_date)} · ${plural(monthsRemaining(nextToFinish.end_date), 'month')} left` : 'nothing active',
    },
  ]
  const segment = 'h-11 rounded-xl border text-sm font-medium transition-colors'
  const segmentOn = 'border-primary/50 bg-primary/10 text-fg'
  const segmentOff = 'border-border bg-surface-2 text-fg-secondary hover:text-fg'
  const label = 'mb-1 block text-xs font-medium text-fg-secondary'

  return (
    <PageTransition>
      <Page>
        <PageHeader
          title="MSI Installments"
          description="Meses Sin Intereses — interest-free installment plans"
          actions={<Button onClick={openAdd}><Plus className="h-4 w-4" aria-hidden="true" /> Add MSI plan</Button>}
        />

        {msiIncomeRatio > 30 && (
          <div role="status" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-fg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p>
              <span className="font-medium">MSI takes {msiIncomeRatio.toFixed(0)}% of monthly income.</span>{' '}
              <span className="text-fg-secondary">{fmt(totalMonthlyCommitment)}/mo of {fmt(monthlyIncome)}/mo. Consider pausing new MSI purchases.</span>
            </p>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(kpi => (
            <div key={kpi.label} className="min-w-0 rounded-2xl border border-border bg-surface p-4">
              <p className="truncate text-xs font-medium text-fg-tertiary">{kpi.label}</p>
              <div className="num-metric mt-1 text-xl font-semibold text-fg sm:text-2xl">{kpi.value}</div>
              <p className="mt-1 truncate text-xs text-fg-tertiary">{kpi.hint}</p>
            </div>
          ))}
        </section>

        {timelineData.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <h2 className="text-base font-semibold text-fg">When each plan ends</h2>
            <p className="mb-4 text-xs text-fg-tertiary">Months paid and left per plan, shortest first: that&apos;s when cash flow frees up.</p>
            <div className="max-h-[300px] overflow-y-auto sm:max-h-none">
              <ResponsiveContainer width="100%" height={Math.max(160, timelineData.length * 40 + 40)}>
                <BarChart data={timelineData} layout="vertical" margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" {...chartAxisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" {...chartAxisProps}
                    width={Math.min(130, Math.max(56, Math.max(...timelineData.map(d => d.name.length)) * 7 + 12))} />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: unknown, name: unknown, props: { payload?: { endDate?: string } }) =>
                      name === 'paid' ? [`${value} months paid`, 'Paid'] : [`${value} months left (ends ${props?.payload?.endDate ?? ''})`, 'Left']}
                    labelFormatter={(l: unknown) => timelineData.find(d => d.name === l)?.fullName || String(l)}
                  />
                  <Bar dataKey="paid" stackId="a" fill={CHART.series.budget} radius={[4, 0, 0, 4]} name="paid" maxBarSize={CHART.bar.maxBarSize} />
                  <Bar dataKey="remaining" stackId="a" fill={CHART.series.info} radius={[0, 4, 4, 0]} name="remaining" maxBarSize={CHART.bar.maxBarSize} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-fg-tertiary">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fg-tertiary" aria-hidden="true" /> Paid</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-info" aria-hidden="true" /> Months left</span>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 text-base font-semibold text-fg sm:px-5">Active plans · {active.length}</h2>
          {active.length === 0 ? (
            <EmptyState icon="inbox" title="No active MSI plans" description="Add your first installment plan to start tracking."
              action={<Button onClick={openAdd}><Plus className="h-4 w-4" aria-hidden="true" /> Add MSI plan</Button>} />
          ) : (
            <ul className="divide-y divide-border">
              {active.map(inst => {
                const remain = monthsRemaining(inst.end_date)
                const nextPayment = Math.min(inst.payments_made + 1, inst.installment_count)
                return (
                  <li key={inst.id} className="group flex flex-col gap-2.5 px-4 py-3.5 sm:px-5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[0.9375rem] font-medium text-fg">{inst.name}</span>
                          <OwnerAvatar owner={inst.owner} size={18} />
                        </p>
                        {(inst.merchant || inst.credit_card || inst.category) && (
                          <p className="truncate text-xs text-fg-tertiary">{[inst.merchant, inst.credit_card, inst.category?.name].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[0.9375rem] font-semibold text-fg"><MoneyText value={inst.installment_amount} className="num-metric" /><span className="text-xs font-normal text-fg-tertiary">/mo</span></p>
                        <p className="text-xs text-fg-tertiary">of <MoneyText value={inst.total_amount} /></p>
                      </div>
                    </div>
                    <ProgressBar value={inst.payments_made} max={inst.installment_count} tone="positive"
                      label={`${inst.name} payments`} valueText={`${inst.payments_made} of ${inst.installment_count} paid`} />
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 text-xs text-fg-secondary">
                        {inst.payments_made} of {inst.installment_count} paid · ends {formatDateShort(inst.end_date)} · {plural(remain, 'month')} left
                      </p>
                      <div className="-my-1.5 -mr-1.5 flex shrink-0 items-center transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                        <Button variant="ghost" size="icon" title="Log this month's payment" aria-label={`Log payment ${nextPayment} of ${inst.installment_count} for ${inst.name}`} onClick={() => handleMarkPayment(inst)}>
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Edit ${inst.name}`} onClick={() => openEdit(inst)}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${inst.name}`} onClick={() => setDeleteConfirm(inst.id)} className="hover:text-negative">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {completed.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-base font-semibold text-fg-secondary sm:px-5">Completed · {completed.length}</h2>
            <ul className="divide-y divide-border">
              {completed.map(inst => (
                <li key={inst.id} className="flex items-center gap-3 px-4 py-2 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{inst.name}</p>
                    {inst.merchant && <p className="truncate text-xs text-fg-tertiary">{inst.merchant}</p>}
                  </div>
                  <MoneyText value={inst.total_amount} className="num-metric shrink-0 text-sm text-fg-secondary" />
                  <StatusPill tone="positive" className="shrink-0 text-xs">Paid off<span className="hidden sm:inline"> · {inst.installment_count}</span></StatusPill>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${inst.name}`} onClick={() => setDeleteConfirm(inst.id)} className="-mr-1.5 shrink-0 hover:text-negative">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </Page>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit MSI plan' : 'New MSI plan'}>
        <form onSubmit={e => { e.preventDefault(); void handleSave() }} className="space-y-4">
          <div>
            <label htmlFor="msi-name" className={label}>Purchase name *</label>
            <input id="msi-name" className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. MacBook Pro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="msi-merchant" className={label}>Merchant</label>
              <input id="msi-merchant" className={inputCls} value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} placeholder="e.g. Liverpool" />
            </div>
            <div>
              <label htmlFor="msi-card" className={label}>Credit card</label>
              <input id="msi-card" className={inputCls} list="msi-cards" value={form.credit_card} onChange={e => setForm(f => ({ ...f, credit_card: e.target.value }))} placeholder="e.g. BBVA Infinite" />
              <datalist id="msi-cards"><option value="BBVA Infinite" /><option value="American Express" /></datalist>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="msi-total" className={label}>Total amount (MXN) *</label>
              <input id="msi-total" type="number" inputMode="decimal" className={inputCls} value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="25000" />
            </div>
            <div>
              <span className={label}>MSI months *</span>
              <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="MSI months">
                {MSI_PRESETS.map(n => {
                  const on = form.installment_count === String(n)
                  return (
                    <button key={n} type="button" aria-pressed={on} onClick={() => setForm(f => ({ ...f, installment_count: String(n) }))}
                      className={cn(segment, on ? segmentOn : segmentOff)}>
                      {n}
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label htmlFor="msi-custom" className="shrink-0 text-xs text-fg-tertiary">or custom:</label>
                <input id="msi-custom" type="number" min="1" max="48" inputMode="numeric" placeholder="Custom"
                  className={cn(inputCls, 'min-w-0 flex-1 text-center sm:w-20 sm:flex-none')}
                  value={MSI_PRESETS.includes(parseInt(form.installment_count)) ? '' : form.installment_count}
                  onChange={e => setForm(f => ({ ...f, installment_count: e.target.value }))} />
              </div>
            </div>
          </div>
          {form.total_amount && Number(form.installment_count) > 0 && (
            <p className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg-secondary">
              Monthly payment <strong className="num-metric text-fg">{fmt(parseFloat(form.total_amount) / parseInt(form.installment_count))}</strong> × {plural(parseInt(form.installment_count), 'month')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="msi-start" className={label}>Start date *</label>
              <input id="msi-start" type="date" className={inputCls} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="msi-category" className={label}>Category *</label>
              <select id="msi-category" required className={inputCls} value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">Choose category</option>
                {categories.filter(c => c.type !== 'income').map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <span className={label}>Owner</span>
            <div className="flex gap-2" role="group" aria-label="Owner">
              {OWNERS.map(name => (
                <button key={name} type="button" aria-pressed={form.owner === name} onClick={() => setForm(f => ({ ...f, owner: name }))}
                  className={cn(segment, 'flex-1', form.owner === name ? segmentOn : segmentOff)}>
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: getOwnerColor(name) }} aria-hidden="true" />{name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="msi-notes" className={label}>Notes</label>
            <textarea id="msi-notes" className={inputCls} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" size="lg" className="flex-1" disabled={saving || !form.name || !form.total_amount || !form.category_id}>
              {saving ? 'Saving…' : editId ? 'Update plan' : 'Add MSI plan'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete installment plan?">
        <p className="mb-4 text-sm text-fg-secondary">This removes the MSI plan and the payments it logged.</p>
        <div className="flex gap-3">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
          <Button variant="danger" size="lg" className="flex-1" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
        </div>
      </Modal>
    </PageTransition>
  )
}
