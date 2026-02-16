'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2, CreditCard, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import type { FinanceInstallment, FinanceCategory, FinanceIncomeSource } from '@/lib/finance-types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import { OWNERS, getOwnerName, getOwnerColor } from '@/lib/owners'
import { OwnerDot } from '@/components/finance/owner-dot'

const inputCls = "w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-blue-500 transition-colors"
const tooltipStyle = { contentStyle: { background: 'hsl(222, 47%, 6%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '8px', fontSize: '12px' } }

const MSI_PRESETS = [3, 6, 9, 12, 18, 24]

interface InstallmentForm {
  name: string; merchant: string; total_amount: string; installment_count: string
  start_date: string; credit_card: string; category_id: string; notes: string; owner: string
}
const emptyForm: InstallmentForm = {
  name: '', merchant: '', total_amount: '', installment_count: '12',
  start_date: new Date().toISOString().slice(0, 10), credit_card: '', category_id: '', notes: '', owner: ''
}

function addMonths(date: string, months: number): string {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

function monthsRemaining(endDate: string): number {
  const now = new Date()
  const end = new Date(endDate)
  const diff = (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth()
  return Math.max(0, diff + (end.getDate() >= now.getDate() ? 1 : 0))
}

function fmt(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

export function InstallmentsClient() {
  const [installments, setInstallments] = useState<FinanceInstallment[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [incomeSources, setIncomeSources] = useState<FinanceIncomeSource[]>([])
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
    const [instRes, catRes, incRes] = await Promise.all([
      supabase.from('finance_installments').select('*, category:finance_categories(*)').order('end_date', { ascending: true }),
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_income_sources').select('*').eq('is_active', true),
    ])
    setInstallments(instRes.data ?? [])
    setCategories(catRes.data?.length ? catRes.data : DEFAULT_CATEGORIES as unknown as FinanceCategory[])
    setIncomeSources(incRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Re-fetch on tab focus
  useEffect(() => {
    const handler = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [fetchData])

  const active = useMemo(() => installments.filter(i => i.is_active && monthsRemaining(i.end_date) > 0), [installments])
  const completed = useMemo(() => installments.filter(i => !i.is_active || monthsRemaining(i.end_date) === 0), [installments])

  const totalMonthlyCommitment = useMemo(() => active.reduce((s, i) => s + i.installment_amount, 0), [active])
  const totalRemaining = useMemo(() => active.reduce((s, i) => s + (i.installment_count - i.payments_made) * i.installment_amount, 0), [active])
  const monthlyIncome = useMemo(() => incomeSources.reduce((s, inc) => {
    const freq: Record<string, number> = { weekly: 4.33, biweekly: 2.17, monthly: 1, quarterly: 1/3, yearly: 1/12 }
    return s + inc.amount * (freq[inc.frequency] || 1)
  }, 0), [incomeSources])
  const msiIncomeRatio = monthlyIncome > 0 ? (totalMonthlyCommitment / monthlyIncome) * 100 : 0

  const nextToFinish = useMemo(() => {
    if (active.length === 0) return null
    return active.reduce((earliest, i) => new Date(i.end_date) < new Date(earliest.end_date) ? i : earliest)
  }, [active])

  // Timeline data: horizontal bars per installment
  const timelineData = useMemo(() => {
    const now = new Date()
    return active.map(inst => {
      const start = new Date(inst.start_date)
      const end = new Date(inst.end_date)
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
        endDate: end.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }),
      }
    }).sort((a, b) => a.remaining - b.remaining)
  }, [active])

  const openAdd = () => { setEditId(null); setForm({ ...emptyForm, owner: defaultOwner }); setModalOpen(true) }
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
  const createMsiTransaction = async (inst: { name: string; merchant: string | null; installment_amount: number; category_id: string | null; id: string; credit_card: string | null }, paymentDate: string, paymentNum: number, totalPayments: number) => {
    await supabase.from('finance_transactions').insert({
      type: 'expense',
      amount: inst.installment_amount,
      currency: 'MXN',
      amount_mxn: inst.installment_amount,
      category_id: inst.category_id || null,
      merchant: inst.merchant || inst.name,
      description: `MSI ${paymentNum}/${totalPayments} — ${inst.name}${inst.credit_card ? ` (${inst.credit_card})` : ''}`,
      transaction_date: paymentDate,
      is_recurring: true,
      recurring_id: inst.id,
      tags: ['msi'],
    })
  }

  const handleSave = async () => {
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
        const now = new Date()
        for (let i = 0; i < count; i++) {
          const payDate = addMonths(form.start_date, i)
          if (new Date(payDate) <= now) {
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
    fetchData()
  }

  const handleDelete = async (id: string) => {
    // Delete linked transactions too
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

  if (loading) {
    return (
      <PageTransition>
        <div className="space-y-6">
          <div className="h-8 w-64 rounded-lg bg-[hsl(var(--bg-elevated))] animate-shimmer" />
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-[hsl(var(--bg-elevated))] animate-shimmer" />)}
          </div>
        </div>
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">MSI Installments</h1>
            <p className="text-sm text-[hsl(var(--text-secondary))]">Meses Sin Intereses — interest-free installment plans</p>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" /> Add MSI Plan
          </button>
        </div>

        {/* Cash flow warning */}
        {msiIncomeRatio > 30 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">High MSI Commitment</p>
              <p className="text-xs text-[hsl(var(--text-secondary))]">
                Your installments are {msiIncomeRatio.toFixed(0)}% of income ({fmt(totalMonthlyCommitment)}/mo). Consider pausing new MSI purchases.
              </p>
            </div>
          </motion.div>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <GlassCard>
            <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Monthly MSI</p>
            <div className="text-2xl sm:text-3xl font-bold mt-1">{fmt(totalMonthlyCommitment)}</div>
            <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">committed per month</p>
          </GlassCard>
          <GlassCard>
            <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Active Plans</p>
            <AnimatedNumber value={active.length} className="text-2xl sm:text-3xl font-bold mt-1" />
            <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">{completed.length} completed</p>
          </GlassCard>
          <GlassCard>
            <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Remaining Balance</p>
            <div className="text-2xl sm:text-3xl font-bold mt-1">{fmt(totalRemaining)}</div>
            <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">left to pay</p>
          </GlassCard>
          <GlassCard>
            <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Next to Finish</p>
            <div className="text-sm font-bold mt-1 truncate">{nextToFinish?.name ?? '—'}</div>
            {nextToFinish && (
              <p className="text-xs text-green-400 mt-1">
                {new Date(nextToFinish.end_date).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })} · {monthsRemaining(nextToFinish.end_date)} months left
              </p>
            )}
          </GlassCard>
        </div>

        {/* Timeline Chart */}
        {timelineData.length > 0 && (
          <GlassCard>
            <h2 className="text-base font-semibold mb-4">MSI Timeline</h2>
            <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">When each plan ends — visualize when cash flow frees up</p>
            <div className="overflow-y-auto max-h-[300px] sm:max-h-none">
            <ResponsiveContainer width="100%" height={Math.max(200, timelineData.length * 44 + 40)}>
              <BarChart data={timelineData} layout="vertical" margin={{ left: 0, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--text-tertiary))' }} axisLine={false} tickLine={false} label={{ value: 'Months', position: 'insideBottomRight', fontSize: 11, fill: 'hsl(var(--text-tertiary))' }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: 'hsl(var(--text-secondary))' }} axisLine={false} tickLine={false} />
                <Tooltip
                  {...tooltipStyle}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any, props: any) => {
                    if (name === 'paid') return [`${value} months paid`, 'Paid']
                    return [`${value} months left (ends ${props?.payload?.endDate ?? ''})`, 'Remaining']
                  }}
                  labelFormatter={(label: any) => timelineData.find(d => d.name === label)?.fullName || String(label)}
                />
                <Bar dataKey="paid" stackId="a" fill="#10B981" radius={[4, 0, 0, 4]} name="paid" />
                <Bar dataKey="remaining" stackId="a" fill="#3B82F6" radius={[0, 4, 4, 0]} name="remaining" />
              </BarChart>
            </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-[hsl(var(--text-tertiary))]">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Paid</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" /> Remaining</span>
            </div>
          </GlassCard>
        )}

        {/* Active Installments Table */}
        <GlassCard>
          <h2 className="text-base font-semibold mb-4">Active Installments ({active.length})</h2>
          {active.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard className="h-10 w-10 text-[hsl(var(--text-tertiary))] mb-3" />
              <p className="text-sm font-medium">No active MSI plans</p>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">Add your first installment plan to start tracking</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[hsl(var(--border))]">
                      <th className="text-left py-2 px-3 text-xs font-medium text-[hsl(var(--text-secondary))]">Item</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[hsl(var(--text-secondary))]">Total</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[hsl(var(--text-secondary))]">Monthly</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[hsl(var(--text-secondary))]">Progress</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[hsl(var(--text-secondary))]">Card</th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-[hsl(var(--text-secondary))]">Ends</th>
                      <th className="text-right py-2 px-3 text-xs font-medium text-[hsl(var(--text-secondary))]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map(inst => {
                      const pct = (inst.payments_made / inst.installment_count) * 100
                      const remain = monthsRemaining(inst.end_date)
                      return (
                        <tr key={inst.id} className="border-b border-[hsl(var(--border-subtle))] group hover:bg-[hsl(var(--bg-elevated))] transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-medium flex items-center gap-2">{inst.name} <OwnerDot owner={inst.owner} /></div>
                            {inst.merchant && <div className="text-xs text-[hsl(var(--text-tertiary))]">{inst.merchant}</div>}
                          </td>
                          <td className="py-3 px-3">{fmt(inst.total_amount)}</td>
                          <td className="py-3 px-3 font-medium text-rose-400">{fmt(inst.installment_amount)}</td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden min-w-[80px]">
                                <motion.div
                                  className="h-full rounded-full bg-emerald-500"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${pct}%` }}
                                  transition={{ duration: 0.6, ease: 'easeOut' }}
                                />
                              </div>
                              <span className="text-xs text-[hsl(var(--text-tertiary))] whitespace-nowrap">{inst.payments_made}/{inst.installment_count}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            {inst.credit_card ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-secondary))]">
                                💳 {inst.credit_card}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-3 px-3">
                            <span className="text-xs">{new Date(inst.end_date).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}</span>
                            <span className="text-xs text-[hsl(var(--text-tertiary))] ml-1">({remain}mo)</span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleMarkPayment(inst)} title="Log payment"
                                className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-400 transition-colors">
                                <CheckCircle2 className="h-4 w-4" />
                              </button>
                              <button onClick={() => openEdit(inst)} title="Edit"
                                className="p-1.5 rounded-lg hover:bg-blue-500/20 text-blue-400 transition-colors">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button onClick={() => setDeleteConfirm(inst.id)} title="Delete"
                                className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card layout */}
              <div className="sm:hidden space-y-3">
                {active.map(inst => {
                  const pct = (inst.payments_made / inst.installment_count) * 100
                  const remain = monthsRemaining(inst.end_date)
                  return (
                    <div key={inst.id} className="p-4 rounded-xl border border-[hsl(var(--border-subtle))] bg-[hsl(var(--bg-elevated))]">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-sm">{inst.name}</p>
                          {inst.merchant && <p className="text-xs text-[hsl(var(--text-tertiary))]">{inst.merchant}</p>}
                        </div>
                        <span className="text-sm font-bold text-rose-400">{fmt(inst.installment_amount)}/mo</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-2 rounded-full bg-[hsl(var(--bg-base))] overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-[hsl(var(--text-tertiary))]">{inst.payments_made}/{inst.installment_count}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-[hsl(var(--text-tertiary))]">
                        <span>{inst.credit_card ? `💳 ${inst.credit_card}` : ''} · Ends {new Date(inst.end_date).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })} ({remain}mo)</span>
                        <div className="flex gap-1">
                          <button onClick={() => handleMarkPayment(inst)} className="p-1 text-emerald-400"><CheckCircle2 className="h-4 w-4" /></button>
                          <button onClick={() => openEdit(inst)} className="p-1 text-blue-400"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setDeleteConfirm(inst.id)} className="p-1 text-red-400"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </GlassCard>

        {/* Completed */}
        {completed.length > 0 && (
          <GlassCard>
            <h2 className="text-base font-semibold mb-4 text-[hsl(var(--text-secondary))]">Completed ({completed.length})</h2>
            <div className="space-y-2">
              {completed.map(inst => (
                <div key={inst.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-[hsl(var(--bg-elevated))] opacity-60">
                  <div>
                    <span className="text-sm">{inst.name}</span>
                    {inst.merchant && <span className="text-xs text-[hsl(var(--text-tertiary))] ml-2">{inst.merchant}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[hsl(var(--text-tertiary))]">
                    <span>{fmt(inst.total_amount)}</span>
                    <span>✅ {inst.installment_count} payments</span>
                    <button onClick={() => setDeleteConfirm(inst.id)} className="p-1 text-red-400 hover:bg-red-500/20 rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit MSI Plan' : 'New MSI Plan'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Purchase Name *</label>
            <input className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. MacBook Pro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Merchant</label>
              <input className={inputCls} value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} placeholder="e.g. Liverpool" />
            </div>
            <div>
              <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Credit Card</label>
              <input className={inputCls} value={form.credit_card} onChange={e => setForm(f => ({ ...f, credit_card: e.target.value }))} placeholder="e.g. BBVA Platinum" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Total Amount (MXN) *</label>
              <input type="number" className={inputCls} value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} placeholder="25000" />
            </div>
            <div>
              <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">MSI Months *</label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-1">
                {MSI_PRESETS.map(n => (
                  <button key={n} onClick={() => setForm(f => ({ ...f, installment_count: String(n) }))}
                    className={cn("py-2 rounded-lg text-xs font-medium transition-all text-center",
                      form.installment_count === String(n) && MSI_PRESETS.includes(parseInt(form.installment_count))
                        ? "bg-blue-600 text-white"
                        : "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--bg-elevated))]/80"
                    )}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-[hsl(var(--text-tertiary))]">or custom:</span>
                <input
                  type="number"
                  min="1"
                  max="48"
                  placeholder="Custom"
                  className={cn(inputCls, "w-20 text-center")}
                  value={MSI_PRESETS.includes(parseInt(form.installment_count)) ? '' : form.installment_count}
                  onChange={e => setForm(f => ({ ...f, installment_count: e.target.value }))}
                />
              </div>
            </div>
          </div>
          {form.total_amount && form.installment_count && (
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm">
              Monthly payment: <strong className="text-blue-400">{fmt(parseFloat(form.total_amount) / parseInt(form.installment_count))}</strong> × {form.installment_count} months
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Start Date *</label>
              <input type="date" className={inputCls} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Category</label>
              <select className={inputCls} value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">None</option>
                {categories.filter(c => c.type !== 'income').map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Owner</label>
            <div className="flex gap-2 mt-1">
              {OWNERS.map(name => (
                <button key={name} type="button" onClick={() => setForm(f => ({ ...f, owner: name }))}
                  className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all border",
                    form.owner === name ? "border-blue-500 bg-blue-500/10 text-blue-400" : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))]"
                  )}>
                  <span className="inline-block h-2 w-2 rounded-full mr-1.5" style={{ background: getOwnerColor(name) }} />{name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-[hsl(var(--text-secondary))]">Notes</label>
            <textarea className={inputCls} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--bg-elevated))] transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.name || !form.total_amount}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
              {saving ? 'Saving…' : editId ? 'Update' : 'Add MSI Plan'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Installment?">
        <p className="text-sm text-[hsl(var(--text-secondary))] mb-4">This will permanently remove this MSI plan and its tracking history.</p>
        <div className="flex gap-3">
          <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-sm hover:bg-[hsl(var(--bg-elevated))] transition-colors">Cancel</button>
          <button onClick={() => deleteConfirm && handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors">Delete</button>
        </div>
      </Modal>
    </PageTransition>
  )
}
