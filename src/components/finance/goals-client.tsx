'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import type { FinanceGoal } from '@/lib/finance-types'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const inputCls = "w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-blue-500 transition-colors"
const tooltipStyle = { contentStyle: { background: 'hsl(222, 47%, 6%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '8px', fontSize: '12px' } }

const GOAL_ICONS = ['🏠', '🚗', '✈️', '💻', '🎓', '💍', '🏖️', '🎯', '🛡️', '💰']
const GRADIENTS = ['from-indigo-500/20 to-purple-500/20', 'from-blue-500/20 to-cyan-500/20', 'from-emerald-500/20 to-teal-500/20', 'from-amber-500/20 to-orange-500/20']

function monthsBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth())
}

function vehicleForHorizon(months: number): string {
  if (months <= 6) return 'CETES 28 días / Hey Banco'
  if (months <= 12) return 'CETES 91-182 días'
  if (months <= 24) return 'CETES 364 días / Nu cuenta'
  if (months <= 60) return 'GBM+ Smart Cash / Fintual'
  return 'VOO via GBM+ / ETFs'
}

interface GoalForm {
  name: string; icon: string; target_amount: string; current_amount: string
  target_date: string; monthly_contribution: string; priority: string
}
const emptyForm: GoalForm = { name: '', icon: '🎯', target_amount: '', current_amount: '0', target_date: '', monthly_contribution: '', priority: '1' }

