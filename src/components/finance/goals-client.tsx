'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Plus, Pencil, Trash2, MoreHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatusPill } from '@/components/ui/status-pill'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import type { FinanceGoal } from '@/lib/finance-types'
import { OWNERS, getOwnerName, getOwnerColor, ownersEqual } from '@/lib/owners'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar } from 'recharts'
import type { FinanceMonthlySavings } from '@/lib/finance-types'

import { parseLocalDateKey } from '@/lib/transaction-entry'
import { inputCls } from '@/lib/form-style'
import { tooltipStyle, CHART_TOOLTIP_STYLE } from '@/lib/chart-style'
import { CHART } from '@/lib/chart-theme'
import { isCryptoGoal, isGoalOverdue, monthlyNeeded, monthsRemaining, type CalendarDay } from '@/lib/finance-utils'
import { diffDaysKey, mexicoCityDateParts } from '@/lib/dates'
import { formatCompact, formatMoney } from '@/lib/format'
import { cryptoQuantities } from '@/lib/summary/crypto'

function vehicleForHorizon(months: number): string {
  if (months <= 6) return 'CETES 28 días / Hey Banco'
  if (months <= 12) return 'CETES 91-182 días'
  if (months <= 24) return 'CETES 364 días / Nu cuenta'
  if (months <= 60) return 'GBM+ Smart Cash / Fintual'
  return 'VOO via GBM+ / ETFs'
}

const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL']
const COIN_ICONS: Record<string, string> = { BTC: '₿', ETH: 'Ξ', SOL: '◎' }
const COIN_SOLIDS: Record<string, string> = { BTC: 'bg-orange-500', ETH: 'bg-indigo-500', SOL: 'bg-purple-500' }

interface GoalForm {
  name: string; icon: string; target_amount: string; current_amount: string
  target_date: string; monthly_contribution: string; priority: string
  scope: 'personal' | 'shared'; owner: string
  goal_type: 'savings' | 'crypto'; crypto_symbol: string
}
const emptyForm: GoalForm = { name: '', icon: '🎯', target_amount: '', current_amount: '0', target_date: '', monthly_contribution: '', priority: '1', scope: 'shared', owner: '', goal_type: 'savings', crypto_symbol: '' }

const compact = (n: number) => Math.abs(n) >= 100_000 ? formatCompact(n) : formatMoney(n)
const coins = (n: number) => n.toFixed(8).replace(/\.?0+$/, '') || '0'

function today(): CalendarDay & { key: string } {
  const mx = mexicoCityDateParts()
  return { year: mx.year, month: mx.month, day: mx.day, key: `${mx.year}-${String(mx.month).padStart(2, '0')}-${String(mx.day).padStart(2, '0')}` }
}

/** Where the goal should be today on a straight line from its creation to its date. */
function paceTarget(g: FinanceGoal, todayKey: string): number | null {
  if (!g.target_date || !g.created_at) return null
  const total = diffDaysKey(g.created_at.slice(0, 10), g.target_date.slice(0, 10))
  if (total <= 0) return null
  const elapsed = Math.min(total, Math.max(0, diffDaysKey(g.created_at.slice(0, 10), todayKey)))
  return g.target_amount * (elapsed / total)
}

