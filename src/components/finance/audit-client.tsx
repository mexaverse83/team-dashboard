'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { TrendBadge } from '@/components/ui/trend-badge'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import type { FinanceTransaction, FinanceRecurring, FinanceBudget } from '@/lib/finance-types'

// ── Helpers ──────────────────────────────────────────
function gradeColor(g: string) {
  return g === 'A' ? 'text-emerald-400' : g === 'B' ? 'text-blue-400' : g === 'C' ? 'text-amber-400' : g === 'D' ? 'text-orange-400' : 'text-rose-400'
}
function gradeBg(g: string) {
  return g === 'A' ? 'bg-emerald-500' : g === 'B' ? 'bg-blue-500' : g === 'C' ? 'bg-amber-500' : g === 'D' ? 'bg-orange-500' : 'bg-rose-500'
}
function gradeLabel(g: string) {
  return g === 'A' ? 'Excellent' : g === 'B' ? 'Good' : g === 'C' ? 'Average' : g === 'D' ? 'Below average' : 'Critical'
}
function gradeFromScore(s: number) { return s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 50 ? 'C' : s >= 30 ? 'D' : 'F' }

interface Leak { type: string; title: string; description: string; monthlyAmount: number; action: string; severity: 'high' | 'medium' | 'low'; recurringId?: string }
interface CategoryScore { id: string; name: string; icon: string; spent: number; budget: number; grade: string; trend: number; txCount: number; budgetScore: number; trendScore: number; freqScore: number }
interface MerchantGroup { merchant: string; count: number; total: number }
interface CatConcentration { name: string; icon: string; total: number; merchants: { name: string; pct: number; amount: number }[] }

