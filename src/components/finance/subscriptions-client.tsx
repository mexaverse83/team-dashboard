'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2, Power } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { PageTransition } from '@/components/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'

import type { FinanceCategory, FinanceRecurring } from '@/lib/finance-types'
import { enrichRecurring } from '@/lib/finance-utils'

const inputCls = "w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-blue-500 transition-colors"

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

interface SubForm {
  name: string
  amount: string
  currency: string
  category_id: string
  frequency: string
  next_due_date: string
  merchant: string
  notes: string
}

const emptyForm: SubForm = { name: '', amount: '', currency: 'MXN', category_id: '', frequency: 'monthly', next_due_date: '', merchant: '', notes: '' }

export default function SubscriptionsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [recurring, setRecurring] = useState<FinanceRecurring[]>([])
  const [loading, setLoading] = useState(true)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SubForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [catRes, recRes] = await Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_recurring').select('*').order('next_due_date'),
    ])
    const cats = catRes.data || []
    const recs = recRes.data || []
    setCategories(cats)
    setRecurring(enrichRecurring(recs, cats))
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const active = recurring.filter(r => r.is_active)
  const monthlyBurn = useMemo(() => active.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0), [active])
  const annualBurn = monthlyBurn * 12

  const now = new Date()
  const weekFromNow = new Date(now.getTime() + 7 * 86400000)
  const upcoming = active.filter(r => {
    if (!r.next_due_date) return false
    const d = new Date(r.next_due_date)
    return d >= now && d <= weekFromNow
  })

  const updateForm = (patch: Partial<SubForm>) => setForm(f => ({ ...f, ...patch }))

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (sub: FinanceRecurring) => {
    setEditingId(sub.id)
    setForm({
      name: sub.name,
      amount: sub.amount.toString(),
      currency: sub.currency,
      category_id: sub.category_id,
      frequency: sub.frequency,
      next_due_date: sub.next_due_date || '',
      merchant: sub.merchant || '',
      notes: sub.notes || '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.amount || !form.category_id) return
    setSaving(true)
    const record = {
      name: form.name,
      amount: parseFloat(form.amount),
      currency: form.currency,
      category_id: form.category_id,
      frequency: form.frequency,
      next_due_date: form.next_due_date || null,
      merchant: form.merchant || null,
      notes: form.notes || null,
      is_active: true,
    }
    if (editingId) {
      await supabase.from('finance_recurring').update(record).eq('id', editingId)
    } else {
      await supabase.from('finance_recurring').insert(record)
    }
    setSaving(false)
    setModalOpen(false)
    fetchData()
  }

  const toggleActive = async (sub: FinanceRecurring) => {
    await supabase.from('finance_recurring').update({ is_active: !sub.is_active }).eq('id', sub.id)
    fetchData()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('finance_recurring').delete().eq('id', id)
    setDeleteConfirm(null)
    fetchData()
  }

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
          <p className="text-[hsl(var(--text-secondary))]">Recurring charges and subscription tracking</p>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> Add Subscription
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-3">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Monthly Burn</span>
          <p className="text-3xl font-bold text-rose-400 mt-1">${Math.round(monthlyBurn).toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Annual Projection</span>
          <p className="text-3xl font-bold text-amber-400 mt-1">${Math.round(annualBurn).toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Active</span>
          <AnimatedNumber value={active.length} className="text-3xl font-bold mt-1" />
        </GlassCard>
      </div>

      {/* Table */}
      <GlassCard>
        {recurring.length === 0 ? (
          <EmptyState icon="radio" title="No subscriptions" description="Track recurring charges to see your monthly burn" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {['', 'Name', 'Amount', 'Frequency', 'Next Due', 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recurring.map(sub => (
                  <tr key={sub.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors group">
                    <td className="py-3 px-4 text-lg">{sub.category?.icon}</td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium">{sub.name}</p>
                      <p className="text-xs text-[hsl(var(--text-tertiary))]">{sub.merchant}</p>
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold">${sub.amount.toLocaleString()} <span className="text-[hsl(var(--text-tertiary))] font-normal">{sub.currency}</span></td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" className="text-xs capitalize">{sub.frequency}</Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-[hsl(var(--text-secondary))]">{sub.next_due_date?.slice(5) || '—'}</td>
                    <td className="py-3 px-4">
                      <button onClick={() => toggleActive(sub)} className="inline-flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity" title="Toggle active">
                        <span className={cn("h-1.5 w-1.5 rounded-full", sub.is_active ? "bg-emerald-500" : "bg-gray-500")} />
                        {sub.is_active ? 'Active' : 'Paused'}
                      </button>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(sub)} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]">
                          <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" />
                        </button>
                        {deleteConfirm === sub.id ? (
                          <div className="flex gap-1">
                            <button onClick={() => handleDelete(sub.id)} className="px-1.5 py-0.5 rounded text-[10px] bg-rose-600 text-white">Del</button>
                            <button onClick={() => setDeleteConfirm(null)} className="px-1.5 py-0.5 rounded text-[10px] bg-[hsl(var(--bg-elevated))]">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(sub.id)} className="p-1 rounded hover:bg-rose-500/10">
                            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Upcoming */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-3">📅 Upcoming (Next 7 Days)</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-6">All clear — no bills due in the next 7 days</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(sub => (
              <div key={sub.id} className="flex items-center gap-3 p-2 rounded-lg bg-[hsl(var(--bg-elevated))]">
                <span className="text-sm">{sub.category?.icon}</span>
                <span className="text-sm font-medium flex-1">{sub.name}</span>
                <span className="text-xs text-[hsl(var(--text-secondary))]">{sub.next_due_date?.slice(5)}</span>
                <span className="text-sm font-semibold text-rose-400">${sub.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Subscription' : 'Add Subscription'}>
        <form onSubmit={e => { e.preventDefault(); handleSave() }} className="space-y-4">
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Name *</label>
            <input type="text" required placeholder="e.g., Netflix, Spotify..." value={form.name}
              onChange={e => updateForm({ name: e.target.value })} className={inputCls} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Amount *</label>
              <input type="number" step="0.01" min="0" required placeholder="0.00" value={form.amount}
                onChange={e => updateForm({ amount: e.target.value })} className={cn(inputCls, "font-semibold")} />
            </div>
            <div className="w-20">
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Currency</label>
              <select value={form.currency} onChange={e => updateForm({ currency: e.target.value })} className={inputCls}>
                <option>MXN</option><option>USD</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Category *</label>
            <select value={form.category_id} onChange={e => updateForm({ category_id: e.target.value })} className={inputCls} required>
              <option value="">Select category</option>
              {categories.filter(c => c.type === 'expense' || c.type === 'both').map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Frequency *</label>
              <select value={form.frequency} onChange={e => updateForm({ frequency: e.target.value })} className={inputCls}>
                {['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].map(f => (
                  <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Next Due</label>
              <input type="date" value={form.next_due_date} onChange={e => updateForm({ next_due_date: e.target.value })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Merchant</label>
            <input type="text" placeholder="e.g., Netflix Inc." value={form.merchant}
              onChange={e => updateForm({ merchant: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Notes</label>
            <textarea rows={2} placeholder="Optional notes..." value={form.notes}
              onChange={e => updateForm({ notes: e.target.value })} className={inputCls} />
          </div>
          <button type="submit" disabled={saving || !form.name || !form.amount || !form.category_id}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update Subscription' : 'Add Subscription'}
          </button>
        </form>
      </Modal>
    </div>
    </PageTransition>
  )
}