/** ⋯ menu: focus moves in on open, Escape / focus leaving / outside press close it and focus returns to the trigger. */
function GoalActionsMenu({ name, open, onOpenChange, onEdit, onDelete }: {
  name: string; open: boolean; onOpenChange: (open: boolean) => void; onEdit: () => void; onDelete: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) onOpenChange(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, onOpenChange])

  const close = () => onOpenChange(false)
  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); triggerRef.current?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); items[(index + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus() }
    else if (e.key === 'Tab') close()
  }

  return (
    <div className="relative">
      <button ref={triggerRef} type="button" aria-label={`Actions for ${name}`} aria-haspopup="menu" aria-expanded={open}
        onClick={e => { e.stopPropagation(); onOpenChange(!open) }}
        className="-mr-2 inline-flex h-9 w-9 items-center justify-center rounded-md text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-elevated))]">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div ref={menuRef} role="menu" onKeyDown={onKeyDown}
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close() }}
          className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-surface py-1 shadow-lg" onClick={e => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => { close(); onEdit() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--bg-elevated))] focus:bg-[hsl(var(--bg-elevated))] focus:outline-none">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          <button type="button" role="menuitem" onClick={() => { close(); triggerRef.current?.focus(); onDelete() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-negative hover:bg-[hsl(var(--bg-elevated))] focus:bg-[hsl(var(--bg-elevated))] focus:outline-none">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

function KpiTile({ label, value, hint, tone = 'neutral', wide = false }: { label: string; value: string; hint?: string; tone?: 'neutral' | 'positive' | 'warning' | 'negative'; wide?: boolean }) {
  return (
    <GlassCard className={cn('min-w-0 p-4', wide && 'col-span-2 lg:col-span-1')}>
      <span className="block text-label font-medium text-[hsl(var(--text-secondary))]">{label}</span>
      <p className="num-metric mt-1 truncate text-2xl font-semibold tabular-nums" data-money="">{value}</p>
      {hint && (
        // Plain concatenation: tailwind-merge reads text-label and text-warning
        // as two font sizes and drops the label size.
        <p className={`mt-0.5 truncate text-label ${tone === 'positive' ? 'text-positive' : tone === 'warning' ? 'text-warning' : tone === 'negative' ? 'text-negative' : 'text-[hsl(var(--text-tertiary))]'}`}>
          {hint}
        </p>
      )}
    </GlassCard>
  )
}

export default function GoalsClient() {
  const [goals, setGoals] = useState<FinanceGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)
  const [whatIfAmount, setWhatIfAmount] = useState(0)
  const [cryptoData, setCryptoData] = useState<{ holdings: { symbol: string; quantity: number; owner: string }[]; prices: Record<string, { usd: number; mxn: number }> | null }>({ holdings: [], prices: null })

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<GoalForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const setMenuOpenFor = useCallback((id: string) => (open: boolean) => setMenuFor(cur => (open ? id : cur === id ? null : cur)), [])
  const [monthlySavings, setMonthlySavings] = useState<FinanceMonthlySavings[]>([])
  const [savingsChart, setSavingsChart] = useState<Record<string, number | string>[]>([])
  const [scopeFilter, setScopeFilter] = useState<'all' | 'shared' | string>('all')
  const [defaultOwner, setDefaultOwner] = useState('')
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setDefaultOwner(getOwnerName(data.user?.email ?? undefined))) }, [])

  const fetchData = useCallback(async () => {
    // Monthly savings comes through the server route (service role): the
    // anon key can't read finance_monthly_savings, which left three tiles
    // permanently empty.
    const [goalsRes, cryptoRes, savingsRes] = await Promise.all([
      supabase.from('finance_goals').select('*').order('priority'),
      fetch('/api/finance/crypto').then(r => r.text()).then(t => t ? JSON.parse(t) : { holdings: [], prices: null }).catch(() => ({ holdings: [], prices: null })),
      fetch('/api/finance/monthly-savings?months=6&owner=all').then(r => r.json()).catch(() => ({ data: [], chart: [] })),
    ])
    setGoals(goalsRes.data || [])
    setCryptoData({ holdings: Array.isArray(cryptoRes?.holdings) ? cryptoRes.holdings : [], prices: cryptoRes?.prices ?? null })
    setMonthlySavings(Array.isArray(savingsRes?.data) ? savingsRes.data : [])
    setSavingsChart(Array.isArray(savingsRes?.chart) ? savingsRes.chart : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(); const h = () => { if (document.visibilityState === "visible") fetchData() }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h) }, [fetchData])

  const asOf = today()
  const qty = useMemo(() => cryptoQuantities(cryptoData.holdings), [cryptoData.holdings])
  const holdingsKnown = cryptoData.holdings.length > 0
  // Crypto goals track summed holdings (both owners); when holdings can't be
  // read, fall back to the goal's stored amount rather than showing 0.
  const getCryptoQty = useCallback((symbol: string) => qty[symbol.toUpperCase()] ?? 0, [qty])
  const goalCurrent = useCallback((g: FinanceGoal) => isCryptoGoal(g) && g.crypto_symbol && holdingsKnown ? getCryptoQty(g.crypto_symbol) : g.current_amount, [getCryptoQty, holdingsKnown])
  const getCryptoMXN = useCallback((symbol: string) => getCryptoQty(symbol) * (cryptoData.prices?.[symbol]?.mxn ?? 0), [getCryptoQty, cryptoData.prices])

  const filteredGoals = useMemo(() => {
    if (scopeFilter === 'all') return goals
    if (scopeFilter === 'shared') return goals.filter(g => g.scope === 'shared')
    return goals.filter(g => g.scope === 'personal' && ownersEqual(g.owner, scopeFilter))
  }, [goals, scopeFilter])

  // KPIs — pesos only: a "1 BTC" goal never adds $1 to a peso total.
  const activeGoals = filteredGoals.filter(g => !g.is_completed)
  const pesoGoals = activeGoals.filter(g => !isCryptoGoal(g))
  const openPeso = pesoGoals.filter(g => !isGoalOverdue(g, asOf))
  const overdue = pesoGoals.filter(g => isGoalOverdue(g, asOf) && g.current_amount < g.target_amount)
  const totalTarget = pesoGoals.reduce((s, g) => s + g.target_amount, 0)
  const totalSaved = pesoGoals.reduce((s, g) => s + g.current_amount, 0)
  const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0
  const totalMonthlyNeeded = openPeso.reduce((s, g) => s + monthlyNeeded(g, asOf), 0)
  const totalContributing = openPeso.reduce((s, g) => s + (g.monthly_contribution || 0), 0)

  const totalSnapshots = monthlySavings.filter(m => m.owner === 'total')
  const lastTotal = totalSnapshots.length > 0 ? totalSnapshots[totalSnapshots.length - 1] : null
  const avgNetSavings = totalSnapshots.length > 0
    ? totalSnapshots.reduce((s, m) => s + m.net_savings, 0) / totalSnapshots.length
    : 0

  const getLastActual = (ownerName: string) => {
    const ownerSnaps = monthlySavings.filter(m => ownersEqual(m.owner, ownerName))
    return ownerSnaps.length > 0 ? ownerSnaps[ownerSnaps.length - 1].net_savings : null
  }

  type GoalStatus = { tone: 'negative' | 'warning'; label: string } | null
  // A pill only when something is off: overdue, behind on last month's
  // snapshot, or behind the straight-line pace to the target date.
  const getGoalStatus = (g: FinanceGoal): GoalStatus => {
    const current = goalCurrent(g)
    if (current >= g.target_amount) return null
    if (!isCryptoGoal(g) && isGoalOverdue(g, asOf)) return { tone: 'negative', label: 'Overdue — roll over' }
    if (!isCryptoGoal(g) && g.owner) {
      const lastActual = getLastActual(g.owner)
      const required = monthlyNeeded(g, asOf)
      if (lastActual !== null && required > 0) {
        if (lastActual >= required) return null
        return lastActual >= required * 0.8 ? { tone: 'warning', label: 'Slightly behind' } : { tone: 'negative', label: 'Behind' }
      }
    }
    const pace = paceTarget(g, asOf.key)
    return pace != null && current < pace * 0.95 ? { tone: 'warning', label: 'Behind pace' } : null
  }

  // Selected goal detail
  const goal = goals.find(g => g.id === selectedGoal)
  const goalPct = goal ? (goalCurrent(goal) / goal.target_amount) * 100 : 0
  const goalMonthsLeft = goal ? monthsRemaining(goal.target_date, asOf) : 0
  const goalMonthlyNeeded = goal ? monthlyNeeded(goal, asOf) : 0

  // What-if projections
  useEffect(() => {
    if (goal) setWhatIfAmount(goal.monthly_contribution || Math.round(goalMonthlyNeeded))
  }, [selectedGoal]) // eslint-disable-line

  const whatIfMonths = whatIfAmount > 0 ? Math.ceil((goal ? goal.target_amount - goal.current_amount : 0) / whatIfAmount) : 999
  const whatIfDate = new Date()
  whatIfDate.setMonth(whatIfDate.getMonth() + whatIfMonths)

  // Projection chart data
  const projectionData = useMemo(() => {
    if (!goal) return []
    const data: { month: string; projected: number }[] = []
    let balance = goal.current_amount
    const contribution = whatIfAmount || goal.monthly_contribution || 0
    const now = new Date()
    for (let i = 0; i <= Math.min(whatIfMonths + 3, 60); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      data.push({ month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), projected: Math.min(balance, goal.target_amount) })
      balance += contribution
    }
    return data
  }, [goal, whatIfAmount, whatIfMonths])

  // CRUD
  const openAdd = () => {
    setEditingId(null)
    setForm({ ...emptyForm, priority: String(goals.length + 1), owner: defaultOwner })
    setModalOpen(true)
  }
  const openEdit = (g: FinanceGoal) => {
    setEditingId(g.id)
    setForm({ name: g.name, icon: '🎯', target_amount: g.target_amount.toString(), current_amount: g.current_amount.toString(), target_date: g.target_date || '', monthly_contribution: (g.monthly_contribution || 0).toString(), priority: (g.priority || 1).toString(), scope: g.scope || 'shared', owner: g.owner || defaultOwner, goal_type: g.goal_type || 'savings', crypto_symbol: g.crypto_symbol || '' })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.target_amount || !form.target_date) return
    if (form.goal_type === 'crypto' && !form.crypto_symbol) return
    setSaving(true)
    const targetAmt = parseFloat(form.target_amount)
    const isCrypto = form.goal_type === 'crypto'
    // For crypto goals, current_amount is auto-calculated from holdings
    const currentAmt = isCrypto ? getCryptoQty(form.crypto_symbol) : parseFloat(form.current_amount || '0')
    const months = monthsRemaining(form.target_date, asOf)
    const vehicle = isCrypto ? `Crypto (${form.crypto_symbol})` : vehicleForHorizon(months)
    const record = {
      name: form.name, target_amount: targetAmt, current_amount: currentAmt,
      target_date: form.target_date, monthly_contribution: parseFloat(form.monthly_contribution || '0'),
      priority: parseInt(form.priority || '1'), investment_vehicle: vehicle,
      scope: form.scope, owner: form.scope === 'shared' ? null : form.owner,
      goal_type: form.goal_type, crypto_symbol: isCrypto ? form.crypto_symbol : null,
      milestones_json: [25, 50, 75, 100].map(m => ({ pct: m, amount: targetAmt * m / 100, reached: currentAmt >= targetAmt * m / 100 })),
    }
    if (editingId) {
      await supabase.from('finance_goals').update(record).eq('id', editingId)
    } else {
      await supabase.from('finance_goals').insert(record)
    }
    setSaving(false); setModalOpen(false); fetchData()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('finance_goals').delete().eq('id', id)
    setDeleteConfirm(null); if (selectedGoal === id) setSelectedGoal(null); fetchData()
  }

  const formMonthsLeft = form.target_date ? monthsRemaining(form.target_date, asOf) : 0
  const formMonthlyNeeded = form.target_amount && form.target_date
    ? monthlyNeeded({ target_amount: parseFloat(form.target_amount), current_amount: parseFloat(form.current_amount || '0'), target_date: form.target_date }, asOf)
    : 0

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  const neededTone = totalMonthlyNeeded <= 0 ? 'neutral' : totalContributing >= totalMonthlyNeeded ? 'positive' : 'warning'

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold tracking-tight"><span className="section-tick" aria-hidden />Goals &amp; WEST</h1>
          <p className="text-[hsl(var(--text-secondary))]">Track progress toward your financial & crypto targets</p>
        </div>
      </div>

      {/* Scope filter */}
      <div role="radiogroup" aria-label="Whose goals" className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-[hsl(var(--bg-elevated))] p-1">
        {[{ key: 'all', label: 'All' }, { key: 'shared', label: 'Shared' }, ...OWNERS.map(o => ({ key: o, label: o }))].map(f => (
          <button key={f.key} type="button" role="radio" aria-checked={scopeFilter === f.key} onClick={() => setScopeFilter(f.key)}
            className={cn("inline-flex min-h-[36px] items-center whitespace-nowrap rounded-md px-3 text-xs font-medium transition-all",
              scopeFilter === f.key ? "bg-[hsl(var(--surface))] text-[hsl(var(--foreground))] shadow-sm" : "text-[hsl(var(--text-secondary))]"
            )}>
            {f.key !== 'all' && f.key !== 'shared' && <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: getOwnerColor(f.key) }} />}
            {f.label}
          </button>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-4 py-3 text-sm">
          <span className="text-xs"><StatusPill tone="negative">{overdue.length} past due</StatusPill></span>
          <span className="text-[hsl(var(--text-secondary))]">
            {overdue.map(g => g.name).join(', ')} passed {overdue.length === 1 ? 'its' : 'their'} date with {compact(overdue.reduce((s, g) => s + g.target_amount - g.current_amount, 0))} to go — roll the balance into new goals. They no longer count in the monthly need.
          </span>
        </div>
      )}

      {/* KPIs — tiles with no data are hidden, never "No data yet" */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        <KpiTile label="Saved" value={compact(totalSaved)} hint={`${overallPct}% of ${compact(totalTarget)}`} />
        <KpiTile label="Monthly needed" value={compact(totalMonthlyNeeded)}
          hint={totalMonthlyNeeded > 0 ? `contributing ${formatCompact(totalContributing)}/mo` : openPeso.length > 0 ? 'all open goals funded' : 'no open peso goals'}
          tone={neededTone} />
        {lastTotal && (
          <KpiTile label="Last month net" value={compact(lastTotal.net_savings)}
            hint={parseLocalDateKey(String(lastTotal.month).slice(0, 10)).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            tone={lastTotal.net_savings >= 0 ? 'neutral' : 'negative'} />
        )}
        {lastTotal && (
          <KpiTile label="Savings rate" value={`${lastTotal.savings_rate}%`} hint={avgNetSavings > 0 ? `avg ${compact(avgNetSavings)}/mo` : undefined} />
        )}
        {lastTotal && (
          <KpiTile label="Vs plan" value={`${lastTotal.variance >= 0 ? '+' : '−'}${compact(Math.abs(lastTotal.variance))}`}
            hint={`plan ${compact(lastTotal.planned_contribution)}`} tone={lastTotal.variance >= 0 ? 'positive' : 'negative'} />
        )}
        {/* 3 or 6 tiles: a lone last tile spans the 2-column phone grid */}
        <KpiTile label="Active goals" value={String(activeGoals.length)} hint={overdue.length > 0 ? `${overdue.length} past due` : undefined} tone={overdue.length > 0 ? 'negative' : 'neutral'} wide={!lastTotal} />
      </div>

      {/* Goal cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {activeGoals.sort((a, b) => (a.priority || 99) - (b.priority || 99)).map(g => {
          const isCrypto = isCryptoGoal(g) && !!g.crypto_symbol
          const current = goalCurrent(g)
          const pct = g.target_amount > 0 ? (current / g.target_amount) * 100 : 0
          const needed = monthlyNeeded({ ...g, current_amount: current }, asOf)
          const months = monthsRemaining(g.target_date, asOf)
          const status = getGoalStatus(g)
          const pace = paceTarget(g, asOf.key)
          const lastActual = !isCrypto && g.owner ? getLastActual(g.owner) : null
          const cryptoMXN = isCrypto ? getCryptoMXN(g.crypto_symbol!) : 0

          return (
            <GlassCard key={g.id}
              className={cn("relative cursor-pointer transition-all hover:ring-1 hover:ring-[hsl(var(--border))]", selectedGoal === g.id && "ring-1 ring-[hsl(var(--primary))]/50")}
              onClick={() => setSelectedGoal(g.id === selectedGoal ? null : g.id)}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {isCrypto ? (
                    <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", COIN_SOLIDS[g.crypto_symbol!] || 'bg-gray-500')} aria-hidden>{COIN_ICONS[g.crypto_symbol!] || '?'}</span>
                  ) : (
                    <OwnerAvatar owner={g.scope === 'shared' ? null : g.owner} size={24} />
                  )}
                  <h4 className="min-w-0 text-sm font-semibold">
                    <button type="button" aria-expanded={selectedGoal === g.id} aria-controls={selectedGoal === g.id ? 'goal-detail' : undefined}
                      onClick={e => { e.stopPropagation(); setSelectedGoal(g.id === selectedGoal ? null : g.id) }}
                      className="block max-w-full truncate rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))]/60">
                      {g.name}
                    </button>
                  </h4>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {status && <span className="text-xs"><StatusPill tone={status.tone}>{status.label}</StatusPill></span>}
                  <GoalActionsMenu name={g.name} open={menuFor === g.id}
                    onOpenChange={setMenuOpenFor(g.id)}
                    onEdit={() => openEdit(g)} onDelete={() => setDeleteConfirm(g.id)} />
                </div>
              </div>

              <div className="mt-3 flex items-baseline justify-between gap-2">
                {isCrypto ? (
                  <p className="num text-sm text-[hsl(var(--text-secondary))]"><span className="font-semibold text-[hsl(var(--foreground))]">{coins(current)}</span> / {g.target_amount} {g.crypto_symbol}</p>
                ) : (
                  <p className="num text-sm text-[hsl(var(--text-secondary))]" data-money=""><span className="font-semibold text-[hsl(var(--foreground))]">{compact(current)}</span> of {compact(g.target_amount)}</p>
                )}
                <span className="num text-sm font-semibold">{Math.round(pct)}%</span>
              </div>
              <ProgressBar className="mt-2" value={current} max={g.target_amount} tone={pct >= 100 ? 'positive' : status ? 'warning' : 'positive'}
                marker={pace != null && pace < g.target_amount ? pace : null}
                label={`${g.name} progress`} valueText={`${Math.round(pct)}% saved${pace != null ? `, pace ${Math.round((pace / g.target_amount) * 100)}%` : ''}`} />
              <p className="mt-1.5 text-label text-[hsl(var(--text-tertiary))]">
                {g.target_date ? `by ${parseLocalDateKey(g.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : 'no date'}
                {isCrypto && cryptoMXN > 0 ? ` · worth ${compact(cryptoMXN)}` : ''}
                {isCrypto && !holdingsKnown ? ' · last recorded' : ''}
              </p>

              <dl className="mt-3 space-y-1 border-t border-[hsl(var(--border))] pt-3 text-xs">
                {isCrypto ? (
                  <>
                    <div className="flex justify-between gap-2"><dt className="text-[hsl(var(--text-tertiary))]">Remaining</dt><dd className="num font-medium">{coins(Math.max(0, g.target_amount - current))} {g.crypto_symbol}</dd></div>
                    {months > 0 && <div className="flex justify-between gap-2"><dt className="text-[hsl(var(--text-tertiary))]">Needed/mo</dt><dd className="num font-medium">{coins(Math.max(0, g.target_amount - current) / months)} {g.crypto_symbol}</dd></div>}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[hsl(var(--text-tertiary))]">Needed</dt>
                      <dd className="num font-medium">{isGoalOverdue(g, asOf) ? 'past due' : `${compact(needed)}/mo`}{months > 0 ? ` · ${months} mo` : ''}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[hsl(var(--text-tertiary))]">{lastActual !== null ? 'Saved last month' : 'Contributing'}</dt>
                      <dd className="num font-medium">{compact(lastActual ?? (g.monthly_contribution || 0))}{lastActual === null ? '/mo' : ''}</dd>
                    </div>
                    {g.last_contribution_date && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-[hsl(var(--text-tertiary))]">Last applied</dt>
                        <dd className="num font-medium text-[hsl(var(--text-secondary))]">
                          {parseLocalDateKey(g.last_contribution_date.slice(0, 10)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {g.last_contribution_amount ? ` · +${compact(g.last_contribution_amount)}` : ''}
                        </dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
              {deleteConfirm === g.id && (
                <div className="mt-2 flex items-center justify-end gap-2 border-t border-[hsl(var(--border))] pt-2" onClick={e => e.stopPropagation()}>
                  <span className="mr-auto text-xs text-[hsl(var(--text-tertiary))]">Delete this goal?</span>
                  <button type="button" onClick={() => handleDelete(g.id)} className="min-h-[36px] rounded-lg bg-rose-600 px-3 text-xs font-medium text-white">Delete</button>
                  <button type="button" onClick={() => setDeleteConfirm(null)} className="min-h-[36px] rounded-lg bg-[hsl(var(--bg-elevated))] px-3 text-xs">Cancel</button>
                </div>
              )}
            </GlassCard>
          )
        })}

        <button type="button" onClick={openAdd}
          className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[hsl(var(--border))] p-6 transition-all hover:border-[hsl(var(--primary))]/50">
          <Plus className="h-8 w-8 text-[hsl(var(--text-tertiary))]" />
          <span className="text-sm text-[hsl(var(--text-tertiary))]">Add Goal</span>
        </button>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {goal && (
          <motion.div id="goal-detail" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <GlassCard>
              <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <h4 className="text-sm font-semibold mb-3">Savings Timeline — {goal.name}</h4>
                  <div className="h-44 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={projectionData}>
                        <defs>
                          <linearGradient id="goalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: CHART.axis }} />
                        <YAxis className="money-axis" tick={{ fontSize: 10, fill: CHART.axis }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip {...tooltipStyle} formatter={(val) => [`$${Number(val).toLocaleString()}`]} />
                        <Area type="monotone" dataKey="projected" stroke="hsl(var(--chart-3))" fill="url(#goalGrad)" strokeWidth={2} />
                        <ReferenceLine y={goal.target_amount} stroke="hsl(var(--chart-1))" strokeDasharray="5 5" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-3">What If...</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Monthly contribution</label>
                      <input type="range" min={0} max={Math.max(Math.round(goal.target_amount / 6), 10000)} step={500}
                        value={whatIfAmount} onChange={e => setWhatIfAmount(Number(e.target.value))} className="w-full accent-indigo-500" />
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-[hsl(var(--text-tertiary))]">$0</span>
                        <span className="text-sm font-semibold tabular-nums text-indigo-600">${whatIfAmount.toLocaleString()}/mo</span>
                        <span className="text-xs text-[hsl(var(--text-tertiary))]">${Math.round(goal.target_amount / 6).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]">
                      <span className="text-xs text-[hsl(var(--text-secondary))]">Projected completion</span>
                      <p className="text-lg font-bold mt-0.5">{whatIfMonths < 999 ? whatIfDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'}</p>
                      <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{whatIfMonths < 999 ? `${whatIfMonths} months from now` : 'Set a contribution amount'}</p>
                    </div>

                    <div>
                      <span className="text-xs font-medium text-[hsl(var(--text-secondary))]">Milestones</span>
                      <div className="mt-2 space-y-1.5">
                        {[25, 50, 75, 100].map(m => {
                          const reached = goalPct >= m
                          return (
                            <div key={m} className="flex items-center gap-2">
                              <div className={cn("h-5 w-5 rounded-full flex items-center justify-center text-[10px]",
                                reached ? "bg-emerald-500/20 text-positive" : "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-tertiary))]"
                              )}>{reached ? '✓' : m}</div>
                              <span className={cn("text-xs", reached ? "text-positive line-through" : "text-[hsl(var(--text-secondary))]")}>
                                {m}% — ${((goal.target_amount * m) / 100).toLocaleString()}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {goal.investment_vehicle && (
                      <div className="p-3 rounded-lg border border-[hsl(var(--border))]">
                        <span className="text-xs text-[hsl(var(--text-secondary))]">Suggested vehicle</span>
                        <p className="text-sm font-medium mt-0.5">{goal.investment_vehicle}</p>
                        <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-0.5">Based on {goalMonthsLeft}-month horizon</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Monthly Savings Timeline — Stacked Bernardo + Laura */}
      {savingsChart.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-[hsl(var(--foreground))]">Monthly Net Savings</h3>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
                Last {savingsChart.length} month{savingsChart.length !== 1 ? 's' : ''} · avg ${Math.round(avgNetSavings).toLocaleString()}/mo
              </p>
            </div>
            {lastTotal && (
              <div className="text-right">
                <p className="text-lg font-bold text-positive tabular-nums">${Math.round(lastTotal.net_savings).toLocaleString()}</p>
                <p className="text-xs text-[hsl(var(--text-tertiary))]">{lastTotal.savings_rate}% rate</p>
              </div>
            )}
          </div>
          {/* Legend */}
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /><span className="text-xs text-[hsl(var(--text-secondary))]">{OWNERS[0]}</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /><span className="text-xs text-[hsl(var(--text-secondary))]">{OWNERS[1]}</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-0.5 border-t-2 border-dashed border-amber-400 inline-block" /><span className="text-xs text-[hsl(var(--text-secondary))]">Plan</span></div>
          </div>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={savingsChart} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis className="money-axis" tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}

                  formatter={((v: number, name: string) => [`$${(v || 0).toLocaleString()}`, name === 'bernardo' ? OWNERS[0] : OWNERS[1]]) as any}
                />
                <ReferenceLine y={lastTotal?.planned_contribution ?? 120000} stroke="hsl(var(--chart-5))" strokeDasharray="4 4" strokeWidth={1.5} />
                <Bar dataKey="bernardo" stackId="savings" fill="hsl(225, 75%, 48%)" />
                <Bar dataKey="laura" stackId="savings" fill="hsl(160, 60%, 45%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-1">Amber line = monthly savings plan ($120K) · Bar below line = behind target · Auto-updated 1st of each month</p>
        </GlassCard>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Goal' : 'New Savings Goal'}>
        <form onSubmit={e => { e.preventDefault(); handleSave() }} className="space-y-4">
          {/* Goal Type Toggle */}
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Goal Type</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, goal_type: 'savings', crypto_symbol: '' }))}
                className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all border",
                  form.goal_type === 'savings' ? "border-indigo-500 bg-indigo-500/10 text-indigo-600" : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))]"
                )}>💰 Savings</button>
              <button type="button" onClick={() => setForm(f => ({ ...f, goal_type: 'crypto', crypto_symbol: f.crypto_symbol || 'BTC' }))}
                className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all border",
                  form.goal_type === 'crypto' ? "border-orange-500 bg-orange-500/10 text-[hsl(var(--orange))]" : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))]"
                )}>₿ Crypto</button>
            </div>
          </div>

          {/* Crypto Symbol (only for crypto goals) */}
          {form.goal_type === 'crypto' && (
            <div>
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Coin</label>
              <div className="flex gap-2">
                {CRYPTO_SYMBOLS.map(s => (
                  <button key={s} type="button" onClick={() => setForm(f => ({ ...f, crypto_symbol: s, name: f.name || `Accumulate ${s}` }))}
                    className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all border flex items-center justify-center gap-1.5",
                      form.crypto_symbol === s ? `${COIN_SOLIDS[s]} text-white border-transparent` : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))]"
                    )}>
                    {COIN_ICONS[s]} {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Goal Name *</label>
            <input type="text" required placeholder={form.goal_type === 'crypto' ? `e.g., Accumulate 1 ${form.crypto_symbol || 'BTC'}` : "e.g., Down payment"} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          {/* Scope + Owner */}
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Who is this for?</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, scope: 'shared', owner: '' }))}
                className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all border",
                  form.scope === 'shared' ? "border-purple-500 bg-purple-500/10 text-purple-600" : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))]"
                )}>🤝 Shared</button>
              {OWNERS.map(name => (
                <button key={name} type="button" onClick={() => setForm(f => ({ ...f, scope: 'personal', owner: name }))}
                  className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all border",
                    form.scope === 'personal' && form.owner === name
                      ? "border-blue-500 bg-blue-500/10 text-info"
                      : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))]"
                  )}>
                  <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: getOwnerColor(name) }} />{name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div>
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className={cn(inputCls, "w-20")}>
                {Array.from({ length: Math.max(goals.length + 1, 5) }, (_, i) => (
                  <option key={i + 1} value={i + 1}>#{i + 1}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">
                {form.goal_type === 'crypto' ? `Target (${form.crypto_symbol || 'coins'}) *` : 'Target Amount *'}
              </label>
              <input type="number" step={form.goal_type === 'crypto' ? '0.001' : '1000'} required
                placeholder={form.goal_type === 'crypto' ? '1' : '500000'} value={form.target_amount}
                onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} className={cn(inputCls, "font-semibold")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Target Date *</label>
              <input type="date" required value={form.target_date}
                onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} className={inputCls} />
            </div>
            {form.goal_type !== 'crypto' && (
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Current Savings</label>
                <input type="number" step="100" placeholder="0" value={form.current_amount}
                  onChange={e => setForm(f => ({ ...f, current_amount: e.target.value }))} className={inputCls} />
              </div>
            )}
            {form.goal_type === 'crypto' && form.crypto_symbol && (
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Current Holdings</label>
                <div className={cn(inputCls, "bg-[hsl(var(--bg-elevated))]/50 text-[hsl(var(--text-secondary))]")}>
                  {getCryptoQty(form.crypto_symbol).toFixed(8).replace(/\.?0+$/, '')} {form.crypto_symbol}
                  <span className="text-[10px] text-[hsl(var(--text-tertiary))] ml-1">(auto from holdings)</span>
                </div>
              </div>
            )}
          </div>
          {form.goal_type !== 'crypto' && (
            <div>
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Monthly Contribution</label>
              <input type="number" step="500" placeholder="5000" value={form.monthly_contribution}
                onChange={e => setForm(f => ({ ...f, monthly_contribution: e.target.value }))} className={inputCls} />
            </div>
          )}

          {form.target_amount && form.target_date && form.goal_type !== 'crypto' && (
            <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))] text-center">
              <p className="text-xs text-[hsl(var(--text-secondary))]">You need to save</p>
              <p className="text-xl font-bold tabular-nums text-indigo-600">${Math.round(formMonthlyNeeded).toLocaleString()}/mo</p>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">or ${Math.round(formMonthlyNeeded / 30).toLocaleString()}/day • {formMonthsLeft} months</p>
            </div>
          )}
          {form.target_amount && form.target_date && form.goal_type === 'crypto' && form.crypto_symbol && (
            <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))] text-center">
              <p className="text-xs text-[hsl(var(--text-secondary))]">You need to accumulate</p>
              <p className="text-xl font-bold tabular-nums text-[hsl(var(--orange))] font-mono">
                {formMonthsLeft > 0 ? (Math.max(0, parseFloat(form.target_amount) - getCryptoQty(form.crypto_symbol)) / formMonthsLeft).toFixed(8).replace(/\.?0+$/, '') : '—'} {form.crypto_symbol}/mo
              </p>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{formMonthsLeft} months • Currently {getCryptoQty(form.crypto_symbol).toFixed(4)} {form.crypto_symbol}</p>
            </div>
          )}

          <button type="submit" disabled={saving || !form.name || !form.target_amount || !form.target_date}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update Goal' : 'Create Goal'}
          </button>
        </form>
      </Modal>
    </div>
    </PageTransition>
  )
}