export default function GoalsClient() {
  const [goals, setGoals] = useState<FinanceGoal[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null)
  const [whatIfAmount, setWhatIfAmount] = useState(0)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<GoalForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('finance_goals').select('*').order('priority')
    setGoals(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(); const h = () => { if (document.visibilityState === "visible") fetchData() }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h) }, [fetchData])

  // KPIs
  const activeGoals = goals.filter(g => !g.is_completed)
  const totalTarget = activeGoals.reduce((s, g) => s + g.target_amount, 0)
  const totalSaved = activeGoals.reduce((s, g) => s + g.current_amount, 0)
  const overallPct = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0
  const totalMonthlyNeeded = activeGoals.reduce((s, g) => {
    const months = monthsBetween(new Date(), new Date(g.target_date || '2027-01-01'))
    const remaining = g.target_amount - g.current_amount
    return s + (months > 0 ? remaining / months : remaining)
  }, 0)

  // Selected goal detail
  const goal = goals.find(g => g.id === selectedGoal)
  const goalPct = goal ? (goal.current_amount / goal.target_amount) * 100 : 0
  const goalMonthsLeft = goal ? monthsBetween(new Date(), new Date(goal.target_date || '2027-01-01')) : 0
  const goalMonthlyNeeded = goal && goalMonthsLeft > 0 ? (goal.target_amount - goal.current_amount) / goalMonthsLeft : 0

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
    setForm({ ...emptyForm, priority: String(goals.length + 1) })
    setModalOpen(true)
  }
  const openEdit = (g: FinanceGoal) => {
    setEditingId(g.id)
    setForm({ name: g.name, icon: '🎯', target_amount: g.target_amount.toString(), current_amount: g.current_amount.toString(), target_date: g.target_date || '', monthly_contribution: (g.monthly_contribution || 0).toString(), priority: (g.priority || 1).toString() })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.target_amount || !form.target_date) return
    setSaving(true)
    const targetAmt = parseFloat(form.target_amount)
    const currentAmt = parseFloat(form.current_amount || '0')
    const months = monthsBetween(new Date(), new Date(form.target_date))
    const vehicle = vehicleForHorizon(months)
    const record = {
      name: form.name, target_amount: targetAmt, current_amount: currentAmt,
      target_date: form.target_date, monthly_contribution: parseFloat(form.monthly_contribution || '0'),
      priority: parseInt(form.priority || '1'), investment_vehicle: vehicle,
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

  const formMonthsLeft = form.target_date ? monthsBetween(new Date(), new Date(form.target_date)) : 0
  const formMonthlyNeeded = formMonthsLeft > 0 && form.target_amount ? (parseFloat(form.target_amount) - parseFloat(form.current_amount || '0')) / formMonthsLeft : 0

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Savings Goals</h1>
          <p className="text-[hsl(var(--text-secondary))]">Track progress toward your financial targets</p>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Active Goals</span>
          <AnimatedNumber value={activeGoals.length} className="text-2xl sm:text-3xl font-bold mt-1" />
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Target</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">${totalTarget.toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Saved</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-400 mt-1">${totalSaved.toLocaleString()}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{overallPct}% of all goals</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Monthly Needed</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-amber-400 mt-1">${Math.round(totalMonthlyNeeded).toLocaleString()}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">across all goals</p>
        </GlassCard>
      </div>

      {/* Goal Cards Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {activeGoals.sort((a, b) => (a.priority || 99) - (b.priority || 99)).map((g, i) => {
          const pct = (g.current_amount / g.target_amount) * 100
          const months = monthsBetween(new Date(), new Date(g.target_date || '2027-01-01'))
          const remaining = g.target_amount - g.current_amount
          const needed = months > 0 ? remaining / months : remaining
          const isOnTrack = (g.monthly_contribution || 0) >= needed

          return (
            <GlassCard key={g.id}
              className={cn("cursor-pointer hover:ring-1 hover:ring-[hsl(var(--border))] transition-all group",
                selectedGoal === g.id && "ring-1 ring-blue-500/50"
              )}
              onClick={() => setSelectedGoal(g.id === selectedGoal ? null : g.id)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                    i === 0 && "bg-indigo-500/20 text-indigo-400",
                    i === 1 && "bg-blue-500/20 text-blue-400",
                    i === 2 && "bg-emerald-500/20 text-emerald-400",
                    i > 2 && "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-tertiary))]",
                  )}>#{g.priority || i + 1}</span>
                  <span className="text-lg">🎯</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
                    isOnTrack ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                  )}>{isOnTrack ? '✓ On track' : '⚡ Needs boost'}</span>
                  <div className="flex sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); openEdit(g) }} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]"><Pencil className="h-3 w-3 text-[hsl(var(--text-tertiary))]" /></button>
                    {deleteConfirm === g.id ? (
                      <div className="flex gap-0.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => handleDelete(g.id)} className="px-1.5 py-0.5 rounded text-[10px] bg-rose-600 text-white">Del</button>
                        <button onClick={() => setDeleteConfirm(null)} className="px-1.5 py-0.5 rounded text-[10px] bg-[hsl(var(--bg-elevated))]">No</button>
                      </div>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); setDeleteConfirm(g.id) }} className="p-1 rounded hover:bg-rose-500/10"><Trash2 className="h-3 w-3 text-rose-400" /></button>
                    )}
                  </div>
                </div>
              </div>

              <h4 className="text-sm font-semibold">{g.name}</h4>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">${g.current_amount.toLocaleString()} of ${g.target_amount.toLocaleString()}</p>

              <div className="relative mt-3 mb-2">
                <div className="h-3 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
                  <motion.div className={cn("h-3 rounded-full bg-gradient-to-r", GRADIENTS[Math.min(i, 3)])}
                    initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.8 }} />
                </div>
                {[25, 50, 75].map(m => (
                  <div key={m} className={cn("absolute top-1/2 -translate-y-1/2 h-3 w-0.5", pct >= m ? "bg-white/30" : "bg-[hsl(var(--text-tertiary))]/20")} style={{ left: `${m}%` }} />
                ))}
              </div>

              <div className="flex items-center justify-between mt-1">
                <span className="text-lg font-bold tabular-nums">{Math.round(pct)}%</span>
                <span className="text-xs text-[hsl(var(--text-tertiary))]">{g.target_date ? new Date(g.target_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</span>
              </div>

              <div className="mt-2 pt-2 border-t border-[hsl(var(--border))]">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[hsl(var(--text-tertiary))]">Contributing</span>
                  <span className="text-xs font-medium tabular-nums">${(g.monthly_contribution || 0).toLocaleString()}/mo</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-[hsl(var(--text-tertiary))]">Needed</span>
                  <span className={cn("text-xs font-medium tabular-nums", isOnTrack ? "text-emerald-400" : "text-amber-400")}>${Math.round(needed).toLocaleString()}/mo</span>
                </div>
              </div>
            </GlassCard>
          )
        })}

        <button onClick={openAdd}
          className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[hsl(var(--border))] hover:border-blue-500/50 hover:bg-blue-500/5 transition-all min-h-[200px]">
          <Plus className="h-8 w-8 text-[hsl(var(--text-tertiary))]" />
          <span className="text-sm text-[hsl(var(--text-tertiary))]">Add Goal</span>
        </button>
      </div>

      {/* Detail Panel */}
      <AnimatePresence>
        {goal && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
            <GlassCard>
              <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <h4 className="text-sm font-semibold mb-3">Savings Timeline — {goal.name}</h4>
                  <div className="h-44 sm:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={projectionData}>
                        <defs>
                          <linearGradient id="goalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#6366F1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip {...tooltipStyle} formatter={(val) => [`$${Number(val).toLocaleString()}`]} />
                        <Area type="monotone" dataKey="projected" stroke="#6366F1" fill="url(#goalGrad)" strokeWidth={2} />
                        <ReferenceLine y={goal.target_amount} stroke="#10B981" strokeDasharray="5 5" />
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
                        <span className="text-sm font-semibold tabular-nums text-indigo-400">${whatIfAmount.toLocaleString()}/mo</span>
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
                                reached ? "bg-emerald-500/20 text-emerald-400" : "bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-tertiary))]"
                              )}>{reached ? '✓' : m}</div>
                              <span className={cn("text-xs", reached ? "text-emerald-400 line-through" : "text-[hsl(var(--text-secondary))]")}>
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

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Goal' : 'New Savings Goal'}>
        <form onSubmit={e => { e.preventDefault(); handleSave() }} className="space-y-4">
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Goal Name *</label>
            <input type="text" required placeholder="e.g., Down payment" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
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
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Target Amount *</label>
              <input type="number" step="1000" required placeholder="500000" value={form.target_amount}
                onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} className={cn(inputCls, "font-semibold")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Target Date *</label>
              <input type="date" required value={form.target_date}
                onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Current Savings</label>
              <input type="number" step="100" placeholder="0" value={form.current_amount}
                onChange={e => setForm(f => ({ ...f, current_amount: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Monthly Contribution</label>
            <input type="number" step="500" placeholder="5000" value={form.monthly_contribution}
              onChange={e => setForm(f => ({ ...f, monthly_contribution: e.target.value }))} className={inputCls} />
          </div>

          {form.target_amount && form.target_date && (
            <div className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))] text-center">
              <p className="text-xs text-[hsl(var(--text-secondary))]">You need to save</p>
              <p className="text-xl font-bold tabular-nums text-indigo-400">${Math.round(formMonthlyNeeded).toLocaleString()}/mo</p>
              <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">or ${Math.round(formMonthlyNeeded / 30).toLocaleString()}/day • {formMonthsLeft} months</p>
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
