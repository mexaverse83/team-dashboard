'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2, CreditCard, Car, House, GraduationCap, FileText, HeartPulse, Snowflake, Mountain, Target, Gauge, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageTransition } from '@/components/page-transition'
import { Page, PageHeader } from '@/components/ui/page'
import { Card, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import { StatusPill } from '@/components/ui/status-pill'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { ChartFigure, ChartGrid, ChartLegend } from '@/components/ui/finance-chart'
import { cn } from '@/lib/utils'
import type { FinanceDebt } from '@/lib/finance-types'
import { OwnerDot } from '@/components/finance/owner-dot'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

import { inputCls } from '@/lib/form-style'
import { CHART, chartAnimationProps, chartAxisProps, chartTooltipProps, chartYAxisMoneyProps, moneyTooltipFormatter } from '@/lib/chart-theme'
import { addMonthsKey, localDateKey, monthKey } from '@/lib/dates'
import { formatCompact, formatMoney, formatMonthLong, formatPct } from '@/lib/format'

const DEBT_ICONS: Record<string, LucideIcon> = { credit_card: CreditCard, auto_loan: Car, mortgage: House, student_loan: GraduationCap, personal_loan: FileText, medical: HeartPulse, other: FileText }
const DEBT_TYPES = [
  { key: 'credit_card', label: 'Credit Card' }, { key: 'auto_loan', label: 'Auto' }, { key: 'mortgage', label: 'Mortgage' },
  { key: 'student_loan', label: 'Student' }, { key: 'personal_loan', label: 'Personal' },
]
const rateTone = (rate: number) => (rate >= 25 ? 'text-negative' : rate >= 15 ? 'text-warning' : 'text-fg')

function DebtIcon({ type }: { type: string }) {
  const Icon = DEBT_ICONS[type] || FileText
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-secondary">
      <Icon className="h-4 w-4" />
    </span>
  )
}

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
  const [paidPrincipal, setPaidPrincipal] = useState(0)
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
    const [{ data }, payments] = await Promise.all([
      supabase.from('finance_debts').select('*').eq('is_active', true).order('balance'),
      supabase.from('finance_debt_payments').select('principal_portion'),
    ])
    setDebts(data || [])
    setPaidPrincipal((payments.data || []).reduce((s, p) => s + Number(p.principal_portion || 0), 0))
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
  const debtFreeMonth = addMonthsKey(monthKey(new Date()), bestResult.months)
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

  // Progress: principal already paid off (recorded payments) vs original total
  const pctPaid = totalDebt + paidPrincipal > 0 ? paidPrincipal / (totalDebt + paidPrincipal) : 0

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

  const [paymentDebt, setPaymentDebt] = useState<string | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)

  const handleLogPayment = async () => {
    if (!paymentDebt || !paymentAmount) return
    const debt = debts.find(d => d.id === paymentDebt)
    if (!debt) return
    setPaymentSaving(true)
    const amount = parseFloat(paymentAmount)
    const monthlyRate = (debt.interest_rate || 0) / 100 / 12
    const interestPortion = Math.round(debt.balance * monthlyRate * 100) / 100
    const principalPortion = Math.round((amount - interestPortion) * 100) / 100
    const newBalance = Math.max(0, Math.round((debt.balance - principalPortion) * 100) / 100)

    await supabase.from('finance_debt_payments').insert({
      debt_id: paymentDebt,
      payment_date: localDateKey(),
      amount,
      principal_portion: principalPortion,
      interest_portion: interestPortion,
      remaining_balance: newBalance,
    })
    await supabase.from('finance_debts').update({ balance: newBalance }).eq('id', paymentDebt)
    if (newBalance <= 0) {
      await supabase.from('finance_debts').update({ is_active: false }).eq('id', paymentDebt)
    }
    setPaymentDebt(null); setPaymentAmount(''); setPaymentSaving(false); fetchData()
  }

  if (loading) return <Page aria-busy="true"><div className="h-9 w-48 rounded-lg skeleton" /><div className="h-28 rounded-xl skeleton" /></Page>

  const sortedDebts = [...debts].sort((a, b) => sortBy === 'balance' ? a.balance - b.balance : b.interest_rate - a.interest_rate)
  const openPayment = (debt: FinanceDebt) => { setPaymentDebt(debt.id); setPaymentAmount(debt.minimum_payment.toString()) }

  return (
    <PageTransition>
    <Page>
      <PageHeader
        title="Debt Planner"
        description="Snowball vs avalanche debt elimination"
        actions={<Button onClick={openAdd}><Plus aria-hidden="true" className="h-4 w-4" />Add Debt</Button>}
      />

      {/* KPIs — neutral values; rate tone only where it means something */}
      <Card>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4 lg:divide-x lg:divide-border [&>*]:lg:pl-5 [&>*:first-child]:lg:pl-0">
          <Stat label="Total Debt" money value={formatMoney(totalDebt)} hint={`${debts.length} ${debts.length === 1 ? 'account' : 'accounts'}`} />
          <Stat label="Monthly Minimum" money value={formatMoney(totalMinimum)} hint="across all debts" />
          <Stat label="Avg Interest" value={formatPct(weightedAvgRate, { decimals: 1 })} hint="weighted by balance" />
          <Stat label="Debt-Free Date" value={debts.length > 0 ? formatMonthLong(debtFreeMonth, { short: true }) : '—'} hint={debts.length > 0 ? `${bestResult.months} months away` : 'No active debts'} />
        </div>
      </Card>

      {/* Strategy Comparison */}
      {debts.length > 0 && (
        <Card>
          <CardHeader
            title="Snowball vs Avalanche"
            description="Total balance month by month"
            action={<ChartLegend items={[{ label: 'Snowball', color: CHART.series.info }, { label: 'Avalanche', color: CHART.series.target, dash: '6 3' }]} />}
          />
          <ChartFigure summary={`Snowball pays off in ${snowball.months} months with ${formatCompact(snowball.totalInterest)} interest; avalanche in ${avalanche.months} months with ${formatCompact(avalanche.totalInterest)} interest`}>
            <div className="h-44 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <ChartGrid />
                  <XAxis dataKey="month" {...chartAxisProps} interval="preserveStartEnd" minTickGap={16} tickFormatter={(v: number) => `${v} mo`} />
                  <YAxis {...chartYAxisMoneyProps} />
                  <Tooltip {...chartTooltipProps} labelFormatter={l => `Month ${l}`} formatter={moneyTooltipFormatter} />
                  <Line type="linear" dataKey="snowball" name="Snowball" stroke={CHART.series.info} strokeWidth={CHART.strokeWidth} dot={false} {...chartAnimationProps()} />
                  <Line type="linear" dataKey="avalanche" name="Avalanche" stroke={CHART.series.target} strokeWidth={CHART.strokeWidth} dot={false} strokeDasharray="6 3" {...chartAnimationProps()} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartFigure>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { name: 'Snowball', Icon: Snowflake, months: snowball.months, interest: snowball.totalInterest, pro: 'Smallest balance first — quick wins' },
              { name: 'Avalanche', Icon: Mountain, months: avalanche.months, interest: avalanche.totalInterest, pro: 'Highest rate first — least total interest' },
            ].map(st => {
              const isWinner = st.name.toLowerCase() === winner
              return (
                <div key={st.name} className={cn('rounded-xl border p-4', isWinner ? 'border-positive/40 bg-positive-bg' : 'border-border bg-surface-2')}>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-fg"><st.Icon aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />{st.name}</span>
                    {isWinner && <StatusPill tone="positive">Recommended</StatusPill>}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat size="sm" label="Time" value={`${st.months} months`} />
                    <Stat size="sm" label="Total Interest" money value={formatMoney(st.interest)} />
                  </div>
                  <p className="mt-2 text-label text-fg-secondary">{st.pro}</p>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Accelerator + Countdown */}
      {debts.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={<span className="inline-flex items-center gap-2"><Gauge aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />Accelerate Payoff</span>} />
            <div className="space-y-4">
              <div>
                <label htmlFor="extra-payment" className="mb-1 block text-label font-medium text-fg-secondary">Extra monthly payment</label>
                <input id="extra-payment" type="range" min={0} max={20000} step={500} value={extraPayment}
                  onChange={e => setExtraPayment(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" aria-valuetext={`${formatMoney(extraPayment)} per month`} />
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-label text-fg-tertiary">$0</span>
                  <span className="num text-lg font-semibold text-fg" data-money>+{formatMoney(extraPayment)}/mo</span>
                  <span className="text-label text-fg-tertiary">$20,000</span>
                </div>
              </div>
              <Segmented
                ariaLabel="Extra payment presets"
                size="sm"
                fullWidth
                value={String(extraPayment)}
                onChange={v => setExtraPayment(Number(v))}
                options={[1000, 2500, 5000, 10000].map(amt => ({ value: String(amt), label: `+${formatCompact(amt)}` }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-2 p-3"><Stat size="sm" label="Time Saved" value={`${monthsSaved} months`} /></div>
                <div className="rounded-lg bg-surface-2 p-3"><Stat size="sm" label="Interest Saved" money value={formatMoney(interestSaved)} /></div>
              </div>
            </div>
          </Card>

          <Card className="flex flex-col items-center justify-center py-8 text-center">
            <Target aria-hidden="true" className="mb-3 h-6 w-6 text-fg-tertiary" />
            <p className="text-label font-medium text-fg-secondary">Debt-Free Countdown</p>
            <p className="num-metric text-4xl font-semibold text-fg sm:text-5xl" data-privacy-exempt>{bestResult.months}</p>
            <p className="mt-1 text-sm text-fg-secondary">months to go</p>
            <div className="relative mx-auto mt-4 h-32 w-32">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--surface-3))" strokeWidth="6" />
                <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--positive))" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 42}`} strokeDashoffset={2 * Math.PI * 42 * (1 - pctPaid)} className="transition-[stroke-dashoffset] duration-700" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-semibold tabular-nums text-fg">{Math.round(pctPaid * 100)}%</span>
              </div>
            </div>
            <p className="mt-2 text-label text-fg-tertiary">of original debt paid off</p>
          </Card>
        </div>
      )}

      {/* Debt Inventory */}
      <Card>
        <CardHeader
          title="Debt Inventory"
          action={debts.length > 1 ? (
            <Segmented ariaLabel="Sort debts" size="sm" value={sortBy} onChange={setSortBy}
              options={[{ value: 'balance' as const, label: 'Snowball' }, { value: 'rate' as const, label: 'Avalanche' }]} />
          ) : undefined}
        />

        {debts.length === 0 ? (
          <EmptyState title="No debts tracked yet" description="Add your first one to see payoff strategies." action={<Button variant="secondary" onClick={openAdd}><Plus aria-hidden="true" className="h-4 w-4" />Add Debt</Button>} />
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full">
                <thead><tr className="border-b border-border">
                  {['Debt', 'Type', 'Balance', 'Rate', 'Minimum', ''].map((h, i) => (
                    <th key={i} scope="col" className={`px-3 py-3 text-label font-medium text-fg-secondary ${i >= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {sortedDebts.map(debt => (
                    <tr key={debt.id} className="group border-b border-border transition-colors last:border-0 hover:bg-surface-2">
                      <td className="px-3 py-3"><div className="flex items-center gap-3"><DebtIcon type={debt.type} /><div><p className="flex items-center gap-2 text-sm font-medium text-fg">{debt.name} <OwnerDot owner={debt.owner} /></p><p className="text-label text-fg-tertiary">{debt.creditor}</p></div></div></td>
                      <td className="px-3 py-3"><StatusPill tone="neutral" className="capitalize">{debt.type.replace('_', ' ')}</StatusPill></td>
                      <td className="num px-3 py-3 text-sm font-semibold text-fg" data-money>{formatMoney(debt.balance)}</td>
                      <td className={cn('num px-3 py-3 text-sm font-medium', rateTone(debt.interest_rate))}>{debt.interest_rate}%</td>
                      <td className="num px-3 py-3 text-sm text-fg" data-money>{formatMoney(debt.minimum_payment)}</td>
                      <td className="w-36 px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" aria-label={`Log payment for ${debt.name}`} onClick={() => openPayment(debt)}><CreditCard aria-hidden="true" className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" aria-label={`Edit ${debt.name}`} onClick={() => openEdit(debt)}><Pencil aria-hidden="true" className="h-4 w-4" /></Button>
                          {deleteConfirm === debt.id ? (
                            <div className="flex gap-1"><Button size="sm" variant="danger" onClick={() => handleDelete(debt.id)}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Keep</Button></div>
                          ) : (
                            <Button size="icon" variant="ghost" aria-label={`Delete ${debt.name}`} onClick={() => setDeleteConfirm(debt.id)} className="text-negative"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-2 sm:hidden">
              {sortedDebts.map(debt => (
                <li key={debt.id} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3"><DebtIcon type={debt.type} /><div className="min-w-0"><p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg"><span className="truncate">{debt.name}</span> <OwnerDot owner={debt.owner} className="shrink-0" /></p>{debt.creditor && <p className="truncate text-label text-fg-tertiary">{debt.creditor}</p>}</div></div>
                    <span className="num shrink-0 whitespace-nowrap text-sm font-semibold text-fg" data-money>{formatMoney(debt.balance)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-label text-fg-secondary"><span className={cn('whitespace-nowrap font-medium', rateTone(debt.interest_rate))}>{debt.interest_rate}% APR</span><span className="whitespace-nowrap">Min {formatMoney(debt.minimum_payment)}</span></div>
                    <div className="-mr-1.5 flex shrink-0 gap-0.5">
                      <Button size="icon" variant="ghost" aria-label={`Log payment for ${debt.name}`} onClick={() => openPayment(debt)}><CreditCard aria-hidden="true" className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label={`Edit ${debt.name}`} onClick={() => openEdit(debt)}><Pencil aria-hidden="true" className="h-4 w-4" /></Button>
                      {deleteConfirm === debt.id ? (
                        <div className="flex gap-1"><Button size="sm" variant="danger" onClick={() => handleDelete(debt.id)}>Delete</Button><Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(null)}>Keep</Button></div>
                      ) : (
                        <Button size="icon" variant="ghost" aria-label={`Delete ${debt.name}`} onClick={() => setDeleteConfirm(debt.id)} className="text-negative"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Debt' : 'Add Debt'}>
        <form onSubmit={e => { e.preventDefault(); handleSave() }} className="space-y-4">
          <div><label className="mb-1 block text-label font-medium text-fg-secondary">Debt Name *</label><input type="text" required placeholder="e.g., BBVA Credit Card" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} /></div>
          <div>
            <label className="mb-1 block text-label font-medium text-fg-secondary">Type</label>
            <Segmented ariaLabel="Debt type" size="sm" fullWidth className="flex-wrap" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={DEBT_TYPES.map(t => ({ value: t.key, label: t.label }))} />
          </div>
          <div><label className="mb-1 block text-label font-medium text-fg-secondary">Creditor</label><input type="text" placeholder="e.g., BBVA, Banorte..." value={form.creditor} onChange={e => setForm(f => ({ ...f, creditor: e.target.value }))} className={inputCls} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="mb-1 block text-label font-medium text-fg-secondary">Balance *</label><input type="number" step="100" required placeholder="45000" value={form.balance} onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} className={cn(inputCls, "font-semibold")} /></div>
            <div><label className="mb-1 block text-label font-medium text-fg-secondary">Rate % *</label><input type="number" step="0.1" required placeholder="36.0" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))} className={inputCls} /></div>
            <div><label className="mb-1 block text-label font-medium text-fg-secondary">Minimum *</label><input type="number" step="100" required placeholder="1800" value={form.minimum_payment} onChange={e => setForm(f => ({ ...f, minimum_payment: e.target.value }))} className={inputCls} /></div>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={saving || !form.name || !form.balance || !form.interest_rate || !form.minimum_payment}>
            {saving ? 'Saving…' : editingId ? 'Update Debt' : 'Add Debt'}
          </Button>
        </form>
      </Modal>

      {/* Log Payment Modal */}
      <Modal open={!!paymentDebt} onClose={() => { setPaymentDebt(null); setPaymentAmount('') }}
        title={`Log Payment — ${debts.find(d => d.id === paymentDebt)?.name || ''}`}>
        {(() => {
          const debt = debts.find(d => d.id === paymentDebt)
          if (!debt) return null
          const amount = parseFloat(paymentAmount) || 0
          const monthlyRate = (debt.interest_rate || 0) / 100 / 12
          const interest = Math.round(debt.balance * monthlyRate * 100) / 100
          const principal = Math.round((amount - interest) * 100) / 100
          const newBalance = Math.max(0, Math.round((debt.balance - principal) * 100) / 100)
          return (
            <div className="space-y-4">
              <div className="space-y-1 rounded-lg bg-surface-2 p-3 text-sm">
                <div className="flex justify-between"><span className="text-fg-secondary">Current balance</span><span className="num font-medium" data-money>{formatMoney(debt.balance)}</span></div>
                <div className="flex justify-between"><span className="text-fg-secondary">Rate</span><span>{debt.interest_rate}% APR</span></div>
              </div>
              <div>
                <label className="mb-1 block text-label font-medium text-fg-secondary">Payment Amount</label>
                <input type="number" step="100" value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)} className={inputCls} autoFocus />
              </div>
              {amount > 0 && (
                <div className="space-y-1 rounded-lg border border-border p-3 text-sm">
                  <div className="flex justify-between"><span className="text-fg-secondary">Interest</span><span className="num" data-money>{formatMoney(interest, { mode: 'precise' })}</span></div>
                  <div className="flex justify-between"><span className="text-fg-secondary">Principal</span><span className="num font-medium" data-money>{formatMoney(principal, { mode: 'precise' })}</span></div>
                  <div className="flex justify-between border-t border-border pt-1"><span className="font-medium">New balance</span><span className="num font-semibold" data-money>{formatMoney(newBalance, { mode: 'precise' })}</span></div>
                </div>
              )}
              <Button size="lg" className="w-full" onClick={handleLogPayment} disabled={paymentSaving || amount <= 0}>
                {paymentSaving ? 'Processing…' : 'Log Payment & Update Balance'}
              </Button>
            </div>
          )
        })()}
      </Modal>
    </Page>
    </PageTransition>
  )
}
