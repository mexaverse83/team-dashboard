'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, DollarSign, TrendingUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { FinanceRecurringIncome } from '@/lib/finance-types'
import { cn } from '@/lib/utils'

const OWNER_LABELS: Record<string, string> = { bernardo: 'Bernardo', laura: 'Laura', joint: 'Joint' }
const CATEGORY_LABELS: Record<string, string> = {
  salary: 'Salary', freelance: 'Freelance', passive: 'Passive', bonus: 'Bonus', other: 'Other',
}
const RECURRENCE_LABELS: Record<string, string> = {
  monthly: 'Monthly', bimonthly: 'Bimonthly', annual: 'Annual',
}

const empty: Omit<FinanceRecurringIncome, 'id' | 'created_at' | 'updated_at'> = {
  name: '', amount: 0, owner: 'bernardo', category: 'salary',
  recurrence: 'monthly', day_of_month: 1, active: true, notes: null,
}

export function IncomeClient() {
  const [items, setItems] = useState<FinanceRecurringIncome[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FinanceRecurringIncome | null>(null)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/finance/recurring-income')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setItems(json.data || [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totalActive = useMemo(
    () => items.filter(i => i.active && i.recurrence === 'monthly').reduce((s, i) => s + i.amount, 0),
    [items]
  )

  const byOwner = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of items.filter(i => i.active && i.recurrence === 'monthly')) {
      m[i.owner] = (m[i.owner] || 0) + i.amount
    }
    return m
  }, [items])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...empty })
    setShowForm(true)
  }

  const openEdit = (item: FinanceRecurringIncome) => {
    setEditing(item)
    setForm({
      name: item.name, amount: item.amount, owner: item.owner,
      category: item.category, recurrence: item.recurrence,
      day_of_month: item.day_of_month, active: item.active, notes: item.notes,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.amount) return
    setSaving(true)
    try {
      const url = editing
        ? `/api/finance/recurring-income/${editing.id}`
        : '/api/finance/recurring-income'
      const method = editing ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setShowForm(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (item: FinanceRecurringIncome) => {
    try {
      await fetch(`/api/finance/recurring-income/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !item.active }),
      })
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deactivate this income source? (soft delete — can be re-enabled)')) return
    setDeleting(id)
    try {
      await fetch(`/api/finance/recurring-income/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[hsl(var(--foreground))]">Recurring Income</h1>
          <p className="text-sm text-[hsl(var(--text-secondary))] mt-0.5">
            Auto-registered on the 1st of each month
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Source
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Monthly</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">${totalActive.toLocaleString()}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">Active sources only</p>
        </GlassCard>
        {Object.entries(byOwner).map(([owner, amt]) => (
          <GlassCard key={owner} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-[hsl(var(--text-secondary))]" />
              <span className="text-xs uppercase tracking-wider text-[hsl(var(--text-secondary))]">{OWNER_LABELS[owner] || owner}</span>
            </div>
            <p className="text-2xl font-bold text-[hsl(var(--foreground))]">${amt.toLocaleString()}</p>
            <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">{Math.round((amt / totalActive) * 100)}% of household</p>
          </GlassCard>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">{error}</div>
      )}

      {/* Income list */}
      <GlassCard>
        {loading ? (
          <div className="p-8 text-center text-[hsl(var(--text-secondary))]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-[hsl(var(--text-secondary))]">No income sources yet. Add one above.</div>
        ) : (
          <div className="divide-y divide-[hsl(var(--border))]">
            {items.map(item => (
              <div key={item.id} className={cn("flex items-center gap-4 px-5 py-4", !item.active && "opacity-50")}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[hsl(var(--foreground))] truncate">{item.name}</span>
                    {item.active && (
                      <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Active</span>
                    )}
                    {!item.active && (
                      <span className="text-xs bg-zinc-500/20 text-zinc-400 px-2 py-0.5 rounded-full">Inactive</span>
                    )}
                  </div>
                  <p className="text-sm text-[hsl(var(--text-secondary))] mt-0.5">
                    {OWNER_LABELS[item.owner] || item.owner}
                    {' · '}{CATEGORY_LABELS[item.category] || item.category}
                    {' · '}{RECURRENCE_LABELS[item.recurrence] || item.recurrence}
                    {' · '}Day {item.day_of_month}
                  </p>
                  {item.notes && (
                    <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5 italic">{item.notes}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={cn("text-lg font-bold", item.active ? "text-emerald-400" : "text-[hsl(var(--text-secondary))]")}>
                    ${item.amount.toLocaleString()}
                  </p>
                  <p className="text-xs text-[hsl(var(--text-tertiary))]/mo">/mo</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Toggle active */}
                  <button
                    onClick={() => handleToggle(item)}
                    title={item.active ? 'Deactivate' : 'Activate'}
                    className={cn(
                      "w-10 h-5 rounded-full relative transition-colors",
                      item.active ? "bg-emerald-500" : "bg-zinc-700"
                    )}
                  >
                    <span className={cn(
                      "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                      item.active ? "left-5" : "left-0.5"
                    )} />
                  </button>
                  <button
                    onClick={() => openEdit(item)}
                    className="p-1.5 rounded text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={deleting === item.id}
                    className="p-1.5 rounded text-[hsl(var(--text-secondary))] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {/* Footer total */}
            <div className="flex items-center justify-between px-5 py-3 bg-[hsl(var(--accent))]/40">
              <span className="text-sm font-medium text-[hsl(var(--text-secondary))]">
                Total active monthly income
              </span>
              <span className="text-lg font-bold text-emerald-400">${totalActive.toLocaleString()}</span>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassCard className="w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
              {editing ? 'Edit Income Source' : 'Add Income Source'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[hsl(var(--text-secondary))] mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Nexaminds Salary"
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-[hsl(var(--text-secondary))] mb-1">Amount (MXN)</label>
                <input
                  type="number"
                  value={form.amount || ''}
                  onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                  placeholder="120000"
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[hsl(var(--text-secondary))] mb-1">Owner</label>
                  <select
                    value={form.owner}
                    onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-sm"
                  >
                    <option value="bernardo">Bernardo</option>
                    <option value="laura">Laura</option>
                    <option value="joint">Joint</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[hsl(var(--text-secondary))] mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value as FinanceRecurringIncome['category'] }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-sm"
                  >
                    <option value="salary">Salary</option>
                    <option value="freelance">Freelance</option>
                    <option value="passive">Passive</option>
                    <option value="bonus">Bonus</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[hsl(var(--text-secondary))] mb-1">Recurrence</label>
                  <select
                    value={form.recurrence}
                    onChange={e => setForm(f => ({ ...f, recurrence: e.target.value as FinanceRecurringIncome['recurrence'] }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-sm"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="bimonthly">Bimonthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[hsl(var(--text-secondary))] mb-1">Day of month</label>
                  <input
                    type="number"
                    min="1" max="28"
                    value={form.day_of_month}
                    onChange={e => setForm(f => ({ ...f, day_of_month: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[hsl(var(--text-secondary))] mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={form.notes || ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))}
                  placeholder="e.g. Annual review in March"
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active-toggle"
                  checked={form.active}
                  onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                  className="rounded"
                />
                <label htmlFor="active-toggle" className="text-sm text-[hsl(var(--foreground))]">
                  Active (auto-register monthly)
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] text-sm hover:bg-[hsl(var(--accent))] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.amount}
                className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Source'}
              </button>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Recurring badge note */}
      <div className="flex items-center gap-2 text-xs text-[hsl(var(--text-tertiary))]">
        <RefreshCw className="w-3.5 h-3.5" />
        <span>
          Auto-registered entries appear in Transactions with a{' '}
          <span className="text-emerald-400 font-medium">🔁</span>{' '}
          badge. The daily cron runs at 06:00 UTC (midnight CST).
        </span>
      </div>
    </div>
  )
}