export default function AuditClient() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [prevTransactions, setPrevTransactions] = useState<FinanceTransaction[]>([])
  const [recurring, setRecurring] = useState<FinanceRecurring[]>([])
  const [budgets, setBudgets] = useState<FinanceBudget[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string; color: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [flaggedSubs, setFlaggedSubs] = useState<Set<string>>(new Set())
  const [cryptoRisks, setCryptoRisks] = useState<{ type: string; title: string; detail: string; severity: 'high' | 'medium' | 'low' }[]>([])
  const [cryptoValue, setCryptoValue] = useState(0)
  const [investmentAudit, setInvestmentAudit] = useState<{
    score: number; score_label: string;
    score_breakdown: Record<string, number>;
    findings: Array<{ id: string; severity: string; category: string; title: string; detail: string; suggestion: string; action_url: string }>;
    net_worth: { total: number; by_class: Record<string, number> };
  } | null>(null)

  const handleLeakTriage = async (recurringId: string, status: 'keep' | 'cancel' | 'later') => {
    if (status === 'cancel') {
      await supabase.from('finance_recurring').update({ is_active: false, leak_status: 'cancel', leak_reviewed_at: new Date().toISOString() }).eq('id', recurringId)
    } else {
      await supabase.from('finance_recurring').update({ leak_status: status, leak_reviewed_at: new Date().toISOString() }).eq('id', recurringId)
    }
    fetchData()
  }

  // Month nav
  const [monthOffset, setMonthOffset] = useState(0)
  const targetDate = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() + monthOffset); return d }, [monthOffset])
  const monthLabel = targetDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthStart = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1)
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
  const prevMonthStart = useMemo(() => { const d = new Date(targetDate.getFullYear(), targetDate.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }, [targetDate])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [txRes, prevTxRes, recRes, budRes, catRes] = await Promise.all([
      supabase.from('finance_transactions').select('*').gte('transaction_date', monthStart).lt('transaction_date', monthEnd).eq('type', 'expense'),
      supabase.from('finance_transactions').select('*').gte('transaction_date', prevMonthStart).lt('transaction_date', monthStart).eq('type', 'expense'),
      supabase.from('finance_recurring').select('*').eq('is_active', true),
      supabase.from('finance_budgets').select('*').eq('month', monthStart),
      supabase.from('finance_categories').select('*').order('sort_order'),
    ])
    setTransactions(txRes.data || [])
    setPrevTransactions(prevTxRes.data || [])
    setRecurring(recRes.data || [])
    setBudgets(budRes.data || [])
    setCategories(catRes.data?.length ? catRes.data : DEFAULT_CATEGORIES as typeof categories)

    // Fetch investment audit (health score + flags)
    try {
      const invAuditRes = await fetch('/api/finance/audit/investments')
      if (invAuditRes.ok) {
        const invAuditData = await invAuditRes.json()
        setInvestmentAudit(invAuditData)
      }
    } catch { /* non-blocking */ }

    // Fetch crypto data for risk assessment
    try {
      const cryptoRes = await fetch('/api/finance/crypto')
      const cryptoText = await cryptoRes.text()
      if (cryptoText) {
        const cd = JSON.parse(cryptoText)
        const holdings = (cd.holdings || []).filter((h: Record<string, unknown>) => (h.quantity as number) > 0)
        const prices = cd.prices || {}
        const risks: { type: string; title: string; detail: string; severity: 'high' | 'medium' | 'low' }[] = []

        if (holdings.length > 0) {
          // Calculate totals
          let totalVal = 0
          const bySymbol: Record<string, number> = {}
          let totalCost = 0
          for (const h of holdings) {
            const val = h.quantity * (prices[h.symbol]?.mxn ?? 0)
            totalVal += val
            bySymbol[h.symbol] = (bySymbol[h.symbol] || 0) + val
            if (h.avg_cost_basis_usd) {
              const costCurr = h.cost_currency || 'MXN'
              const rate = costCurr === 'USD' && prices[h.symbol]?.usd > 0 ? prices[h.symbol].mxn / prices[h.symbol].usd : 1
              totalCost += h.quantity * h.avg_cost_basis_usd * (costCurr === 'USD' ? rate : 1)
            }
          }
          setCryptoValue(totalVal)

          // Concentration risk
          for (const [sym, val] of Object.entries(bySymbol)) {
            const pct = totalVal > 0 ? (val / totalVal) * 100 : 0
            if (pct > 80) {
              risks.push({ type: 'concentration', title: `${sym} concentration: ${pct.toFixed(0)}%`, detail: `${sym} represents ${pct.toFixed(0)}% of your crypto portfolio. Consider diversifying to reduce single-asset risk.`, severity: 'medium' })
            }
          }

          // Large unrealized loss
          if (totalCost > 0) {
            const pnlPct = ((totalVal - totalCost) / totalCost) * 100
            if (pnlPct < -20) {
              risks.push({ type: 'loss', title: `Unrealized crypto loss: ${pnlPct.toFixed(1)}%`, detail: `Your crypto portfolio is down ${Math.abs(pnlPct).toFixed(1)}% ($${Math.round(Math.abs(totalVal - totalCost)).toLocaleString()} MXN). Consider DCA strategy to lower cost basis.`, severity: pnlPct < -40 ? 'high' : 'medium' })
            }
          }
        }
        setCryptoRisks(risks)
      }
    } catch { /* crypto fetch failed, non-blocking */ }

    setLoading(false)
  }, [monthStart, monthEnd, prevMonthStart])

  useEffect(() => { fetchData(); const h = () => { if (document.visibilityState === "visible") fetchData() }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h) }, [fetchData])

  // ── KPIs ──────────────────────────────────────────
  const monthlySpend = transactions.reduce((s, t) => s + t.amount_mxn, 0)
  const prevSpend = prevTransactions.reduce((s, t) => s + t.amount_mxn, 0)
  const spendDelta = prevSpend > 0 ? ((monthlySpend - prevSpend) / prevSpend) * 100 : 0

  // ── Leaks ─────────────────────────────────────────
  const leaks = useMemo<Leak[]>(() => {
    const result: Leak[] = []
    // Unused subscriptions — check window based on frequency
    const freqDays: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365 }
    const freqLabels: Record<string, string> = { weekly: 'week', biweekly: '2 weeks', monthly: 'month', quarterly: 'quarter', yearly: 'year' }
    const freqDivisor: Record<string, number> = { weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12 }
    recurring.forEach(r => {
      // Skip reviewed subs: 'keep' = permanent dismiss, 'later' = 30 day snooze
      const ls = (r as any).leak_status
      const lra = (r as any).leak_reviewed_at
      if (ls === 'keep') return
      if (ls === 'later' && lra && (Date.now() - new Date(lra).getTime()) < 30 * 86400000) return
      // Skip debt-linked subscriptions — these are auto-tracked debt payments, not discretionary
      if ((r as any).debt_id) return

      const window = freqDays[r.frequency] || 30
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - window)
      const matching = transactions.filter(t => {
        // Primary: recurring_id match (cron always stamps this — most reliable)
        if (t.recurring_id && t.recurring_id === r.id && new Date(t.transaction_date) >= cutoff) return true
        // Fallback: merchant/description text match
        const match = t.merchant?.toLowerCase() === r.merchant?.toLowerCase() || t.description?.toLowerCase().includes(r.name.toLowerCase())
        return match && new Date(t.transaction_date) >= cutoff
      })
      if (matching.length === 0) {
        const monthlyEquiv = r.amount / (freqDivisor[r.frequency] || 1)
        const label = freqLabels[r.frequency] || 'month'
        result.push({ type: 'unused_sub', severity: 'high', title: `${r.name} — no usage this ${label}`, description: `${r.frequency === 'yearly' ? `$${r.amount.toLocaleString()}/yr ($${Math.round(monthlyEquiv).toLocaleString()}/mo equiv)` : r.frequency === 'quarterly' ? `$${r.amount.toLocaleString()}/qtr ($${Math.round(monthlyEquiv).toLocaleString()}/mo equiv)` : `$${r.amount.toLocaleString()}/mo`} — no matching transactions in ${window} days`, monthlyAmount: Math.round(monthlyEquiv), action: 'Review subscription', recurringId: r.id })
      }
    })
    // Bank fees
    const feeKw = ['comisión', 'comision', 'fee', 'cargo', 'anualidad', 'penalización', 'penalty']
    const fees = transactions.filter(t => feeKw.some(k => t.description?.toLowerCase().includes(k) || t.merchant?.toLowerCase().includes(k)))
    if (fees.length > 0) {
      const total = fees.reduce((s, t) => s + t.amount_mxn, 0)
      result.push({ type: 'bank_fee', severity: total > 500 ? 'high' : 'medium', title: `${fees.length} fee charges`, description: 'Bank fees and penalties', monthlyAmount: total, action: 'Switch accounts or negotiate' })
    }
    return result.sort((a, b) => b.monthlyAmount - a.monthlyAmount)
  }, [transactions, recurring])

  const totalLeakAmount = leaks.reduce((s, l) => s + l.monthlyAmount, 0)

  // ── Category Scores ───────────────────────────────
  const categoryScores = useMemo<CategoryScore[]>(() => {
    const catMap = new Map<string, { spent: number; txCount: number; prevSpent: number }>()
    transactions.forEach(t => {
      const cid = t.category_id || 'other'
      const cur = catMap.get(cid) || { spent: 0, txCount: 0, prevSpent: 0 }
      cur.spent += t.amount_mxn; cur.txCount++
      catMap.set(cid, cur)
    })
    prevTransactions.forEach(t => {
      const cid = t.category_id || 'other'
      const cur = catMap.get(cid) || { spent: 0, txCount: 0, prevSpent: 0 }
      cur.prevSpent += t.amount_mxn
      catMap.set(cid, cur)
    })

    return Array.from(catMap.entries()).map(([cid, data]) => {
      const cat = categories.find(c => c.id === cid)
      const budget = budgets.find(b => b.category_id === cid)
      const budgetAmt = budget?.amount || 0
      const budgetPct = budgetAmt > 0 ? data.spent / budgetAmt : 1.5 // No budget = assume overspending
      const trend = data.prevSpent > 0 ? ((data.spent - data.prevSpent) / data.prevSpent) * 100 : 0

      const budgetScore = budgetPct <= 0.8 ? 5 : budgetPct <= 1.0 ? 4 : budgetPct <= 1.2 ? 2 : 1
      const trendScore = trend <= -10 ? 5 : trend <= 0 ? 4 : trend <= 10 ? 3 : trend <= 25 ? 2 : 1
      const freqScore = data.txCount <= 10 ? 5 : data.txCount <= 20 ? 4 : data.txCount <= 30 ? 2 : 1
      const totalScore = (budgetScore * 8) + (trendScore * 6) + (freqScore * 6) // weighted to 100

      return { id: cid, name: cat?.name || cid, icon: cat?.icon || '📦', spent: data.spent, budget: budgetAmt, grade: gradeFromScore(totalScore), trend: Math.round(trend), txCount: data.txCount, budgetScore, trendScore, freqScore }
    }).sort((a, b) => b.spent - a.spent)
  }, [transactions, prevTransactions, budgets, categories])

  const overallScore = categoryScores.length > 0 ? Math.round(categoryScores.reduce((s, c) => s + (c.budgetScore * 8 + c.trendScore * 6 + c.freqScore * 6), 0) / categoryScores.length) : 0
  const overallGrade = gradeFromScore(overallScore)

  // ── Top 10s ───────────────────────────────────────
  const top10Largest = [...transactions].sort((a, b) => b.amount_mxn - a.amount_mxn).slice(0, 10)
  const top10Frequent = useMemo<MerchantGroup[]>(() => {
    const map = new Map<string, { count: number; total: number }>()
    transactions.forEach(t => {
      const m = t.merchant || t.description || 'Unknown'
      const cur = map.get(m) || { count: 0, total: 0 }
      cur.count++; cur.total += t.amount_mxn
      map.set(m, cur)
    })
    return Array.from(map.entries()).map(([merchant, d]) => ({ merchant, ...d })).sort((a, b) => b.count - a.count).slice(0, 10)
  }, [transactions])

  // ── Merchant Concentration ────────────────────────
  const merchantConcentration = useMemo<CatConcentration[]>(() => {
    const catMerchants = new Map<string, Map<string, number>>()
    transactions.forEach(t => {
      const cid = t.category_id || 'other'
      const m = t.merchant || 'Unknown'
      if (!catMerchants.has(cid)) catMerchants.set(cid, new Map())
      const merchants = catMerchants.get(cid)!
      merchants.set(m, (merchants.get(m) || 0) + t.amount_mxn)
    })
    return Array.from(catMerchants.entries()).map(([cid, merchants]) => {
      const cat = categories.find(c => c.id === cid)
      const total = Array.from(merchants.values()).reduce((s, v) => s + v, 0)
      const sorted = Array.from(merchants.entries()).map(([name, amount]) => ({ name, amount, pct: Math.round((amount / total) * 100) })).sort((a, b) => b.amount - a.amount)
      return { name: cat?.name || cid, icon: cat?.icon || '📦', total, merchants: sorted }
    }).filter(c => c.merchants.length > 1).sort((a, b) => b.total - a.total).slice(0, 6)
  }, [transactions, categories])

  // ── Heatmap ───────────────────────────────────────
  const heatmapData = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const grid: Record<string, number[]> = {}
    const amounts: Record<string, number[]> = {}
    days.forEach(d => { grid[d] = Array(10).fill(0); amounts[d] = Array(10).fill(0) })
    transactions.forEach(t => {
      const d = new Date(t.transaction_date)
      const day = days[d.getDay()]
      const hour = d.getHours?.() || 12 // fallback if no time
      const bucket = Math.min(Math.max(Math.floor((hour - 6) / 2), 0), 9)
      grid[day][bucket] += t.amount_mxn
      amounts[day][bucket] += t.amount_mxn
    })
    // Normalize
    const maxVal = Math.max(1, ...days.flatMap(d => grid[d]))
    days.forEach(d => { grid[d] = grid[d].map(v => v / maxVal) })
    return { grid, amounts, days }
  }, [transactions])

  // Savings potential (simple estimate)
  const totalSavings = totalLeakAmount + Math.round(monthlySpend * 0.05)

  const toggleFlag = (id: string) => {
    setFlaggedSubs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Expense Audit</h1>
          <p className="text-[hsl(var(--text-secondary))] text-sm">Forensic spending analysis for {monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthOffset(m => m - 1)} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))]"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium min-w-[140px] text-center">{monthLabel}</span>
          <button onClick={() => setMonthOffset(m => m + 1)} className="p-1.5 rounded-md hover:bg-[hsl(var(--bg-elevated))]"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* ── FINANCIAL HEALTH SCORE — SVG ring ── */}
      {investmentAudit && (() => {
        const score = investmentAudit.score
        const ringColor = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444'
        const scoreLabel = score >= 80 ? '✅ Good' : score >= 60 ? '⚠️ Fair' : '🔴 Needs Work'
        const scoreLabelCls = score >= 80 ? 'bg-emerald-500/10 text-emerald-400' : score >= 60 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
        const catConfig: { key: string; label: string; max: number }[] = [
          { key: 'west_readiness', label: 'WEST Readiness', max: 25 },
          { key: 'debt_health', label: 'Debt Health', max: 20 },
          { key: 'investment_diversity', label: 'Investment Diversity', max: 15 },
          { key: 'liquidity', label: 'Liquidity', max: 15 },
          { key: 'retirement', label: 'Retirement Progress', max: 15 },
          { key: 'net_worth_trend', label: 'Net Worth Trend', max: 10 },
        ]
        return (
          <GlassCard className="p-5 sm:p-6 mb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-8">
              {/* SVG ring */}
              <div className="flex flex-col items-center sm:items-start shrink-0">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(222, 47%, 9%)" strokeWidth="10" />
                    <circle cx="50" cy="50" r="40" fill="none"
                      stroke={ringColor} strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${(score / 100) * 251.2} 251.2`}
                      className="transition-all duration-700" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold tabular-nums">{score}</span>
                    <span className="text-[10px] text-[hsl(var(--text-tertiary))]">/ 100</span>
                  </div>
                </div>
                <span className={cn("mt-2 text-sm font-semibold px-3 py-1 rounded-full", scoreLabelCls)}>{scoreLabel}</span>
              </div>
              {/* Category bars */}
              <div className="flex-1 space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Financial Health Score</h3>
                {catConfig.map(cat => {
                  const val = investmentAudit.score_breakdown[cat.key] || 0
                  const pct = (val / cat.max) * 100
                  return (
                    <div key={cat.key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{cat.label}</span>
                        <span className="text-xs tabular-nums text-[hsl(var(--text-secondary))]">{val}/{cat.max}pts</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[hsl(var(--bg-elevated))]">
                        <div className={cn("h-1.5 rounded-full transition-all duration-500",
                          pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500')}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </GlassCard>
        )
      })()}

      {/* Hero KPIs */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Monthly Spend</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-rose-400 mt-1">${monthlySpend.toLocaleString()}</p>
          <TrendBadge value={-spendDelta} suffix="% vs last month" />
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Leaks Found</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-rose-400 mt-1">{leaks.length}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">${totalLeakAmount.toLocaleString()}/mo wasted</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Savings Potential</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-400 mt-1">${totalSavings.toLocaleString()}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">/mo across all tiers</p>
        </GlassCard>
        <GlassCard className="relative overflow-hidden">
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Overall Grade</span>
          <motion.p className={cn("text-4xl sm:text-5xl font-black mt-1", gradeColor(overallGrade))}
            initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
            {transactions.length > 0 ? overallGrade : '—'}
          </motion.p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{gradeLabel(overallGrade)}</p>
        </GlassCard>
      </div>

      {/* Heatmap + Category Scorecards */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <GlassCard>
          <h3 className="text-base font-semibold mb-2">Spending Heatmap</h3>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">When do you spend most? Darker = more.</p>
          <div className="overflow-x-auto">
            <div className="min-w-[340px]">
              <div className="flex items-center gap-1 mb-1 pl-10">
                {['6a', '8a', '10a', '12p', '2p', '4p', '6p', '8p', '10p', '12a'].map(t => (
                  <span key={t} className="flex-1 text-[9px] text-[hsl(var(--text-tertiary))] text-center">{t}</span>
                ))}
              </div>
              {heatmapData.days.map(day => (
                <div key={day} className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-[hsl(var(--text-tertiary))] w-8 text-right shrink-0">{day}</span>
                  {heatmapData.grid[day].map((val, h) => (
                    <motion.div key={h} className="flex-1 h-6 sm:h-7 rounded-sm cursor-pointer"
                      style={{ backgroundColor: val > 0 ? `rgba(244, 63, 94, ${0.15 + val * 0.75})` : 'hsl(222, 20%, 10%)' }}
                      whileHover={{ scale: 1.15, zIndex: 10 }}
                      title={`${day}: $${heatmapData.amounts[day][h].toLocaleString()}`} />
                  ))}
                </div>
              ))}
              <div className="flex items-center justify-end gap-1 mt-2">
                <span className="text-[9px] text-[hsl(var(--text-tertiary))]">Less</span>
                {[0.1, 0.3, 0.5, 0.7, 0.9].map(v => (
                  <div key={v} className="h-3 w-5 rounded-sm" style={{ backgroundColor: `rgba(244, 63, 94, ${0.15 + v * 0.75})` }} />
                ))}
                <span className="text-[9px] text-[hsl(var(--text-tertiary))]">More</span>
              </div>
            </div>
          </div>
        </GlassCard>

        <GlassCard>
          <h3 className="text-base font-semibold mb-2">Category Scorecards</h3>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">Graded on budget adherence, trend, and frequency.</p>
          {categoryScores.length === 0 ? (
            <div className="text-center py-8"><p className="text-sm text-[hsl(var(--text-tertiary))]">No spending data for this month</p></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categoryScores.slice(0, 9).map((cat, idx) => (
                <motion.div key={cat.id} className={cn("p-3 rounded-xl border transition-all",
                  cat.grade === 'F' ? "border-rose-500/30 bg-rose-500/5" : cat.grade === 'D' ? "border-orange-500/30 bg-orange-500/5" : cat.grade === 'C' ? "border-amber-500/30 bg-amber-500/5" : cat.grade === 'B' ? "border-blue-500/30 bg-blue-500/5" : "border-emerald-500/30 bg-emerald-500/5"
                )} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.4, delay: idx * 0.05 }}>
                  <div className="flex items-center justify-between mb-2"><span className="text-xl">{cat.icon}</span><span className={cn("text-2xl font-black", gradeColor(cat.grade))}>{cat.grade}</span></div>
                  <h4 className="text-xs font-semibold truncate">{cat.name}</h4>
                  <p className="text-lg font-bold tabular-nums mt-1">${cat.spent.toLocaleString()}</p>
                  <TrendBadge value={-cat.trend} />
                  <div className="mt-2 pt-2 border-t border-[hsl(var(--border))]/50 space-y-0.5">
                    {[{ label: 'Budget', score: cat.budgetScore }, { label: 'Trend', score: cat.trendScore }, { label: 'Freq', score: cat.freqScore }].map(s => (
                      <div key={s.label} className="flex items-center justify-between">
                        <span className="text-[9px] text-[hsl(var(--text-tertiary))]">{s.label}</span>
                        <div className="flex gap-px">{[1, 2, 3, 4, 5].map(i => <div key={i} className={cn("h-1 w-2 rounded-full", i <= s.score ? gradeBg(cat.grade) : "bg-[hsl(var(--bg-elevated))]")} style={i <= s.score ? { opacity: 0.7 } : undefined} />)}</div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Leak Detection */}
      <GlassCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div><h3 className="text-base font-semibold">🚨 Money Leaks Detected</h3><p className="text-xs text-[hsl(var(--text-tertiary))]">Fees, unused services, and avoidable charges</p></div>
          <span className="text-sm font-bold tabular-nums text-rose-400">${totalLeakAmount.toLocaleString()}/mo wasted</span>
        </div>
        {leaks.length === 0 ? (
          <div className="text-center py-8"><span className="text-3xl block mb-2">✨</span><p className="text-sm text-emerald-400 font-medium">No leaks detected — nice!</p></div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {leaks.map((leak, i) => (
              <motion.div key={i} className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 relative overflow-hidden"
                initial={{ x: -2 }} animate={{ x: [0, -1, 1, -1, 0] }} transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}>
                <div className="flex items-start gap-3">
                  <span className="text-xl shrink-0">{leak.type === 'unused_sub' ? '👻' : leak.type === 'bank_fee' ? '🏦' : '⚠️'}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold">{leak.title}</h4>
                    <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{leak.description}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm font-bold tabular-nums text-rose-400">${leak.monthlyAmount.toLocaleString()}/mo</span>
                      <span className="text-xs text-[hsl(var(--text-tertiary))] tabular-nums">${(leak.monthlyAmount * 12).toLocaleString()}/yr</span>
                    </div>
                    {leak.recurringId ? (
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => handleLeakTriage(leak.recurringId!, 'keep')}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors">✅ Keep</button>
                        <button onClick={() => handleLeakTriage(leak.recurringId!, 'cancel')}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors">❌ Cancel</button>
                        <button onClick={() => handleLeakTriage(leak.recurringId!, 'later')}
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors">⏰ Later</button>
                      </div>
                    ) : (
                      <button onClick={() => router.push('/finance/subscriptions')} className="mt-2 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors">{leak.action} →</button>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Crypto Portfolio Risks */}
      {(cryptoRisks.length > 0 || cryptoValue > 0) && (
        <GlassCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div><h3 className="text-base font-semibold">₿ Crypto Portfolio Audit</h3><p className="text-xs text-[hsl(var(--text-tertiary))]">Risk assessment for your crypto holdings</p></div>
            <span className="text-sm font-bold tabular-nums text-orange-400">${cryptoValue.toLocaleString()} MXN</span>
          </div>
          {cryptoRisks.length === 0 ? (
            <div className="text-center py-6"><span className="text-3xl block mb-2">✅</span><p className="text-sm text-emerald-400 font-medium">No crypto risks detected</p></div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              {cryptoRisks.map((risk, i) => (
                <div key={i} className={cn("p-4 rounded-xl border", risk.severity === 'high' ? 'border-rose-500/30 bg-rose-500/5' : risk.severity === 'medium' ? 'border-amber-500/30 bg-amber-500/5' : 'border-blue-500/30 bg-blue-500/5')}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl shrink-0">{risk.type === 'concentration' ? '⚖️' : risk.type === 'loss' ? '📉' : '⚠️'}</span>
                    <div>
                      <h4 className="text-sm font-semibold">{risk.title}</h4>
                      <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">{risk.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {/* ── INVESTMENT HEALTH — grouped by category ── */}
      {investmentAudit && investmentAudit.findings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Investment Health</h2>
            <span className="text-xs text-[hsl(var(--text-secondary))]">{investmentAudit.findings.length} findings</span>
          </div>
          {(['crypto', 'real_estate', 'fixed_income', 'retirement', 'general'] as const).map(cat => {
            const catFindings = investmentAudit.findings.filter(f => f.category === cat)
            if (catFindings.length === 0) return null
            const catIcons: Record<string, string> = { crypto: '₿', real_estate: '🏠', fixed_income: '🏦', retirement: '🔒', general: '📊' }
            const catLabels: Record<string, string> = { crypto: 'Crypto', real_estate: 'Real Estate', fixed_income: 'Fixed Income', retirement: 'Retirement', general: 'General' }
            return (
              <div key={cat} className="mb-4">
                <p className="text-xs font-semibold text-[hsl(var(--text-tertiary))] uppercase tracking-wider mb-2 px-1">
                  {catIcons[cat]} {catLabels[cat]}
                </p>
                <div className="space-y-2">
                  {catFindings.map(f => {
                    const sev = {
                      red:   { bg: 'bg-red-500/5 border-red-500/30',       icon: '🔴' },
                      amber: { bg: 'bg-yellow-500/5 border-yellow-500/30', icon: '🟡' },
                      green: { bg: 'bg-emerald-500/5 border-emerald-500/20', icon: '✅' },
                    }[f.severity] || { bg: 'bg-amber-500/5 border-amber-500/20', icon: '🟡' }
                    return (
                      <div key={f.id} className={cn("rounded-lg border p-4", sev.bg)}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs">{sev.icon}</span>
                              <p className="text-sm font-medium">{f.title}</p>
                            </div>
                            <p className="text-sm text-[hsl(var(--text-secondary))] leading-relaxed">{f.detail}</p>
                            {f.suggestion && <p className="text-xs text-[hsl(var(--text-secondary))] mt-1.5 italic">{f.suggestion}</p>}
                          </div>
                          {f.action_url && (
                            <a href={f.action_url} className="text-xs font-medium text-blue-400 hover:underline whitespace-nowrap shrink-0">
                              Take Action →
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Top 10 Lists */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">📊 Largest Expenses</h3>
          {top10Largest.length === 0 ? <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-4">No expenses this month</p> : (
            <div className="space-y-2">
              {top10Largest.map((tx, i) => {
                const cat = categories.find(c => c.id === tx.category_id)
                return (
                  <div key={tx.id} className="flex items-center gap-3">
                    <span className={cn("text-sm font-bold w-6 text-center tabular-nums", i < 3 ? "text-rose-400" : "text-[hsl(var(--text-tertiary))]")}>{i + 1}</span>
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center text-sm shrink-0" style={{ background: 'rgba(107,114,128,0.12)' }}>{cat?.icon || '📦'}</div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{tx.merchant || tx.description || '—'}</p><p className="text-xs text-[hsl(var(--text-tertiary))]">{tx.transaction_date.slice(5)} · {cat?.name || 'Other'}</p></div>
                    <div className="text-right shrink-0"><span className="text-sm font-semibold tabular-nums text-rose-400">${tx.amount_mxn.toLocaleString()}</span>{monthlySpend > 0 && <p className="text-[10px] text-[hsl(var(--text-tertiary))] tabular-nums">{((tx.amount_mxn / monthlySpend) * 100).toFixed(1)}%</p>}</div>
                  </div>
                )
              })}
            </div>
          )}
        </GlassCard>
        <GlassCard>
          <h3 className="text-base font-semibold mb-4">🔄 Most Frequent Purchases</h3>
          {top10Frequent.length === 0 ? <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-4">No data</p> : (
            <div className="space-y-2">
              {top10Frequent.map((g, i) => (
                <div key={g.merchant} className="flex items-center gap-3">
                  <span className={cn("text-sm font-bold w-6 text-center tabular-nums", i < 3 ? "text-amber-400" : "text-[hsl(var(--text-tertiary))]")}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><p className="text-sm font-medium truncate">{g.merchant}</p><span className="text-xs px-1.5 py-0.5 rounded-full bg-[hsl(var(--bg-elevated))] text-[hsl(var(--text-tertiary))] shrink-0">×{g.count}</span></div>
                    <div className="h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] mt-1"><div className="h-1.5 rounded-full bg-amber-500/50" style={{ width: `${(g.count / top10Frequent[0].count) * 100}%` }} /></div>
                  </div>
                  <div className="text-right shrink-0"><span className="text-sm font-semibold tabular-nums">${g.total.toLocaleString()}</span><p className="text-[10px] text-[hsl(var(--text-tertiary))] tabular-nums">avg ${Math.round(g.total / g.count).toLocaleString()}</p></div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Merchant Concentration */}
      {merchantConcentration.length > 0 && (
        <GlassCard>
          <h3 className="text-base font-semibold mb-2">🏪 Merchant Concentration</h3>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mb-4">Over-reliant on any single vendor?</p>
          <div className="space-y-4">
            {merchantConcentration.map(cat => (
              <div key={cat.name}>
                <div className="flex items-center gap-2 mb-2"><span className="text-sm">{cat.icon}</span><span className="text-sm font-semibold">{cat.name}</span><span className="text-xs text-[hsl(var(--text-tertiary))] tabular-nums">${cat.total.toLocaleString()}</span></div>
                <div className="h-6 rounded-lg overflow-hidden flex bg-[hsl(var(--bg-elevated))]">
                  {cat.merchants.slice(0, 6).map((m, mi) => (
                    <motion.div key={m.name} className="h-full flex items-center justify-center overflow-hidden"
                      style={{ width: `${m.pct}%`, backgroundColor: `hsl(${(mi * 50 + 200) % 360}, 60%, 50%)`, opacity: 0.7 }}
                      initial={{ width: 0 }} animate={{ width: `${m.pct}%` }} transition={{ duration: 0.5, delay: mi * 0.05 }}
                      title={`${m.name}: ${m.pct}%`}>
                      {m.pct >= 15 && <span className="text-[9px] font-medium text-white truncate px-1">{m.name}</span>}
                    </motion.div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                  {cat.merchants.slice(0, 5).map((m, mi) => (
                    <div key={m.name} className="flex items-center gap-1"><div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: `hsl(${(mi * 50 + 200) % 360}, 60%, 50%)` }} /><span className="text-[10px] text-[hsl(var(--text-secondary))]">{m.name} {m.pct}%</span></div>
                  ))}
                </div>
                {cat.merchants[0]?.pct >= 60 && !['Health','Rent/Mortgage','Utilities','Electricity','Insurance','Education'].includes(cat.name) && <p className="text-[10px] text-amber-400 mt-1">⚠️ {cat.merchants[0].name} accounts for {cat.merchants[0].pct}% — consider diversifying</p>}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Subscription Audit */}
      {recurring.length > 0 && (
        <GlassCard>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div><h3 className="text-base font-semibold">📋 Subscription Audit</h3><p className="text-xs text-[hsl(var(--text-tertiary))]">{recurring.length} active · ${recurring.reduce((s, r) => s + r.amount / ({ weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12 }[r.frequency] || 1), 0).toLocaleString()}/mo equiv</p></div>
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-[hsl(var(--border))]">
                {['Service', 'Monthly', 'Annual', 'Flag'].map((h, i) => (
                  <th key={i} className={cn("text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3", i >= 1 && i <= 2 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {recurring.map(sub => (
                  <tr key={sub.id} className={cn("border-b border-[hsl(var(--border))] last:border-0 transition-colors", flaggedSubs.has(sub.id) && "bg-rose-500/5")}>
                    <td className="py-3 px-3"><p className="text-sm font-medium">{sub.name}</p><p className="text-xs text-[hsl(var(--text-tertiary))]">{sub.merchant}</p></td>
                    <td className="py-3 px-3 text-right text-sm font-semibold tabular-nums">{(() => { const d = { weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12 } as Record<string,number>; const mo = Math.round(sub.amount / (d[sub.frequency] || 1)); return `$${mo.toLocaleString()}/mo`; })()}{sub.frequency !== 'monthly' && <span className="text-xs text-[hsl(var(--text-tertiary))] ml-1">({sub.frequency})</span>}</td>
                    <td className="py-3 px-3 text-right text-sm tabular-nums text-[hsl(var(--text-secondary))]">{(() => { const d = { weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12 } as Record<string,number>; const annual = Math.round(sub.amount / (d[sub.frequency] || 1) * 12); return `$${annual.toLocaleString()}`; })()}/yr</td>
                    <td className="py-3 px-3"><button onClick={() => toggleFlag(sub.id)} className={cn("p-1.5 rounded-md transition-all", flaggedSubs.has(sub.id) ? "bg-rose-500/20 text-rose-400" : "text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-elevated))]")}>{flaggedSubs.has(sub.id) ? '🚩' : '⚑'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sm:hidden space-y-2">
            {recurring.map(sub => (
              <div key={sub.id} className={cn("p-3 rounded-lg border", flaggedSubs.has(sub.id) ? "border-rose-500/30 bg-rose-500/5" : "border-[hsl(var(--border))] bg-[hsl(var(--bg-elevated))]/30")}>
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{sub.name}</span><button onClick={() => toggleFlag(sub.id)} className={cn("p-1 rounded", flaggedSubs.has(sub.id) ? "text-rose-400" : "text-[hsl(var(--text-tertiary))]")}>{flaggedSubs.has(sub.id) ? '🚩' : '⚑'}</button></div>
                <div className="flex items-center justify-between mt-1"><span className="text-sm font-semibold tabular-nums">${sub.amount.toLocaleString()}/mo</span><span className="text-xs text-[hsl(var(--text-tertiary))]">{sub.merchant}</span></div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
    </PageTransition>
  )
}
