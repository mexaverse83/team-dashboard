'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, RefreshCw, AlertTriangle } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { Page, PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { MoneyText } from '@/components/ui/money-text'
import { StatusPill } from '@/components/ui/status-pill'
import { FinanceRecurringIncome } from '@/lib/finance-types'
import { cn } from '@/lib/utils'
import { OWNERS } from '@/lib/owners'
import { localDateKey } from '@/lib/dates'
import { formatDateShort, formatMoney } from '@/lib/format'

const OWNER_LABELS: Record<string, string> = { bernardo: OWNERS[0], laura: OWNERS[1], joint: 'Joint' }
const CATEGORY_LABELS: Record<string, string> = {
  salary: 'Salary', freelance: 'Freelance', passive: 'Passive', bonus: 'Bonus', other: 'Other',
}
const RECURRENCE_LABELS: Record<string, string> = {
  monthly: 'Monthly', bimonthly: 'Bimonthly', annual: 'Annual',
}

const empty: Omit<FinanceRecurringIncome, 'id' | 'created_at' | 'updated_at'> = {
  name: '', amount: 0, owner: 'bernardo', category: 'salary',
  recurrence: 'monthly', day_of_month: 1, active: true, notes: null, start_date: null,
}

const todayStr = () => localDateKey()

// end_date / pay_month arrive with WS6's recurring-income versioning; optional until then.
type IncomeRow = FinanceRecurringIncome & { end_date?: string | null; pay_month?: number | null }

const hasEnded = (i: IncomeRow) => !!i.end_date && i.end_date < todayStr()

/**
 * Active rows that share a name. The processor dedupes postings by name, so
 * two live "Freelance" rows race and the month's post flips between them (AUTO-11).
 */
