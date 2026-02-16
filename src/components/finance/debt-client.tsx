'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { Modal } from '@/components/ui/modal'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import type { FinanceDebt } from '@/lib/finance-types'
import { OwnerDot } from '@/components/finance/owner-dot'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const inputCls = "w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-blue-500 transition-colors"
const tooltipStyle = { contentStyle: { background: 'hsl(222, 47%, 6%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '8px', fontSize: '12px' } }

const DEBT_ICONS: Record<string, string> = { credit_card: '💳', auto_loan: '🚗', mortgage: '🏠', student_loan: '🎓', personal_loan: '📄', medical: '🏥', other: '📄' }

interface DebtForm { name: string; creditor: string; balance: string; interest_rate: string; minimum_payment: string; type: string }
const emptyForm: DebtForm = { name: '', creditor: '', balance: '', interest_rate: '', minimum_payment: '', type: 'credit_card' }

// Simulate payoff schedule
function simulatePayoff(debts: FinanceDebt[], strategy: 'snowball' | 'avalanche', extra: number) {
  if (debts.length === 0) return { months: 0, totalInterest: 0, timeline: [] as { month: number; balance: number }[] }

  const sorted = [...debts].sort((a, b) =>
    strategy === 'snowball' ? a.balance - b.balance : b.interest_rate - a.interest_rate
  )
  const balances = sorted.map(d => d.balance)
  const rates = sorted.map(d => d.interest_rate / 100 / 12)
  const mins = sorted.map(d => d.minimum_payment)

  const timeline: { month: number; balance: number }[] = []
  let totalInterest = 0
  let month = 0
  const maxMonths = 360

  while (balances.some(b => b > 0) && month < maxMonths) {
    let extraLeft = extra
    for (let i = 0; i < balances.length; i++) {
      if (balances[i] <= 0) continue
      const interest = balances[i] * rates[i]
      totalInterest += interest
      let payment = mins[i]
      // First non-zero debt gets the extra
      if (i === sorted.findIndex((_, idx) => balances[idx] > 0)) {
        payment += extraLeft
        extraLeft = 0
      }
      // Also add freed-up minimums from paid-off debts
      for (let j = 0; j < i; j++) {
        if (balances[j] <= 0) { payment += mins[j]; mins[j] = 0 }
      }
      balances[i] = Math.max(0, balances[i] + interest - payment)
    }
    month++
    timeline.push({ month, balance: balances.reduce((s, b) => s + b, 0) })
  }

  return { months: month, totalInterest: Math.round(totalInterest), timeline }
}

export default function DebtClient() {
  const [debts, setDebts] = useState<FinanceDebt[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'balance' | 'rate'>('rate')
  const [extraPayment, setExtraPayment] = useState(0)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DebtForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const { data } = await supabase.from('finance_debts').select('*').eq('is_active', true).order('balance')
    setDebts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData(); const h = () => { if (document.visibilityState === "visible") fetchData() }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h) }, [fetchData])

  // KPIs
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0)
  const totalMinimum = debts.reduce((s, d) => s + d.minimum_payment, 0)
  const weightedAvgRate = totalDebt > 0 ? debts.reduce((s, d) => s + d.interest_rate * d.balance, 0) / totalDebt : 0

  // Simulations
  const snowball = useMemo(() => simulatePayoff(debts, 'snowball', extraPayment), [debts, extraPayment])
  const avalanche = useMemo(() => simulatePayoff(debts, 'avalanche', extraPayment), [debts, extraPayment])
  const baselineSnowball = useMemo(() => simulatePayoff(debts, 'snowball', 0), [debts])
  const baselineAvalanche = useMemo(() => simulatePayoff(debts, 'avalanche', 0), [debts])

  const winner = avalanche.totalInterest <= snowball.totalInterest ? 'avalanche' : 'snowball'
  const bestResult = winner === 'avalanche' ? avalanche : snowball
  const debtFreeDate = new Date()
  debtFreeDate.setMonth(debtFreeDate.getMonth() + bestResult.months)
  const monthsSaved = Math.max(0, (winner === 'avalanche' ? baselineAvalanche.months : baselineSnowball.months) - bestResult.months)
  const interestSaved = Math.max(0, (winner === 'avalanche' ? baselineAvalanche.totalInterest : baselineSnowball.totalInterest) - bestResult.totalInterest)

  // Chart data (dual line)
  const chartData = useMemo(() => {
    const maxLen = Math.max(snowball.timeline.length, avalanche.timeline.length)
    return Array.from({ length: maxLen }, (_, i) => ({
      month: i + 1,
      snowball: snowball.timeline[i]?.balance ?? 0,
      avalanche: avalanche.timeline[i]?.balance ?? 0,
    }))
  }, [snowball, avalanche])

  // Progress
  const totalPaid = debts.reduce((s, d) => s, 0) // We don't track original balance yet, use 0
  const pctPaid = totalDebt > 0 ? 0 : 1 // Without original balances, show countdown only

  // CRUD
  const openAdd = () => { setEditingId(null); setForm(emptyForm); setModalOpen(true) }
  const openEdit = (d: FinanceDebt) => {
    setEditingId(d.id)
    setForm({ name: d.name, creditor: d.creditor || '', balance: d.balance.toString(), interest_rate: d.interest_rate.toString(), minimum_payment: d.minimum_payment.toString(), type: d.type })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.balance || !form.interest_rate || !form.minimum_payment) return
    setSaving(true)
    const record = { name: form.name, creditor: form.creditor || null, balance: parseFloat(form.balance), interest_rate: parseFloat(form.interest_rate), minimum_payment: parseFloat(form.minimum_payment), type: form.type, is_active: true }
    if (editingId) {
      await supabase.from('finance_debts').update(record).eq('id', editingId)
    } else {
      await supabase.from('finance_debts').insert(record)
    }
    setSaving(false); setModalOpen(false); fetchData()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('finance_debts').delete().eq('id', id)
    setDeleteConfirm(null); fetchData()
  }

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Debt Planner</h1>
          <p className="text-[hsl(var(--text-secondary))]">Snowball vs avalanche debt elimination</p>
        </div>
      </div>

      {/* Hero KPIs */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Debt</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-rose-400 mt-1">${totalDebt.toLocaleString()}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{debts.length} accounts</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Monthly Minimum</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">${totalMinimum.toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Avg Interest</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-amber-400 mt-1">{weightedAvgRate.toFixed(1)}%</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">weighted by balance</p>
        </GlassCard>
        <GlassCard className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Debt-Free Date</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-400 mt-1">{debts.length > 0 ? debtFreeDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{bestResult.months} months away</p>
        </GlassCard>
      </div>

      {/* Strategy Comparison */}
      {debts.length > 0 && (
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Snowball vs Avalanche</h3>
          <div className="h-44 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} label={{ value: 'Months', position: 'insideBottom', offset: -5, fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} formatter={(val) => [`$${Number(val).toLocaleString()}`]} />
                <Line type="monotone" dataKey="snowball" name="Snowball" stroke="#3B82F6" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="avalanche" name="Avalanche" stroke="#F59E0B" strokeWidth={2.5} dot={false} strokeDasharray="6 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2 mb-4">
            <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-blue-500" /><span className="text-xs text-[hsl(var(--text-secondary))]">Snowball (smallest first)</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2 w-6 rounded-full bg-amber-500" /><span className="text-xs text-[hsl(var(--text-secondary))]">Avalanche (highest rate first)</span></div>
          </div>

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {[
              { name: 'Snowball', icon: '❄️', color: 'blue', months: snowball.months, interest: snowball.totalInterest, pro: 'Quick wins — motivating' },
              { name: 'Avalanche', icon: '🏔️', color: 'amber', months: avalanche.months, interest: avalanche.totalInterest, pro: 'Least total interest' },
            ].map(s => {
              const isWinner = s.name.toLowerCase() === winner
              return (
                <div key={s.name} className={cn("p-4 rounded-xl border transition-all",
                  isWinner ? "border-emerald-500/50 bg-emerald-500/5" : "border-[hsl(var(--border))]"
                )}>
                  {isWinner && <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-2 block">⭐ Recommended</span>}
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">{s.icon}</span><span className="text-sm font-semibold">{s.name}</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-xs text-[hsl(var(--text-tertiary))]">Time</span><p className="text-sm font-bold tabular-nums">{s.months} months</p></div>
                    <div><span className="text-xs text-[hsl(var(--text-tertiary))]">Total Interest</span><p className="text-sm font-bold tabular-nums text-rose-400">${s.interest.toLocaleString()}</p></div>
                  </div>
                  <p className="text-xs text-[hsl(var(--text-tertiary))] mt-2 italic">{s.pro}</p>
                </div>
              )
            })}
          </div>
        </GlassCard>
      )}

      {/* Accelerator + Countdown */}
      {debts.length > 0 && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <GlassCard>
            <h3 className="text-base font-semibold mb-4">💨 Accelerate Payoff</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Extra monthly payment</label>
                <input type="range" min={0} max={20000} step={500} value={extraPayment}
                  onChange={e => setExtraPayment(Number(e.target.value))} className="w-full accent-emerald-500" />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-[hsl(var(--text-tertiary))]">$0</span>
                  <span className="text-lg font-bold tabular-nums text-emerald-400">+${extraPayment.toLocaleString()}/mo</span>
                  <span className="text-xs text-[hsl(var(--text-tertiary))]">$20,000</span>
                </div>
              </div>
              <div className="flex gap-2">
                {[1000, 2500, 5000, 10000].map(amt => (
                  <button key={amt} onClick={() => setExtraPayment(amt)}
                    className={cn("flex-1 py-1.5 rounded-lg text-xs font-medium transition-all border",
                      extraPayment === amt ? "border-emerald-500 bg-emerald-500/10 text-emerald-400" : "border-[hsl(var(--border))] text-[hsl(var(--text-secondary))]"
                    )}>+${(amt / 1000).toFixed(0)}k</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-emerald-500/10"><span className="text-xs text-emerald-400/70">Time Saved</span><p className="text-lg font-bold text-emerald-400 tabular-nums">{monthsSaved} months</p></div>
                <div className="p-3 rounded-lg bg-emerald-500/10"><span className="text-xs text-emerald-400/70">Interest Saved</span><p className="text-lg font-bold text-emerald-400 tabular-nums">${interestSaved.toLocaleString()}</p></div>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="relative overflow-hidden flex flex-col items-center justify-center text-center py-8">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-emerald-500/5 pointer-events-none" />
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6 }}>
              <span className="text-5xl mb-3 block">🎯</span>
              <p className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-tertiary))] mb-1">Debt-Free Countdown</p>
              <p className="text-4xl sm:text-5xl font-black tabular-nums text-emerald-400">{bestResult.months}</p>
              <p className="text-sm text-[hsl(var(--text-secondary))] mt-1">months to go</p>
              <div className="relative h-32 w-32 mx-auto mt-4">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(222, 20%, 14%)" strokeWidth="6" />
                  <motion.circle cx="50" cy="50" r="42" fill="none" stroke="#10B981" strokeWidth="6" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`} initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 42 * 0.95 }} transition={{ duration: 1.2 }} />
                </svg>
              </div>
            </motion.div>
          </GlassCard>
        </div>
      )}

      {/* Debt Inventory */}
      <GlassCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h3 className="text-base font-semibold">Debt Inventory</h3>
          <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" /> Add Debt
          </button>
        </div>

        {debts.length === 0 ? (
          <div className="text-center py-8"><p className="text-4xl mb-3">💸</p><p className="text-sm text-[hsl(var(--text-tertiary))]">No debts tracked yet. Add your first one to see payoff strategies.</p></div>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-[hsl(var(--border))]">
                  {['Creditor', 'Type', 'Balance', 'Rate', 'Minimum', ''].map((h, i) => (
                    <th key={i} className={cn("text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3", i >= 2 ? "text-right" : "text-left")}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {debts.sort((a, b) => sortBy === 'balance' ? a.balance - b.balance : b.interest_rate - a.interest_rate).map((debt, i) => (
                    <tr key={debt.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors group">
                      <td className="py-3 px-3"><div className="flex items-center gap-2"><span>{DEBT_ICONS[debt.type] || '📄'}</span><div><p className="text-sm font-medium flex items-center gap-2">{debt.name} <OwnerDot owner={debt.owner} /></p><p className="text-xs text-[hsl(var(--text-tertiary))]">{debt.creditor}</p></div></div></td>
                      <td className="py-3 px-3"><span className="text-xs px-2 py-0.5 rounded-full bg-[hsl(var(--bg-elevated))] capitalize">{debt.type.replace('_', ' ')}</span></td>
                      <td className="py-3 px-3 text-right text-sm font-semibold tabular-nums text-rose-400">${debt.balance.toLocaleString()}</td>
                      <td className="py-3 px-3 text-right"><span className={cn("text-sm font-medium tabular-nums", debt.interest_rate >= 25 ? "text-rose-400" : debt.interest_rate >= 15 ? "text-amber-400" : "")}>{debt.interest_rate}%</span></td>
                      <td className="py-3 px-3 text-right text-sm tabular-nums">${debt.minimum_payment.toLocaleString()}</td>
                      <td className="py-2 px-2 w-16">
                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(debt)} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]"><Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-tertiary))]" /></button>
                          {deleteConfirm === debt.id ? (
                            <div className="flex gap-0.5"><button onClick={() => handleDelete(debt.id)} className="px-1.5 py-0.5 rounded text-[10px] bg-rose-600 text-white">Del</button><button onClick={() => setDeleteConfirm(null)} className="px-1.5 py-0.5 rounded text-[10px] bg-[hsl(var(--bg-elevated))]">No</button></div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(debt.id)} className="p-1 rounded hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5 text-rose-400" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sm:hidden space-y-2">
              {debts.map(debt => (
                <div key={debt.id} className="p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/30 border border-[hsl(var(--border))]">
                  <div className="flex items-center justify-between" onClick={() => openEdit(debt)}>
                    <div className="flex items-center gap-2"><span className="text-lg">{DEBT_ICONS[debt.type] || '📄'}</span><div><p className="text-sm font-medium flex items-center gap-2">{debt.name} <OwnerDot owner={debt.owner} /></p><p className="text-xs text-[hsl(var(--text-tertiary))]">{debt.creditor}</p></div></div>
                    <span className="text-sm font-bold tabular-nums text-rose-400">${debt.balance.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3 text-xs text-[hsl(var(--text-tertiary))]"><span className={cn(debt.interest_rate >= 25 ? "text-rose-400" : debt.interest_rate >= 15 ? "text-amber-400" : "")}>{debt.interest_rate}% APR</span><span>Min: ${debt.minimum_payment.toLocaleString()}</span></div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(debt)} className="p-1.5 rounded-lg hover:bg-blue-500/10 text-blue-400"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDeleteConfirm(debt.id)} className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-[hsl(var(--border))]">
              <span className="text-xs text-[hsl(var(--text-tertiary))]">Sort by:</span>
              {[{ key: 'balance' as const, label: '❄️ Snowball' }, { key: 'rate' as const, label: '🏔️ Avalanche' }].map(s => (
                <button key={s.key} onClick={() => setSortBy(s.key)} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", sortBy === s.key ? "bg-blue-600 text-white" : "text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--bg-elevated))]")}>{s.label}</button>
              ))}
            </div>
          </>
        )}
      </GlassCard>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Debt' : 'Add Debt'}>
        <form onSubmit={e => { e.preventDefault(); handleSave() }} className="space-y-4">
          <div><label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Debt Name *</label><input type="text" required placeholder="e.g., BBVA Credit Card" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></div>
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Type</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[{ key: 'credit_card', icon: '💳', label: 'Credit Card' }, { key: 'auto_loan', icon: '🚗', label: 'Auto' }, { key: 'mortgage', icon: '🏠', label: 'Mortgage' }, { key: 'student_loan', icon: '🎓', label: 'Student' }, { key: 'personal_loan', icon: '📄', label: 'Personal' }].map(t => (
                <button key={t.key} type="button" onClick={() => setForm(f => ({ ...f, type: t.key }))}
                  className={cn("p-2.5 rounded-lg border text-xs text-center transition-all", form.type === t.key ? "border-blue-500 bg-blue-500/10" : "border-[hsl(var(--border))]")}>
                  <span className="text-lg block">{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          </div>
          <div><label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Creditor</label><input type="text" placeholder="e.g., BBVA, Banorte..." value={form.creditor} onChange={e => setForm(f => ({ ...f, creditor: e.target.value }))} className={inputCls} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Balance *</label><input type="number" step="100" required placeholder="45000" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} className={cn(inputCls, "font-semibold")} /></div>
            <div><label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Rate % *</label><input type="number" step="0.1" required placeholder="36.0" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))} className={inputCls} /></div>
            <div><label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Minimum *</label><input type="number" step="100" required placeholder="1800" value={form.minimum_payment} onChange={e => setForm(f => ({ ...f, minimum_payment: e.target.value }))} className={inputCls} /></div>
          </div>
          <button type="submit" disabled={saving || !form.name || !form.balance || !form.interest_rate || !form.minimum_payment}
            className="w-full py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : editingId ? 'Update Debt' : 'Add Debt'}
          </button>
        </form>
      </Modal>
    </div>
    </PageTransition>
  )
}
