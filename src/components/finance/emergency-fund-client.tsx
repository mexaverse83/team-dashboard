'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'

const tooltipStyle = { contentStyle: { background: 'hsl(222, 47%, 6%)', border: '1px solid hsl(222, 20%, 18%)', borderRadius: '8px', fontSize: '12px' } }

interface RiskAnswers { job_stability?: number; income_sources?: number; dependents?: number; health?: number; housing?: number }

const QUESTIONS = [
  { id: 'job_stability', question: 'How stable is your primary income?', options: [{ value: 1, label: 'Government / tenured', icon: '🏛️' }, { value: 2, label: 'Stable corporate', icon: '🏢' }, { value: 3, label: 'Startup / contract', icon: '🚀' }, { value: 4, label: 'Freelance / variable', icon: '📱' }] },
  { id: 'income_sources', question: 'How many income sources?', options: [{ value: 1, label: '3+ diversified', icon: '🎯' }, { value: 2, label: '2 sources', icon: '✌️' }, { value: 3, label: '1 source only', icon: '☝️' }] },
  { id: 'dependents', question: 'Dependents relying on your income?', options: [{ value: 1, label: 'None', icon: '👤' }, { value: 2, label: '1-2', icon: '👥' }, { value: 3, label: '3+', icon: '👨‍👩‍👧‍👦' }] },
  { id: 'health', question: 'Health insurance coverage?', options: [{ value: 1, label: 'Full private + IMSS', icon: '🛡️' }, { value: 2, label: 'IMSS only', icon: '🏥' }, { value: 3, label: 'No coverage', icon: '⚠️' }] },
  { id: 'housing', question: 'Housing situation?', options: [{ value: 1, label: 'Own — paid off', icon: '🏠' }, { value: 2, label: 'Mortgage', icon: '🏘️' }, { value: 3, label: 'Renting', icon: '🔑' }] },
]

const ACCOUNTS = [
  { name: 'CETES Directo', rate: '~10.5%', tier: 3, access: '28 días', pro: 'Government-backed, highest safety', con: 'Min 28-day lock-in', icon: '🏛️', color: 'violet' },
  { name: 'Nu México', rate: '~15.0%', tier: 1, access: 'Daily', pro: 'Highest yield, daily liquidity', con: 'SOFIPO — insured up to $190K (PROSOFIPO)', icon: '💜', color: 'emerald' },
  { name: 'Hey Banco', rate: '~13.5%', tier: 2, access: '1-2 days', pro: 'Banregio-backed, solid brand', con: 'Slightly lower rate', icon: '💚', color: 'blue' },
  { name: 'Mercado Pago', rate: '~14.0%', tier: 1, access: 'Daily', pro: 'Instant in/out, familiar platform', con: 'Rate fluctuates', icon: '🤝', color: 'emerald' },
  { name: 'Supertasas', rate: '~12.5%', tier: 3, access: '7-30 days', pro: 'SOFIPO, competitive rates', con: 'Less known, $190K PROSOFIPO cap', icon: '📈', color: 'violet' },
  { name: 'Kubo Financiero', rate: '~11.0%', tier: 3, access: '7 days', pro: 'Established SOFIPO', con: '$190K insurance cap', icon: '🏦', color: 'violet' },
]

const DECISION_STEPS = [
  { question: 'Is this unexpected?', noMsg: 'Not an emergency — budget for it next month 📋' },
  { question: 'Is this necessary?', noMsg: 'Not an emergency — it can wait ⏳' },
  { question: 'Is this urgent?', noMsg: 'Not urgent — save up for it separately 🎯' },
  { question: 'Can you cover it any other way?', yesMsg: 'Try that first — keep your fund intact 💡', noMsg: '✅ Use your emergency fund. Start with Tier 1.' },
]