export function duplicateActiveNames(items: IncomeRow[]): Array<{ name: string; amounts: number[] }> {
  const groups = new Map<string, IncomeRow[]>()
  for (const item of items) {
    if (!item.active || hasEnded(item)) continue
    const key = item.name.trim().toLowerCase()
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return Array.from(groups.values()).filter(g => g.length > 1).map(g => ({ name: g[0].name, amounts: g.map(i => i.amount) }))
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// A row with a future start_date is configured but not yet earning — the
// processor skips it and the summary excludes it, so totals here must too.
const hasStarted = (i: FinanceRecurringIncome) => !i.start_date || i.start_date <= todayStr()

export function IncomeClient() {
  const [items, setItems] = useState<IncomeRow[]>([])
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

  const duplicates = useMemo(() => duplicateActiveNames(items), [items])

  const totalActive = useMemo(
    () => items.filter(i => i.active && i.recurrence === 'monthly' && hasStarted(i)).reduce((s, i) => s + i.amount, 0),
    [items]
  )

  const byOwner = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of items.filter(i => i.active && i.recurrence === 'monthly' && hasStarted(i))) {
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
      start_date: item.start_date ?? null,
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
    <Page>
      <PageHeader
        title="Recurring Income"
        description="Auto-registered on the 1st of each month"
        actions={<Button onClick={openAdd} className="w-full sm:w-auto"><Plus className="h-4 w-4" aria-hidden="true" /> Add source</Button>}
      />

      {duplicates.length > 0 && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning-bg p-3 text-sm text-fg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <div className="space-y-1">
            {duplicates.map(d => (
              <p key={d.name}>
                <strong>{d.amounts.length} active sources are named &ldquo;{d.name}&rdquo;</strong> ({d.amounts.map(a => formatMoney(a)).join(' and ')}).
                Only one posts each month and which one can change, so deactivate the old amount or give it an end date.
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <GlassCard className="col-span-2 p-4 sm:col-span-1">
          <p className="mb-1 text-label font-medium text-fg-tertiary">Total monthly</p>
          <MoneyText value={totalActive} className="num-metric block text-left text-2xl font-semibold text-fg" />
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">Active sources only</p>
        </GlassCard>
        {Object.entries(byOwner).map(([owner, amt]) => (
          <GlassCard key={owner} className="p-4">
            <p className="mb-1 truncate text-label font-medium text-fg-tertiary">{OWNER_LABELS[owner] || owner}</p>
            <MoneyText value={amt} className="num-metric block text-left text-2xl font-semibold text-fg" />
            <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">{Math.round((amt / totalActive) * 100)}% of household</p>
          </GlassCard>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-600 text-sm">{error}</div>
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
              <div key={item.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-1 py-3 hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors sm:flex sm:gap-4 sm:px-4 sm:py-2.5", !item.active && "opacity-50")}>
                <div className="row-span-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[hsl(var(--foreground))] truncate">{item.name}</span>
                    {item.active && !hasStarted(item) && <StatusPill tone="neutral">Starts {formatDateShort(item.start_date!)}</StatusPill>}
                    {item.active && hasStarted(item) && item.end_date && !hasEnded(item) && <StatusPill tone="neutral">Ends {formatDateShort(item.end_date)}</StatusPill>}
                    {item.active && hasEnded(item) && <StatusPill tone="neutral">Ended {formatDateShort(item.end_date!)}</StatusPill>}
                    {!item.active && <StatusPill tone="neutral">Inactive</StatusPill>}
                  </div>
                  <p className="flex items-center gap-1.5 flex-wrap text-sm text-[hsl(var(--text-secondary))] mt-0.5">
                    <span>{OWNER_LABELS[item.owner] || item.owner}</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] bg-[hsl(var(--bg-elevated))]">{CATEGORY_LABELS[item.category] || item.category}</span>
                    <span className="text-xs text-[hsl(var(--text-tertiary))]">{RECURRENCE_LABELS[item.recurrence] || item.recurrence}{item.pay_month ? ` · ${MONTH_NAMES[item.pay_month - 1] ?? ''}` : ''}{' · '}Day {item.day_of_month}</span>
                  </p>
                  {item.notes && (
                    <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5 italic">{item.notes}</p>
                  )}
                </div>
                <div className="text-right shrink-0 self-end sm:self-auto">
                  <MoneyText value={item.amount} sign="always" className={cn("num-metric block whitespace-nowrap text-base font-semibold sm:text-lg", item.active ? "text-positive" : "text-fg-secondary")} />
                  <p className="text-xs text-[hsl(var(--text-tertiary))]">/mo</p>
                </div>
                <div className="-mr-1.5 flex items-center justify-end gap-0.5 shrink-0 self-start sm:mr-0 sm:gap-1 sm:self-auto">
                  {/* Toggle active — 40px touch target wrapping the 40×20 track */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item.active}
                    aria-label={`${item.name} auto-registers monthly`}
                    onClick={() => handleToggle(item)}
                    title={item.active ? 'Deactivate' : 'Activate'}
                    className="flex h-11 w-12 items-center justify-center"
                  >
                    <span className={cn(
                      "relative block w-10 h-5 rounded-full transition-colors",
                      item.active ? "bg-positive" : "bg-surface-3"
                    )}>
                      <span className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                        item.active ? "left-5" : "left-0.5"
                      )} />
                    </span>
                  </button>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Deactivate ${item.name}`} onClick={() => handleDelete(item.id)} disabled={deleting === item.id} className="hover:text-negative">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
            {/* Footer total */}
            <div className="flex items-center justify-between gap-3 px-3 py-3 bg-[hsl(var(--accent))]/40 sm:px-5">
              <span className="text-sm font-medium text-[hsl(var(--text-secondary))]">
                Total active monthly income
              </span>
              <MoneyText value={totalActive} sign="always" className="num-metric shrink-0 whitespace-nowrap text-lg font-semibold text-positive" />
            </div>
          </div>
        )}
      </GlassCard>

      {/* Add/Edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <GlassCard className="w-full max-w-md max-h-full overflow-y-auto overscroll-contain space-y-4 p-4 sm:p-6">
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
                    <option value="bernardo">{OWNERS[0]}</option>
                    <option value="laura">{OWNERS[1]}</option>
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
                <label className="block text-xs text-[hsl(var(--text-secondary))] mb-1">Starts on (optional)</label>
                <input
                  type="date"
                  value={form.start_date || ''}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value || null }))}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] text-sm"
                />
                <p className="mt-1 text-[11px] text-[hsl(var(--text-tertiary))]">
                  Until this date the income is ignored — it won&apos;t auto-post or count in projections. Use it for raises or income that begins next month.
                </p>
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

      <p className="flex items-center gap-2 text-label text-fg-tertiary">
        <RefreshCw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Auto-registered entries show the repeat icon in Transactions. The daily automation posts them on their day.
      </p>
    </Page>
  )
}
