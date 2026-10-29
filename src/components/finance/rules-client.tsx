'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Sparkles, Check, X, Wand2 } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { Modal } from '@/components/ui/modal'
import { PageTransition } from '@/components/page-transition'
import { Page, PageHeader } from '@/components/ui/page'
import { Button } from '@/components/ui/button'
import { CategoryIcon } from '@/components/ui/category-icon'
import { AlertCard } from '@/components/ui/alert-card'
import { ErrorState } from '@/components/ui/error-state'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { FinanceCategory } from '@/lib/finance-types'
import type { FinanceRule } from '@/lib/finance-rules'
import { DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import { OWNERS } from '@/lib/owners'

import { inputCls } from '@/lib/form-style'

const labelCls = 'text-xs text-fg-secondary mb-1 block'

interface RuleForm {
  merchant_pattern: string
  match_mode: 'contains' | 'exact' | 'starts_with'
  category_id: string
  amount_min: string
  amount_max: string
  owner: string
  priority: number
  is_active: boolean
  notes: string
}

const emptyForm: RuleForm = {
  merchant_pattern: '',
  match_mode: 'contains',
  category_id: '',
  amount_min: '',
  amount_max: '',
  owner: '',
  priority: 100,
  is_active: true,
  notes: '',
}

interface LearnProposal {
  merchant_pattern: string
  category_id: string
  occurrences: number
  confidence: number
  example_amounts: number[]
  category?: { name: string; icon: string } | null
}

export default function RulesClient() {
  const [rules, setRules] = useState<FinanceRule[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RuleForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Learn state
  const [learnModalOpen, setLearnModalOpen] = useState(false)
  const [proposals, setProposals] = useState<LearnProposal[]>([])
  const [learning, setLearning] = useState(false)
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set())

  // A failed read is an error, never "No rules yet" (which invites re-creating them).
  const [loadError, setLoadError] = useState(false)
  const fetchData = async () => {
    const [rulesRes, catsRes] = await Promise.all([
      fetch('/api/finance/rules').then(r => r.ok ? r.json() : null).catch(() => null),
      supabase.from('finance_categories').select('*').order('sort_order'),
    ])
    setLoadError(!rulesRes)
    setRules(rulesRes?.rules || [])
    setCategories((catsRes.data && catsRes.data.length > 0) ? catsRes.data : DEFAULT_CATEGORIES)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const categoryMap = useMemo(() => {
    const m: Record<string, FinanceCategory> = {}
    for (const c of categories) m[c.id] = c
    return m
  }, [categories])

  const openCreate = () => {
    setForm(emptyForm)
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (rule: FinanceRule) => {
    setForm({
      merchant_pattern: rule.merchant_pattern,
      match_mode: rule.match_mode,
      category_id: rule.category_id || '',
      amount_min: rule.amount_min?.toString() || '',
      amount_max: rule.amount_max?.toString() || '',
      owner: rule.owner || '',
      priority: rule.priority,
      is_active: rule.is_active,
      notes: rule.notes || '',
    })
    setEditingId(rule.id)
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.merchant_pattern || !form.category_id) return
    setSaving(true)
    const payload = {
      merchant_pattern: form.merchant_pattern,
      match_mode: form.match_mode,
      category_id: form.category_id,
      amount_min: form.amount_min ? parseFloat(form.amount_min) : null,
      amount_max: form.amount_max ? parseFloat(form.amount_max) : null,
      owner: form.owner || null,
      priority: form.priority,
      is_active: form.is_active,
      notes: form.notes || null,
    }
    const res = await fetch('/api/finance/rules', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
    })
    setSaving(false)
    if (res.ok) {
      setModalOpen(false)
      await fetchData()
    } else {
      alert('Failed to save rule')
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this rule? Existing transactions are not affected.')) return
    await fetch(`/api/finance/rules?id=${id}`, { method: 'DELETE' })
    await fetchData()
  }

  const toggle = async (id: string, isActive: boolean) => {
    await fetch('/api/finance/rules', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !isActive }),
    })
    await fetchData()
  }

  const runLearn = async () => {
    setLearning(true)
    const res = await fetch('/api/finance/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'learn', dry_run: true, min_occurrences: 3, confidence_threshold: 0.8 }),
    })
    setLearning(false)
    if (res.ok) {
      const data = await res.json()
      const props = (data.proposals || []) as LearnProposal[]
      // Filter out merchants for which a rule already exists
      const existing = new Set(rules.map(r => r.merchant_pattern.toLowerCase()))
      const filtered = props.filter(p => !existing.has(p.merchant_pattern.toLowerCase()))
      setProposals(filtered)
      setSelectedProposals(new Set(filtered.map(p => p.merchant_pattern)))
      setLearnModalOpen(true)
    }
  }

  const applyLearned = async () => {
    setLearning(true)
    const toCreate = proposals.filter(p => selectedProposals.has(p.merchant_pattern))
    for (const p of toCreate) {
      await fetch('/api/finance/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_pattern: p.merchant_pattern,
          match_mode: 'contains',
          category_id: p.category_id,
          notes: `Learned from ${p.occurrences} transactions (${Math.round(p.confidence * 100)}% confidence)`,
        }),
      })
    }
    // Mark these as learned via a separate update (simpler than passing learned in POST)
    setLearning(false)
    setLearnModalOpen(false)
    await fetchData()
  }

  const toggleProposal = (pattern: string) => {
    setSelectedProposals(s => {
      const next = new Set(s)
      if (next.has(pattern)) next.delete(pattern)
      else next.add(pattern)
      return next
    })
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-surface-2 animate-pulse" />
        <div className="h-64 rounded-xl bg-surface-2 animate-pulse" />
      </div>
    )
  }

  return (
    <PageTransition>
      <Page>
        <PageHeader
          title="Auto Rules"
          description="Automatically categorize transactions based on merchant patterns"
          actions={<>
            <Button variant="secondary" onClick={runLearn} disabled={learning}>
              <Wand2 className="h-4 w-4" aria-hidden="true" /> {learning ? 'Analyzing…' : 'Learn from history'}
            </Button>
            <Button onClick={openCreate} className="flex-1 sm:flex-none"><Plus className="h-4 w-4" aria-hidden="true" /> New rule</Button>
          </>}
        />

        {loadError ? (
          <GlassCard><ErrorState compact title="Couldn't load your rules" body="Your rules are safe; this page just couldn't read them." onRetry={() => { void fetchData() }} /></GlassCard>
        ) : rules.length === 0 ? (
          <AlertCard
            severity="info"
            title="No rules yet"
            description={<>Click <strong>Learn from history</strong> to auto-create rules from your past transactions, or add manual rules.</>}
          />
        ) : (
          <GlassCard>
            <div className="hidden sm:grid grid-cols-12 gap-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-secondary pb-3 border-b border-border">
              <div className="col-span-4">Merchant pattern</div>
              <div className="col-span-3">Category</div>
              <div className="col-span-1 text-center">Owner</div>
              <div className="col-span-1 text-right">Matches</div>
              <div className="col-span-1 text-center">Active</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>
            {rules.map(rule => {
              const cat = rule.category_id ? categoryMap[rule.category_id] : null
              return (
                <div
                  key={rule.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 items-center py-3 border-b border-border last:border-0 text-sm sm:grid-cols-12 sm:gap-3"
                >
                  <div className="col-start-1 row-span-2 row-start-1 min-w-0 sm:col-span-4 sm:col-start-auto sm:row-span-1 sm:row-start-auto">
                    <p className="font-medium flex min-w-0 items-center gap-2">
                      <code className="min-w-0 truncate px-1.5 py-0.5 rounded bg-surface-2 text-xs font-mono">{rule.merchant_pattern}</code>
                      {rule.learned && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-info/10 px-1.5 py-0.5 text-[0.6875rem] font-medium text-info">
                          <Sparkles className="h-2.5 w-2.5" /> Learned
                        </span>
                      )}
                    </p>
                    <p className="text-[0.6875rem] text-fg-tertiary mt-0.5">
                      {rule.match_mode}
                      {rule.amount_min != null && ` · min $${rule.amount_min}`}
                      {rule.amount_max != null && ` · max $${rule.amount_max}`}
                      {rule.notes && ` · ${rule.notes}`}
                    </p>
                    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-fg-secondary sm:hidden">
                      {cat ? <span className="min-w-0 truncate">{cat.name}</span> : <span className="text-fg-tertiary">—</span>}
                      <span className="shrink-0 text-fg-tertiary">· {rule.owner || 'all'} · {rule.match_count} matches</span>
                    </p>
                  </div>
                  <div className="hidden sm:block col-span-3">
                    {cat ? (
                      <span className="inline-flex items-center gap-2 text-sm">
                        <CategoryIcon name={cat.name} emoji={cat.icon} colorIndex={cat.sort_order} size={24} />
                        <span>{cat.name}</span>
                      </span>
                    ) : (
                      <span className="text-fg-tertiary">—</span>
                    )}
                  </div>
                  <div className="hidden sm:block col-span-1 text-center text-xs">
                    {rule.owner || <span className="text-fg-tertiary">all</span>}
                  </div>
                  <div className="hidden sm:block col-span-1 text-right tabular-nums text-xs text-fg-secondary">
                    {rule.match_count}
                  </div>
                  <div className="col-start-2 row-start-1 flex justify-end sm:col-span-1 sm:col-start-auto sm:row-start-auto sm:justify-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.is_active}
                      onClick={() => toggle(rule.id, rule.is_active)}
                      className="flex h-11 w-11 items-center justify-center"
                      aria-label={`Rule ${rule.merchant_pattern} active`}
                    >
                      <span className={cn(
                        'relative block h-5 w-9 rounded-full transition-colors',
                        rule.is_active ? 'bg-positive' : 'bg-surface-3'
                      )}>
                        <span
                          className={cn(
                            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all',
                            rule.is_active ? 'left-4' : 'left-0.5'
                          )}
                        />
                      </span>
                    </button>
                  </div>
                  <div className="col-start-2 row-start-2 -mr-1.5 flex justify-end gap-1 sm:col-span-2 sm:col-start-auto sm:row-start-auto sm:mr-0">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(rule)} aria-label={`Edit rule ${rule.merchant_pattern}`}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(rule.id)} className="hover:bg-negative-bg hover:text-negative"
                      aria-label={`Delete rule ${rule.merchant_pattern}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </GlassCard>
        )}

        {/* Create/Edit Modal */}
        <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit rule' : 'New rule'}>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>Merchant pattern</label>
              <input
                className={inputCls}
                value={form.merchant_pattern}
                onChange={e => setForm(f => ({ ...f, merchant_pattern: e.target.value }))}
                placeholder="e.g. Netflix"
                autoFocus
              />
            </div>
            <div>
              <label className={labelCls}>Match mode</label>
              <select
                className={inputCls}
                value={form.match_mode}
                onChange={e => setForm(f => ({ ...f, match_mode: e.target.value as RuleForm['match_mode'] }))}
              >
                <option value="contains">Contains (recommended)</option>
                <option value="exact">Exact match</option>
                <option value="starts_with">Starts with</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select
                className={inputCls}
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
              >
                <option value="">— Select category —</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Min amount (optional)</label>
                <input
                  className={inputCls}
                  type="number"
                  value={form.amount_min}
                  onChange={e => setForm(f => ({ ...f, amount_min: e.target.value }))}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelCls}>Max amount (optional)</label>
                <input
                  className={inputCls}
                  type="number"
                  value={form.amount_max}
                  onChange={e => setForm(f => ({ ...f, amount_max: e.target.value }))}
                  placeholder="—"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>Owner (optional)</label>
              <select
                className={inputCls}
                value={form.owner}
                onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              >
                <option value="">All owners</option>
                {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Notes (optional)</label>
              <input
                className={inputCls}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Streaming subscription"
              />
            </div>
            <div className="flex items-center gap-2 pt-2 justify-end">
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !form.merchant_pattern || !form.category_id}>
                {saving ? 'Saving…' : editingId ? 'Save' : 'Create rule'}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Learn proposals modal */}
        <Modal
          open={learnModalOpen}
          onClose={() => setLearnModalOpen(false)}
          title={`Learned ${proposals.length} rule proposal${proposals.length !== 1 ? 's' : ''}`}
        >
          <div className="space-y-3">
            {proposals.length === 0 ? (
              <p className="text-sm text-fg-tertiary text-center py-6">
                No new patterns found. Either you don&apos;t have enough transaction history, or rules already exist for the consistent merchants.
              </p>
            ) : (
              <>
                <p className="text-xs text-fg-secondary">
                  Patterns where ≥ 3 transactions share the same category at ≥ 80% confidence. Toggle off any you don&apos;t want.
                </p>
                <div className="max-h-[50vh] overflow-y-auto space-y-2">
                  {proposals.map(p => {
                    const selected = selectedProposals.has(p.merchant_pattern)
                    return (
                      <button
                        key={p.merchant_pattern}
                        onClick={() => toggleProposal(p.merchant_pattern)}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors',
                          selected ? 'border-primary/50 bg-primary/10' : 'border-border bg-surface-2'
                        )}
                      >
                        <div
                          className={cn(
                            'h-5 w-5 rounded shrink-0 flex items-center justify-center',
                            selected ? 'btn-primary' : 'border border-border-strong bg-surface'
                          )}
                        >
                          {selected && <Check className="h-3 w-3" aria-hidden="true" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">
                            <code className="px-1.5 py-0.5 rounded bg-surface-2 text-xs">{p.merchant_pattern}</code>
                            <span className="text-fg-secondary ml-2">→</span>{' '}
                            {p.category && <span>{p.category.icon} {p.category.name}</span>}
                          </p>
                          <p className="text-[0.6875rem] text-fg-tertiary mt-1">
                            {p.occurrences} matches · {Math.round(p.confidence * 100)}% confidence
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-fg-secondary">
                    {selectedProposals.size} of {proposals.length} selected
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" onClick={() => setLearnModalOpen(false)}>Cancel</Button>
                    <Button onClick={applyLearned} disabled={learning || selectedProposals.size === 0}>
                      {learning ? 'Creating…' : `Create ${selectedProposals.size} rule${selectedProposals.size !== 1 ? 's' : ''}`}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Modal>
      </Page>
    </PageTransition>
  )
}