export default function EmergencyFundClient() {
  // Fund state (user-editable)
  const [monthlyEssentials, setMonthlyEssentials] = useState(25000)
  const [currentFund, setCurrentFund] = useState(93000)
  const [monthlySaving, setMonthlySaving] = useState(8000)

  // Risk questionnaire
  const [riskAnswers, setRiskAnswers] = useState<RiskAnswers>({})

  // Tier allocations
  const [tier1, setTier1] = useState(30000)
  const [tier2, setTier2] = useState(40000)
  const [tier3, setTier3] = useState(23000)

  // Decision tree
  const [decisionStep, setDecisionStep] = useState(0)
  const [decisionAnswers, setDecisionAnswers] = useState<Record<number, string>>({})
  const [decisionComplete, setDecisionComplete] = useState(false)
  const [decisionResult, setDecisionResult] = useState<'use' | 'redirect'>('redirect')
  const [decisionMsg, setDecisionMsg] = useState('')
  const [fundId, setFundId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Load from Supabase
  useEffect(() => {
    supabase.from('finance_emergency_fund').select('*').order('created_at', { ascending: false }).limit(1).then(({ data }) => {
      if (data && data[0]) {
        const d = data[0]
        setFundId(d.id)
        if (d.current_amount != null) setCurrentFund(d.current_amount)
        if (d.account_allocation_json) {
          const a = d.account_allocation_json
          if (a.tier1 != null) setTier1(a.tier1)
          if (a.tier2 != null) setTier2(a.tier2)
          if (a.tier3 != null) setTier3(a.tier3)
          if (a.monthly_essentials != null) setMonthlyEssentials(a.monthly_essentials)
          if (a.monthly_saving != null) setMonthlySaving(a.monthly_saving)
          if (a.risk_answers) setRiskAnswers(a.risk_answers)
        }
      }
    })
  }, [])

  // Risk calculation
  const answeredAll = Object.keys(riskAnswers).length === 5
  const riskScore = answeredAll ? Object.values(riskAnswers).reduce((s, v) => s + (v || 0), 0) : 0
  const recommendedMonths = answeredAll ? Math.min(12, Math.max(3, Math.round(riskScore * 0.6))) : 6
  const targetAmount = monthlyEssentials * recommendedMonths
  const monthsCovered = monthlyEssentials > 0 ? currentFund / monthlyEssentials : 0
  const fundPct = targetAmount > 0 ? (currentFund / targetAmount) * 100 : 0

  // Save to Supabase
  const handleSave = useCallback(async () => {
    setSaving(true)
    const record = {
      target_months: recommendedMonths,
      target_amount: targetAmount,
      current_amount: currentFund,
      risk_score: answeredAll ? riskScore : null,
      account_allocation_json: {
        tier1, tier2, tier3,
        monthly_essentials: monthlyEssentials,
        monthly_saving: monthlySaving,
        risk_answers: answeredAll ? riskAnswers : null,
      },
    }
    if (fundId) {
      const { error } = await supabase.from('finance_emergency_fund').update(record).eq('id', fundId)
      if (error) alert(`Save failed: ${error.message}`)
    } else {
      const { data, error } = await supabase.from('finance_emergency_fund').insert(record).select().single()
      if (error) alert(`Save failed: ${error.message}`)
      else if (data) setFundId(data.id)
    }
    setSaving(false)
  }, [fundId, monthlyEssentials, currentFund, monthlySaving, riskScore, riskAnswers, answeredAll, tier1, tier2, tier3, recommendedMonths, targetAmount])
  const gap = Math.max(0, targetAmount - currentFund)
  const monthsToTarget = monthlySaving > 0 ? Math.ceil(gap / monthlySaving) : Infinity

  // Tier distribution
  const totalAllocated = tier1 + tier2 + tier3
  const tier1Pct = totalAllocated > 0 ? (tier1 / totalAllocated) * 100 : 33
  const tier2Pct = totalAllocated > 0 ? (tier2 / totalAllocated) * 100 : 33
  const tier3Pct = totalAllocated > 0 ? (tier3 / totalAllocated) * 100 : 34

  // Savings timeline chart
  const savingsData = useMemo(() => {
    const data: { month: string; balance: number }[] = []
    let bal = currentFund
    const now = new Date()
    for (let i = 0; i <= Math.min(monthsToTarget + 6, 60); i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i)
      data.push({ month: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), balance: Math.round(bal) })
      bal += monthlySaving
    }
    return data
  }, [currentFund, monthlySaving, monthsToTarget])

  const handleDecision = (step: number, answer: string) => {
    const newAnswers = { ...decisionAnswers, [step]: answer }
    setDecisionAnswers(newAnswers)

    const s = DECISION_STEPS[step]
    // Last step is reversed logic
    if (step === 3) {
      if (answer === 'yes') { setDecisionComplete(true); setDecisionResult('redirect'); setDecisionMsg(s.yesMsg!) }
      else { setDecisionComplete(true); setDecisionResult('use'); setDecisionMsg(s.noMsg) }
    } else {
      if (answer === 'no') { setDecisionComplete(true); setDecisionResult('redirect'); setDecisionMsg(s.noMsg) }
      else { setDecisionStep(step + 1) }
    }
  }

  const resetDecision = () => { setDecisionStep(0); setDecisionAnswers({}); setDecisionComplete(false) }

  return (
    <PageTransition>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Emergency Fund</h1>
        <p className="text-[hsl(var(--text-secondary))]">Build your financial safety net</p>
      </div>

      {/* Configuration bar */}
      <GlassCard>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <div><label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Monthly Essentials (MXN)</label><input type="number" step={1000} value={monthlyEssentials} onChange={e => setMonthlyEssentials(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-indigo-500 transition-colors" /></div>
          <div><label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Current Fund Balance</label><input type="number" step={1000} value={currentFund} onChange={e => setCurrentFund(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-indigo-500 transition-colors" /></div>
          <div><label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Monthly Savings</label><input type="number" step={500} value={monthlySaving} onChange={e => setMonthlySaving(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm outline-none focus:border-indigo-500 transition-colors" /></div>
        </div>
        <button onClick={handleSave} disabled={saving} className="w-full mt-4 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium transition-colors">{saving ? 'Saving...' : '💾 Save Emergency Fund'}</button>
      </GlassCard>

      {/* Hero KPIs */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <GlassCard><span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Current Fund</span><p className="text-2xl sm:text-3xl font-bold tabular-nums text-indigo-400 mt-1">${currentFund.toLocaleString()}</p></GlassCard>
        <GlassCard><span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Target ({recommendedMonths}mo)</span><p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">${targetAmount.toLocaleString()}</p></GlassCard>
        <GlassCard><span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Months Covered</span><p className={cn("text-2xl sm:text-3xl font-bold tabular-nums mt-1", monthsCovered >= 6 ? "text-emerald-400" : monthsCovered >= 3 ? "text-amber-400" : "text-rose-400")}>{monthsCovered.toFixed(1)}</p><p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">of {recommendedMonths} month target</p></GlassCard>
        <GlassCard><span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Risk Score</span><p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">{answeredAll ? `${riskScore}/20` : '—'}</p>{answeredAll && <span className={cn("text-xs font-medium", riskScore <= 8 ? "text-emerald-400" : riskScore <= 13 ? "text-amber-400" : "text-rose-400")}>{riskScore <= 8 ? 'Low risk' : riskScore <= 13 ? 'Moderate' : 'High risk'}</span>}</GlassCard>
      </div>

      {/* Thermometer + Risk Questionnaire */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <GlassCard className="flex flex-col items-center py-6">
          <h3 className="text-base font-semibold mb-4">Fund Progress</h3>
          <div className="relative w-16 h-64 sm:h-80">
            <div className="absolute inset-x-2 inset-y-0 rounded-full bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))]" />
            <motion.div className="absolute inset-x-2 bottom-0 rounded-full bg-gradient-to-t from-indigo-600 to-indigo-400"
              initial={{ height: 0 }} animate={{ height: `${Math.min(fundPct, 100)}%` }} transition={{ duration: 1.2, type: 'spring', damping: 15 }} />
            {[3, 6].filter(m => m <= recommendedMonths).map(m => (
              <div key={m} className="absolute left-full ml-3 flex items-center gap-1" style={{ bottom: `${(m / recommendedMonths) * 100}%`, transform: 'translateY(50%)' }}>
                <div className="h-px w-3 bg-[hsl(var(--text-tertiary))]" />
                <span className="text-[10px] text-[hsl(var(--text-tertiary))] whitespace-nowrap">{m}mo · ${(monthlyEssentials * m).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <p className="text-2xl font-bold tabular-nums mt-4">{Math.round(fundPct)}%</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))]">${gap.toLocaleString()} to go</p>
        </GlassCard>

        <GlassCard className="lg:col-span-2">
          <h3 className="text-base font-semibold mb-4">Risk Assessment</h3>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">Answer to calculate your recommended fund size.</p>
          <div className="space-y-4">
            {QUESTIONS.map(q => (
              <div key={q.id}>
                <label className="text-sm font-medium mb-2 block">{q.question}</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {q.options.map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setRiskAnswers(prev => ({ ...prev, [q.id]: opt.value }))}
                      className={cn("p-2.5 rounded-lg border text-xs text-center transition-all",
                        riskAnswers[q.id as keyof RiskAnswers] === opt.value ? "border-indigo-500 bg-indigo-500/10" : "border-[hsl(var(--border))] hover:bg-[hsl(var(--bg-elevated))]"
                      )}>
                      <span className="text-lg block mb-0.5">{opt.icon}</span>{opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {answeredAll && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/30">
              <div className="flex items-center justify-between">
                <div><span className="text-xs text-indigo-400/70 uppercase tracking-wider">Risk Score</span><p className="text-2xl font-bold text-indigo-400">{riskScore}/20</p></div>
                <div className="text-right"><span className="text-xs text-indigo-400/70 uppercase tracking-wider">Recommended Fund</span><p className="text-2xl font-bold tabular-nums">{recommendedMonths} months</p><p className="text-sm font-medium tabular-nums text-indigo-400">${targetAmount.toLocaleString()}</p></div>
              </div>
            </motion.div>
          )}
        </GlassCard>
      </div>

      {/* Liquidity Tiers */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-4">Liquidity Tiers</h3>
        <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">Distribute your fund across tiers for optimal access vs. returns.</p>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          {[
            { tier: 1, label: 'Instant Access', color: 'emerald', icon: '🟢', desc: 'Checking account — immediate emergencies', access: 'Instant', rec: '1 month expenses', amount: tier1, set: setTier1 },
            { tier: 2, label: 'Quick Access', color: 'blue', icon: '🔵', desc: 'High-yield savings (Nu, Hey Banco)', access: '1-3 days', rec: '2-3 months expenses', amount: tier2, set: setTier2 },
            { tier: 3, label: 'Growth Tier', color: 'violet', icon: '🟣', desc: 'CETES 28d, Supertasas — higher returns', access: '7-28 days', rec: '2-3+ months expenses', amount: tier3, set: setTier3 },
          ].map(t => (
            <div key={t.tier} className="p-4 rounded-xl border-2 border-[hsl(var(--border))] transition-all">
              <div className="flex items-center gap-2 mb-3"><span className="text-lg">{t.icon}</span><div><h4 className="text-sm font-semibold">Tier {t.tier}: {t.label}</h4><p className="text-[10px] text-[hsl(var(--text-tertiary))]">Access: {t.access}</p></div></div>
              <p className="text-xs text-[hsl(var(--text-secondary))] mb-3">{t.desc}</p>
              <div><label className="text-[10px] text-[hsl(var(--text-tertiary))] mb-0.5 block">Allocated</label><input type="number" step={1000} value={t.amount} onChange={e => t.set(Number(e.target.value))} className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-lg font-bold tabular-nums outline-none focus:border-indigo-500 transition-colors text-sm" /></div>
              <p className="text-[10px] text-[hsl(var(--text-tertiary))] mt-2 italic">Rec: {t.rec}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-[hsl(var(--border))]">
          <div className="flex items-center justify-between mb-1.5"><span className="text-xs text-[hsl(var(--text-secondary))]">Distribution</span><span className="text-xs text-[hsl(var(--text-tertiary))] tabular-nums">${totalAllocated.toLocaleString()} allocated</span></div>
          <div className="h-4 rounded-full overflow-hidden flex bg-[hsl(var(--bg-elevated))]">
            <motion.div className="bg-emerald-500" animate={{ width: `${tier1Pct}%` }} transition={{ duration: 0.5 }} />
            <motion.div className="bg-blue-500" animate={{ width: `${tier2Pct}%` }} transition={{ duration: 0.5 }} />
            <motion.div className="bg-violet-500" animate={{ width: `${tier3Pct}%` }} transition={{ duration: 0.5 }} />
          </div>
        </div>
      </GlassCard>

      {/* Savings Plan + Decision Tree */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">Savings Plan</h3>
          <div className="space-y-3 mb-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--bg-elevated))]"><span className="text-sm">Monthly target</span><span className="text-sm font-bold tabular-nums text-indigo-400">${monthlySaving.toLocaleString()}</span></div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-[hsl(var(--bg-elevated))]"><span className="text-sm">Months to target</span><span className="text-sm font-bold tabular-nums">{monthsToTarget === Infinity ? '∞' : monthsToTarget}</span></div>
          </div>
          <div className="h-44 sm:h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={savingsData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip {...tooltipStyle} />
                <defs><linearGradient id="fundGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366F1" stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="balance" stroke="#6366F1" fill="url(#fundGrad)" strokeWidth={2} />
                <ReferenceLine y={targetAmount} stroke="#10B981" strokeDasharray="5 5" label={{ value: `${recommendedMonths}mo target`, fill: '#10B981', fontSize: 10 }} />
                <ReferenceLine y={monthlyEssentials * 3} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: '3mo', fill: '#F59E0B', fontSize: 9 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="text-base font-semibold mb-4">🚨 Is This a Real Emergency?</h3>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">Before dipping into your fund, run this checklist.</p>
          <div className="space-y-3">
            {DECISION_STEPS.map((step, i) => (
              <div key={i} className={cn("p-3 rounded-lg border", decisionStep === i && !decisionComplete ? "border-indigo-500/50 bg-indigo-500/5" : decisionStep > i || decisionComplete ? "border-[hsl(var(--border))]/50 opacity-50" : "border-[hsl(var(--border))]")}>
                <p className="text-sm font-medium mb-2">{step.question}</p>
                {decisionStep === i && !decisionComplete && (
                  <div className="flex gap-2">
                    <button onClick={() => handleDecision(i, 'yes')} className="flex-1 py-2 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all">✓ Yes</button>
                    <button onClick={() => handleDecision(i, 'no')} className="flex-1 py-2 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition-all">✗ No</button>
                  </div>
                )}
                {decisionAnswers[i] && <p className="text-xs mt-1 text-[hsl(var(--text-tertiary))]">Answered: {decisionAnswers[i] === 'yes' ? '✓ Yes' : '✗ No'}</p>}
              </div>
            ))}
            {decisionComplete && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={cn("p-4 rounded-xl text-center", decisionResult === 'use' ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-amber-500/10 border border-amber-500/30")}>
                <span className="text-2xl block mb-1">{decisionResult === 'use' ? '✅' : '⚠️'}</span>
                <p className="text-sm font-medium">{decisionMsg}</p>
              </motion.div>
            )}
            <button onClick={resetDecision} className="text-xs text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))] transition-colors">↺ Reset decision tree</button>
          </div>
        </GlassCard>
      </div>

      {/* Account Recommendations */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-1">🇲🇽 Recommended Accounts</h3>
        <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">Mexico-specific options by liquidity tier.</p>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {ACCOUNTS.map(acct => (
            <div key={acct.name} className="p-4 rounded-xl border border-[hsl(var(--border))] hover:border-indigo-500/30 transition-all">
              <div className="flex items-center gap-2 mb-2"><span className="text-xl">{acct.icon}</span><div><h4 className="text-sm font-semibold">{acct.name}</h4><span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", acct.color === 'emerald' ? 'bg-emerald-500/15 text-emerald-400' : acct.color === 'blue' ? 'bg-blue-500/15 text-blue-400' : 'bg-violet-500/15 text-violet-400')}>Tier {acct.tier}</span></div></div>
              <div className="space-y-1.5 mt-3">
                <div className="flex items-center justify-between"><span className="text-xs text-[hsl(var(--text-tertiary))]">Rate</span><span className="text-sm font-bold tabular-nums text-emerald-400">{acct.rate}</span></div>
                <div className="flex items-center justify-between"><span className="text-xs text-[hsl(var(--text-tertiary))]">Access</span><span className="text-xs">{acct.access}</span></div>
              </div>
              <p className="text-xs text-emerald-400/70 mt-2">✓ {acct.pro}</p>
              <p className="text-xs text-rose-400/70 mt-0.5">✗ {acct.con}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
    </PageTransition>
  )
}
