'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, BarChart3, Bitcoin, ChevronLeft, ChevronRight, ClipboardList, Flag, Ghost, House,
  Landmark, Lock, Receipt, Repeat, Scale, ShieldAlert, Store, TrendingDown,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PageTransition } from '@/components/page-transition'
import { Page, PageHeader } from '@/components/ui/page'
import { Card, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import { StatusPill } from '@/components/ui/status-pill'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CategoryIcon } from '@/components/ui/category-icon'
import { ErrorState } from '@/components/ui/error-state'
import { TrendBadge } from '@/components/ui/trend-badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEFAULT_CATEGORIES } from '@/lib/finance-utils'
import { addDaysKey, addMonthsKey, daysInMonth, localDateKey, monthEndKey, monthKey, nextMonthStartKey, parseLocalDateKey } from '@/lib/dates'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { Segmented } from '@/components/ui/segmented'
import { formatDateShort, formatMoney, formatMonthLong, formatPct, formatTrendPct } from '@/lib/format'
import { categoryColor } from '@/lib/category-icons'
import type { Tone } from '@/lib/budget-tone'
import type { FinanceTransaction, FinanceRecurring, FinanceBudget } from '@/lib/finance-types'

// ── Helpers ──────────────────────────────────────────
// Grades carry meaning through the tone palette only (no blue/indigo, VIS-03).
function gradeTone(g: string): Tone {
  return g === 'A' || g === 'B' ? 'positive' : g === 'C' ? 'warning' : 'negative'
}
const GRADE_TEXT: Record<Tone, string> = { positive: 'text-positive', warning: 'text-warning', negative: 'text-negative', neutral: 'text-fg-secondary' }
const GRADE_FILL: Record<Tone, string> = { positive: 'bg-positive', warning: 'bg-warning', negative: 'bg-negative', neutral: 'bg-fg-tertiary' }
function gradeLabel(g: string) {
  return g === 'A' ? 'Excellent' : g === 'B' ? 'Good' : g === 'C' ? 'Average' : g === 'D' ? 'Below average' : 'Critical'
}
function gradeFromScore(s: number) { return s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 50 ? 'C' : s >= 30 ? 'D' : 'F' }

const FREQ_DIVISOR: Record<string, number> = { weekly: 0.25, biweekly: 0.5, monthly: 1, quarterly: 3, yearly: 12 }
const monthlyEquivalent = (r: Pick<FinanceRecurring, 'amount' | 'frequency'>) => r.amount / (FREQ_DIVISOR[r.frequency] || 1)

/** Weekday rows, Monday first; JS getDay() index for each. */
export const HEATMAP_WEEKDAYS = [
  { label: 'Mon', day: 1 }, { label: 'Tue', day: 2 }, { label: 'Wed', day: 3 }, { label: 'Thu', day: 4 },
  { label: 'Fri', day: 5 }, { label: 'Sat', day: 6 }, { label: 'Sun', day: 0 },
] as const

export interface HeatmapCell { date: string; day: number; weekday: string; amount: number; count: number; intensity: number; future: boolean }

/** Bills tied to a schedule (rent, subscriptions, installments) — they swamp day-to-day patterns. */
export function isScheduledSpend(t: Pick<FinanceTransaction, 'recurring_id' | 'installment_id' | 'is_recurring' | 'source' | 'tags'>) {
  return !!(t.recurring_id || t.installment_id || t.is_recurring || t.source === 'recurring_expense' || t.tags?.some(tag => tag.startsWith('auto-')))
}

/**
 * Day-of-week × week-of-month grid (VIS-08, F16). Transactions are date-only,
 * so dates are parsed as LOCAL calendar days — `new Date('YYYY-MM-DD')` is UTC
 * midnight and lands on the previous weekday in Mexico City.
 * Intensity is sqrt-scaled against the 90th-percentile day so one rent day
 * doesn't flatten the rest of the month.
 */
export function buildSpendingHeatmap(month: string, rows: Array<Pick<FinanceTransaction, 'transaction_date' | 'amount_mxn'>>, today = localDateKey()) {
  const [y, m] = month.split('-').map(Number)
  const totals = new Map<string, { amount: number; count: number }>()
  for (const t of rows) {
    const key = t.transaction_date.slice(0, 10)
    const cur = totals.get(key) || { amount: 0, count: 0 }
    cur.amount += Number(t.amount_mxn) || 0
    cur.count++
    totals.set(key, cur)
  }
  const days = daysInMonth(y, m)
  const firstWeekday = (parseLocalDateKey(`${month}-01`).getDay() + 6) % 7 // Monday = 0
  const weeks = Math.ceil((firstWeekday + days) / 7)
  const grid: Array<Array<HeatmapCell | null>> = Array.from({ length: weeks }, () => Array(7).fill(null))
  const amounts = Array.from(totals.values()).map(v => v.amount).filter(a => a > 0).sort((a, b) => a - b)
  const max = amounts.length ? amounts[amounts.length - 1] : 0
  const cap = amounts.length ? amounts[Math.min(amounts.length - 1, Math.floor(amounts.length * 0.9))] : 0
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    const local = parseLocalDateKey(date)
    const col = (local.getDay() + 6) % 7
    const row = Math.floor((firstWeekday + d - 1) / 7)
    const v = totals.get(date) || { amount: 0, count: 0 }
    grid[row][col] = { date, day: d, weekday: HEATMAP_WEEKDAYS[col].label, amount: v.amount, count: v.count, intensity: cap > 0 ? Math.min(1, Math.sqrt(v.amount / cap)) : 0, future: date > today }
  }
  const byWeekday = HEATMAP_WEEKDAYS.map((w, col) => ({
    label: w.label,
    amount: grid.reduce((s, week) => s + (week[col]?.amount || 0), 0),
  }))
  const spendDays = amounts.length
  const total = amounts.reduce((s, a) => s + a, 0)
  let peak: HeatmapCell | null = null
  for (const week of grid) for (const c of week) if (c && c.amount > 0 && (!peak || c.amount > peak.amount)) peak = c
  return { grid, byWeekday, max, cap, spendDays, avgPerSpendDay: spendDays ? total / spendDays : 0, peak }
}

type UsageRow = Pick<FinanceTransaction, 'transaction_date' | 'recurring_id' | 'merchant' | 'description'>
// Billing dates drift a few days month to month; don't call a sub unused on day 31.
const USAGE_GRACE_DAYS = 5

interface Leak { type: string; title: string; description: string; monthlyAmount: number; action: string; severity: 'high' | 'medium' | 'low'; recurringId?: string }
interface CategoryScore { id: string; name: string; icon: string; colorIndex: number; spent: number; budget: number; grade: string; trend: number; txCount: number; budgetScore: number; trendScore: number; freqScore: number }
interface MerchantGroup { merchant: string; count: number; total: number }
interface CatConcentration { name: string; icon: string; colorIndex: number; total: number; merchants: { name: string; pct: number; amount: number }[] }
type Risk = { type: string; title: string; detail: string; severity: 'high' | 'medium' | 'low' }

const SEVERITY_TONE: Record<string, Tone> = { red: 'negative', amber: 'warning', green: 'positive', high: 'negative', medium: 'warning', low: 'neutral' }
const SEVERITY_WORD: Record<string, string> = { red: 'Act', amber: 'Watch', green: 'OK', high: 'High', medium: 'Medium', low: 'Low' }
const FINDING_GROUPS = [
  { key: 'crypto', label: 'Crypto', Icon: Bitcoin },
  { key: 'real_estate', label: 'Real Estate', Icon: House },
  { key: 'fixed_income', label: 'Fixed Income', Icon: Landmark },
  { key: 'retirement', label: 'Retirement', Icon: Lock },
  { key: 'general', label: 'General', Icon: BarChart3 },
] as const
const NON_DIVERSIFIABLE = ['Health', 'Rent/Mortgage', 'Utilities', 'Electricity', 'Insurance', 'Education']

export default function AuditClient() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([])
  const [prevTransactions, setPrevTransactions] = useState<FinanceTransaction[]>([])
  const [recurring, setRecurring] = useState<FinanceRecurring[]>([])
  const [budgets, setBudgets] = useState<FinanceBudget[]>([])
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string; color: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [flaggedSubs, setFlaggedSubs] = useState<Set<string>>(new Set())
  // Expenses over the year before the month's anchor — subscription usage is judged here,
  // not against the selected month alone (a yearly sub was never charged "this month").
  const [usageWindow, setUsageWindow] = useState<UsageRow[] | null>(null)
  const [heatScope, setHeatScope] = useState<'everyday' | 'all'>('everyday')
  // Stable per mount: keeps the 30-day snooze check from flickering mid-session
  const [snoozeNow] = useState(() => Date.now())
  const [cryptoRisks, setCryptoRisks] = useState<Risk[]>([])
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

  // Month nav — string month keys, local calendar (never toISOString).
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const currentMonth = monthKey(new Date())
  const monthLabel = formatMonthLong(month)
  const monthStart = `${month}-01`
  const monthEnd = nextMonthStartKey(month)
  const prevMonthStart = `${addMonthsKey(month, -1)}-01`
  const isCurrentMonth = month === currentMonth
  // Usage is measured back from today in the current month, from month end in past months.
  const usageAnchor = isCurrentMonth ? localDateKey() : monthEndKey(month)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const usageFrom = addDaysKey(usageAnchor, -(365 + USAGE_GRACE_DAYS))
    const [txRes, prevTxRes, recRes, budRes, catRes, usageRes] = await Promise.all([
      supabase.from('finance_transactions').select('*').gte('transaction_date', monthStart).lt('transaction_date', monthEnd).eq('type', 'expense'),
      supabase.from('finance_transactions').select('*').gte('transaction_date', prevMonthStart).lt('transaction_date', monthStart).eq('type', 'expense'),
      supabase.from('finance_recurring').select('*').eq('is_active', true),
      supabase.from('finance_budgets').select('*').eq('month', monthStart),
      supabase.from('finance_categories').select('*').order('sort_order'),
      fetchAllRows<UsageRow>((from, to) =>
        supabase.from('finance_transactions').select('id, transaction_date, recurring_id, merchant, description')
          .eq('type', 'expense').gte('transaction_date', usageFrom).lte('transaction_date', usageAnchor)
          .order('transaction_date', { ascending: false }).order('id').range(from, to), 1000, 20000, true,
      ).catch(() => null),
    ])
    setUsageWindow(usageRes)
    setLoadError(!!(txRes.error || prevTxRes.error))
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
        const risks: Risk[] = []

        if (holdings.length > 0) {
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

          for (const [sym, val] of Object.entries(bySymbol)) {
            const pct = totalVal > 0 ? (val / totalVal) * 100 : 0
            if (pct > 80) {
              risks.push({ type: 'concentration', title: `${sym} concentration: ${pct.toFixed(0)}%`, detail: `${sym} represents ${pct.toFixed(0)}% of your crypto portfolio. Consider diversifying to reduce single-asset risk.`, severity: 'medium' })
            }
          }

          if (totalCost > 0) {
            const pnlPct = ((totalVal - totalCost) / totalCost) * 100
            if (pnlPct < -20) {
              risks.push({ type: 'loss', title: `Unrealized crypto loss: ${pnlPct.toFixed(1)}%`, detail: `Your crypto portfolio is down ${Math.abs(pnlPct).toFixed(1)}% (${formatMoney(Math.abs(totalVal - totalCost))}). Consider DCA strategy to lower cost basis.`, severity: pnlPct < -40 ? 'high' : 'medium' })
            }
          }
        }
        setCryptoRisks(risks)
      }
    } catch { /* crypto fetch failed, non-blocking */ }

    setLoading(false)
  }, [monthStart, monthEnd, prevMonthStart, usageAnchor])

  useEffect(() => { fetchData(); const h = () => { if (document.visibilityState === "visible") fetchData() }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h) }, [fetchData])

  // ── KPIs ──────────────────────────────────────────
  const monthlySpend = transactions.reduce((s, t) => s + t.amount_mxn, 0)
  const prevSpend = prevTransactions.reduce((s, t) => s + t.amount_mxn, 0)
  const spendDelta = prevSpend > 0 ? ((monthlySpend - prevSpend) / prevSpend) * 100 : 0

  // ── Leaks ─────────────────────────────────────────
  const leaks = useMemo<Leak[]>(() => {
    const result: Leak[] = []
    const freqDays: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365 }
    const freqLabels: Record<string, string> = { weekly: 'week', biweekly: '2 weeks', monthly: 'month', quarterly: 'quarter', yearly: 'year' }
    recurring.forEach(r => {
      // Skip reviewed subs: 'keep' = permanent dismiss, 'later' = 30 day snooze
      const ls = (r as any).leak_status
      const lra = (r as any).leak_reviewed_at
      if (ls === 'keep') return
      if (ls === 'later' && lra && (snoozeNow - new Date(lra).getTime()) < 30 * 86400000) return
      // Skip debt-linked subscriptions — these are auto-tracked debt payments, not discretionary
      if ((r as any).debt_id) return

      if (!usageWindow) return
      const window = freqDays[r.frequency] || 30
      const cutoff = addDaysKey(usageAnchor, -(window + USAGE_GRACE_DAYS))
      const matching = usageWindow.filter(t => {
        const onOrAfter = t.transaction_date.slice(0, 10) >= cutoff
        // Primary: recurring_id match (cron always stamps this — most reliable)
        if (t.recurring_id && t.recurring_id === r.id && onOrAfter) return true
        // Fallback: merchant/description text match
        const match = t.merchant?.toLowerCase() === r.merchant?.toLowerCase() || t.description?.toLowerCase().includes(r.name.toLowerCase())
        return match && onOrAfter
      })
      if (matching.length === 0) {
        const monthlyEquiv = monthlyEquivalent(r)
        const label = freqLabels[r.frequency] || 'month'
        const amountText = r.frequency === 'yearly'
          ? `${formatMoney(r.amount)}/yr (${formatMoney(monthlyEquiv)}/mo equiv)`
          : r.frequency === 'quarterly'
            ? `${formatMoney(r.amount)}/qtr (${formatMoney(monthlyEquiv)}/mo equiv)`
            : `${formatMoney(r.amount)}/mo`
        result.push({ type: 'unused_sub', severity: 'high', title: `${r.name} — no usage this ${label}`, description: `${amountText} — no matching charge in the ${window} days to ${formatDateShort(usageAnchor)}`, monthlyAmount: Math.round(monthlyEquiv), action: 'Review subscription', recurringId: r.id })
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
  }, [transactions, recurring, snoozeNow, usageWindow, usageAnchor])

  const totalLeakAmount = leaks.reduce((s, l) => s + l.monthlyAmount, 0)
  const catIndex = useMemo(() => new Map(categories.map((c, i) => [c.id, i])), [categories])

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

    return Array.from(catMap.entries()).filter(([, d]) => d.spent > 0).map(([cid, data]) => {
      const cat = categories.find(c => c.id === cid)
      const budget = budgets.find(b => b.category_id === cid)
      const budgetAmt = budget?.amount || 0
      const budgetPct = budgetAmt > 0 ? data.spent / budgetAmt : 1.5 // No budget = assume overspending
      const trend = data.prevSpent > 0 ? ((data.spent - data.prevSpent) / data.prevSpent) * 100 : 0

      const budgetScore = budgetPct <= 0.8 ? 5 : budgetPct <= 1.0 ? 4 : budgetPct <= 1.2 ? 2 : 1
      const trendScore = trend <= -10 ? 5 : trend <= 0 ? 4 : trend <= 10 ? 3 : trend <= 25 ? 2 : 1
      const freqScore = data.txCount <= 10 ? 5 : data.txCount <= 20 ? 4 : data.txCount <= 30 ? 2 : 1
      const totalScore = (budgetScore * 8) + (trendScore * 6) + (freqScore * 6) // weighted to 100

      return { id: cid, name: cat?.name || cid, icon: cat?.icon || '', colorIndex: catIndex.get(cid) ?? 0, spent: data.spent, budget: budgetAmt, grade: gradeFromScore(totalScore), trend: Math.round(trend), txCount: data.txCount, budgetScore, trendScore, freqScore }
    }).sort((a, b) => b.spent - a.spent)
  }, [transactions, prevTransactions, budgets, categories, catIndex])

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
      const sorted = Array.from(merchants.entries()).map(([name, amount]) => ({ name, amount, pct: total > 0 ? Math.round((amount / total) * 100) : 0 })).sort((a, b) => b.amount - a.amount)
      return { name: cat?.name || cid, icon: cat?.icon || '', colorIndex: catIndex.get(cid) ?? 0, total, merchants: sorted }
    }).filter(c => c.merchants.length > 1).sort((a, b) => b.total - a.total).slice(0, 6)
  }, [transactions, categories, catIndex])

  // ── Heatmap ───────────────────────────────────────
  const heatRows = useMemo(() => heatScope === 'all' ? transactions : transactions.filter(t => !isScheduledSpend(t)), [transactions, heatScope])
  const heatmap = useMemo(() => buildSpendingHeatmap(month, heatRows), [month, heatRows])
  const busiestWeekday = heatmap.byWeekday.reduce((best, d) => (d.amount > best.amount ? d : best), heatmap.byWeekday[0])

  // Savings potential (simple estimate)
  const totalSavings = totalLeakAmount + Math.round(monthlySpend * 0.05)

  const toggleFlag = (id: string) => {
    setFlaggedSubs(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const monthNav = (
    <div className="flex items-center gap-1" role="group" aria-label="Month">
      <button type="button" aria-label="Previous month" onClick={() => setMonth(m => addMonthsKey(m, -1))} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-2 hover:text-fg"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-fg" aria-live="polite">{monthLabel}</span>
      <button type="button" aria-label="Next month" disabled={month >= currentMonth} onClick={() => setMonth(m => addMonthsKey(m, 1))} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-2 hover:text-fg disabled:opacity-40"><ChevronRight aria-hidden="true" className="h-4 w-4" /></button>
    </div>
  )

  if (loading && transactions.length === 0 && categories.length === 0) {
    return (
      <Page aria-busy="true">
        <div className="h-9 w-48 rounded-lg skeleton" />
        <div className="h-28 rounded-xl skeleton" />
      </Page>
    )
  }

  return (
    <PageTransition>
    <Page>
      <PageHeader title="Spending Audit" description={`Forensic spending analysis for ${monthLabel}`} actions={monthNav} />

      {loadError && (
        <Card><ErrorState compact title="Couldn't load this month's transactions" body="Totals below may be incomplete." onRetry={() => { void fetchData() }} /></Card>
      )}

      {/* ── FINANCIAL HEALTH SCORE ── */}
      {investmentAudit && (() => {
        const score = investmentAudit.score
        const tone: Tone = score >= 80 ? 'positive' : score >= 60 ? 'warning' : 'negative'
        const scoreLabel = score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Needs work'
        const catConfig: { key: string; label: string; max: number }[] = [
          { key: 'west_readiness', label: 'WEST Readiness', max: 25 },
          { key: 'debt_health', label: 'Debt Health', max: 20 },
          { key: 'investment_diversity', label: 'Investment Diversity', max: 15 },
          { key: 'liquidity', label: 'Liquidity', max: 15 },
          { key: 'retirement', label: 'Retirement Progress', max: 15 },
          { key: 'net_worth_trend', label: 'Net Worth Trend', max: 10 },
        ]
        return (
          <Card>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
              <div className="flex shrink-0 flex-col items-center gap-2 sm:items-start">
                <div className="relative h-28 w-28">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--surface-3))" strokeWidth="10" />
                    <circle cx="50" cy="50" r="40" fill="none" stroke={`hsl(var(--${tone}))`} strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={`${(score / 100) * 251.2} 251.2`} className="transition-all duration-700" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center" role="img" aria-label={`Financial health score ${score} of 100`}>
                    <span className="num-metric text-2xl font-semibold text-fg" data-privacy-exempt>{score}</span>
                    <span className="text-micro text-fg-tertiary">/ 100</span>
                  </div>
                </div>
                <StatusPill tone={tone}>{scoreLabel}</StatusPill>
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <h3 className="text-[0.9375rem] font-semibold text-fg">Financial Health Score</h3>
                {catConfig.map(cat => {
                  const val = investmentAudit.score_breakdown[cat.key] || 0
                  const pct = (val / cat.max) * 100
                  return (
                    <div key={cat.key}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-label font-medium text-fg">{cat.label}</span>
                        <span className="num text-label text-fg-secondary">{val}/{cat.max} pts</span>
                      </div>
                      <ProgressBar value={val} max={cat.max} tone={pct >= 80 ? 'positive' : pct >= 60 ? 'warning' : 'negative'} label={cat.label} valueText={`${val} of ${cat.max} points`} />
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )
      })()}

      {/* KPIs — values neutral; tone lives on the comparison */}
      <Card>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4 lg:divide-x lg:divide-border [&>*]:lg:pl-5 [&>*:first-child]:lg:pl-0">
          <Stat
            label="Monthly Spend"
            money
            value={formatMoney(monthlySpend)}
            delta={prevSpend > 0 ? formatTrendPct(spendDelta) : undefined}
            tone={prevSpend > 0 && Math.abs(spendDelta) >= 1 ? (spendDelta > 0 ? 'negative' : 'positive') : 'neutral'}
            hint={prevSpend > 0 ? 'vs last month' : monthLabel}
          />
          <Stat label="Leaks Found" value={String(leaks.length)} hint={`${formatMoney(totalLeakAmount)}/mo wasted`} tone={leaks.length > 0 ? 'warning' : 'neutral'} />
          <Stat label="Savings Potential" money value={formatMoney(totalSavings)} hint="/mo across all tiers" />
          <Stat
            label="Overall Grade"
            value={<span className={transactions.length > 0 ? GRADE_TEXT[gradeTone(overallGrade)] : undefined}>{transactions.length > 0 ? overallGrade : '—'}</span>}
            hint={transactions.length > 0 ? gradeLabel(overallGrade) : 'No spending yet'}
          />
        </div>
      </Card>

      {/* Heatmap + Category Scorecards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader
            title="Spending Heatmap"
            description={busiestWeekday && busiestWeekday.amount > 0
              ? `${heatScope === 'everyday' ? 'Everyday spend, scheduled bills excluded' : 'All spend'}. Busiest: ${busiestWeekday.label} (${formatMoney(busiestWeekday.amount)})`
              : 'Daily spend by weekday and week of the month'}
            action={
              <Segmented
                size="sm"
                ariaLabel="Heatmap spending scope"
                value={heatScope}
                onChange={setHeatScope}
                options={[{ value: 'everyday', label: 'Everyday' }, { value: 'all', label: 'All' }]}
              />
            }
          />
          <div className="w-full min-w-0" role="table" aria-label={`Spending by day, ${monthLabel}`}>
            <div className="mb-1 grid grid-cols-7 gap-1" role="row">
              {HEATMAP_WEEKDAYS.map(w => (
                <span key={w.label} role="columnheader" className="text-center text-micro font-medium text-fg-tertiary">{w.label}</span>
              ))}
            </div>
            {heatmap.grid.map((week, wi) => (
              <div key={wi} className="mb-1 grid grid-cols-7 gap-1" role="row">
                {week.map((cell, ci) => cell ? (
                  <div
                    key={cell.date}
                    role="cell"
                    data-date={cell.date}
                    data-weekday={cell.weekday}
                    data-future={cell.future || undefined}
                    title={cell.future ? `${cell.weekday} ${formatDateShort(cell.date)}: upcoming` : `${cell.weekday} ${formatDateShort(cell.date)}: ${formatMoney(cell.amount)}${cell.count ? ` · ${cell.count} ${cell.count === 1 ? 'txn' : 'txns'}` : ''}`}
                    aria-label={cell.future && cell.amount === 0 ? `${cell.weekday} ${formatDateShort(cell.date)}: upcoming` : `${cell.weekday} ${formatDateShort(cell.date)}: ${formatMoney(cell.amount)}`}
                    className={cn(
                      'relative flex h-9 items-start justify-start rounded-md px-1.5 py-1 sm:h-10',
                      cell.amount > 0 ? 'text-fg' : cell.future ? 'heatmap-future border border-dashed border-border text-fg-tertiary' : 'bg-surface-2 text-fg-tertiary',
                    )}
                    style={cell.amount > 0 ? { background: `hsl(var(--info) / ${(0.12 + cell.intensity * 0.7).toFixed(2)})` } : undefined}
                  >
                    <span className="text-micro tabular-nums leading-none">{cell.day}</span>
                  </div>
                ) : <div key={`empty-${wi}-${ci}`} role="cell" aria-hidden="true" />)}
              </div>
            ))}
            <div className="mt-2 flex flex-wrap items-center justify-end gap-x-3 gap-y-1" aria-hidden="true">
              <span className="flex items-center gap-1">
                <span className="mr-1 text-micro text-fg-tertiary">Less</span>
                {[0, 0.25, 0.5, 0.75, 1].map(v => (
                  <span key={v} className="h-3 w-5 rounded-sm" style={{ background: `hsl(var(--info) / ${(0.12 + v * 0.7).toFixed(2)})` }} />
                ))}
                <span className="ml-1 text-micro text-fg-tertiary">More</span>
              </span>
              {isCurrentMonth && (
                <span className="flex items-center gap-1"><span className="heatmap-future h-3 w-5 rounded-sm border border-dashed border-border" /><span className="text-micro text-fg-tertiary">Upcoming</span></span>
              )}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
            <div className="min-w-0">
              <dt className="text-[0.75rem] text-fg-tertiary">Days with spend</dt>
              <dd className="num-metric mt-0.5 text-sm font-semibold text-fg">{heatmap.spendDays}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[0.75rem] text-fg-tertiary">Avg per day</dt>
              <dd className="num-metric mt-0.5 text-sm font-semibold text-fg" data-money>{formatMoney(heatmap.avgPerSpendDay)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[0.75rem] text-fg-tertiary">Biggest day</dt>
              <dd className="num-metric mt-0.5 truncate text-sm font-semibold text-fg">{heatmap.peak ? <><span data-money>{formatMoney(heatmap.peak.amount)}</span><span className="font-normal text-fg-tertiary"> · {formatDateShort(heatmap.peak.date)}</span></> : '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Category Scorecards" description="Graded on budget adherence, trend, and frequency." />
          {categoryScores.length === 0 ? (
            <ErrorState variant="empty" compact title="No spending data for this month" body="Scorecards appear once expenses are recorded." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {categoryScores.slice(0, 9).map(cat => {
                const tone = gradeTone(cat.grade)
                return (
                  <div key={cat.id} data-grade={cat.grade} className="rounded-xl border border-border bg-surface-2 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <CategoryIcon name={cat.name} emoji={cat.icon} colorIndex={cat.colorIndex} />
                      <span className={cn('text-2xl font-bold leading-none', GRADE_TEXT[tone])} aria-label={`Grade ${cat.grade}`}>{cat.grade}</span>
                    </div>
                    <h4 className="truncate text-label font-semibold text-fg">{cat.name}</h4>
                    <p className="num mt-1 text-left text-base font-semibold text-fg" data-money>{formatMoney(cat.spent)}</p>
                    <TrendBadge value={cat.trend} invert className="mt-1" />
                    <div className="mt-2 space-y-0.5 border-t border-border pt-2">
                      {[{ label: 'Budget', score: cat.budgetScore }, { label: 'Trend', score: cat.trendScore }, { label: 'Freq', score: cat.freqScore }].map(s => (
                        <div key={s.label} className="flex items-center justify-between" aria-label={`${s.label} ${s.score} of 5`}>
                          <span className="text-micro text-fg-tertiary">{s.label}</span>
                          <div className="flex gap-px" aria-hidden="true">{[1, 2, 3, 4, 5].map(i => <div key={i} className={cn('h-1 w-2 rounded-full', i <= s.score ? GRADE_FILL[tone] : 'bg-surface-3')} />)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Leak Detection */}
      <Card>
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><ShieldAlert aria-hidden="true" className="h-4 w-4 text-warning" />Money Leaks Detected</span>}
          description={usageWindow === null
            ? "Fees this month · couldn't check subscription usage"
            : isCurrentMonth ? 'Fees, unused services, and avoidable charges' : `Fees and unused services as of ${formatDateShort(usageAnchor)} · triage from the current month`}
          action={<span className="num text-sm font-semibold text-fg" data-money>{formatMoney(totalLeakAmount)}/mo</span>}
        />
        {leaks.length === 0 ? (
          <ErrorState variant="empty" compact title="No leaks detected" body="No unused subscriptions or bank fees this month." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {leaks.map((leak, i) => {
              const LeakIcon = leak.type === 'unused_sub' ? Ghost : leak.type === 'bank_fee' ? Landmark : Receipt
              return (
                <div key={i} className="rounded-xl border border-border bg-surface-2 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning-bg text-warning"><LeakIcon aria-hidden="true" className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-fg">{leak.title}</h4>
                      <p className="mt-0.5 text-label text-fg-secondary">{leak.description}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="num text-sm font-semibold text-fg" data-money>{formatMoney(leak.monthlyAmount)}/mo</span>
                        <span className="num text-label text-fg-tertiary" data-money>{formatMoney(leak.monthlyAmount * 12)}/yr</span>
                      </div>
                      {leak.recurringId && isCurrentMonth ? (
                        <div className="mt-3 grid grid-cols-3 gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => handleLeakTriage(leak.recurringId!, 'keep')}>Keep</Button>
                          <Button size="sm" variant="secondary" className="text-negative" onClick={() => handleLeakTriage(leak.recurringId!, 'cancel')}>Cancel</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleLeakTriage(leak.recurringId!, 'later')}>Later</Button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => router.push('/finance/subscriptions')} className="mt-2 inline-flex min-h-11 items-center gap-1 text-label font-medium text-info hover:underline sm:min-h-0">{leak.action} <ArrowRight aria-hidden="true" className="h-3 w-3" /></button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Crypto Portfolio Risks */}
      {(cryptoRisks.length > 0 || cryptoValue > 0) && (
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><Bitcoin aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />Crypto Portfolio Audit</span>}
            description="Risk assessment for your crypto holdings"
            action={<span className="num text-sm font-semibold text-fg" data-money>{formatMoney(cryptoValue)}</span>}
          />
          {cryptoRisks.length === 0 ? (
            <ErrorState variant="empty" compact title="No crypto risks detected" body="Concentration and unrealized losses are within limits." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {cryptoRisks.map((risk, i) => {
                const RiskIcon = risk.type === 'concentration' ? Scale : TrendingDown
                return (
                  <div key={i} className="rounded-xl border border-border bg-surface-2 p-4">
                    <div className="flex items-start gap-3">
                      <RiskIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-fg-tertiary" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-fg">{risk.title}</h4><StatusPill tone={SEVERITY_TONE[risk.severity]}>{SEVERITY_WORD[risk.severity]}</StatusPill></div>
                        <p className="mt-1 text-label text-fg-secondary">{risk.detail}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── INVESTMENT HEALTH — grouped by category ── */}
      {investmentAudit && investmentAudit.findings.length > 0 && (
        <section aria-labelledby="investment-health" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="investment-health" className="text-lg font-semibold text-fg">Investment Health</h2>
            <span className="text-label text-fg-secondary">{investmentAudit.findings.length} findings</span>
          </div>
          {FINDING_GROUPS.map(({ key, label, Icon }) => {
            const catFindings = investmentAudit.findings.filter(f => f.category === key)
            if (catFindings.length === 0) return null
            return (
              <div key={key} className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 px-1 text-label font-semibold text-fg-tertiary"><Icon aria-hidden="true" className="h-3.5 w-3.5" />{label}</p>
                {catFindings.map(f => (
                  <Card key={f.id} padding="none" className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <StatusPill tone={SEVERITY_TONE[f.severity] ?? 'warning'}>{SEVERITY_WORD[f.severity] ?? 'Watch'}</StatusPill>
                          <p className="text-sm font-medium text-fg">{f.title}</p>
                        </div>
                        <p className="text-sm leading-relaxed text-fg-secondary">{f.detail}</p>
                        {f.suggestion && <p className="mt-1.5 text-label text-fg-secondary">{f.suggestion}</p>}
                      </div>
                      {f.action_url && (
                        <a href={f.action_url} className="inline-flex min-h-11 shrink-0 items-center gap-1 self-start whitespace-nowrap text-label font-medium text-info hover:underline sm:min-h-0">
                          Take action <ArrowRight aria-hidden="true" className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )
          })}
        </section>
      )}

      {/* Top 10 Lists */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><BarChart3 aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />Largest Expenses</span>} />
          {top10Largest.length === 0 ? <p className="py-4 text-center text-sm text-fg-tertiary">No expenses this month</p> : (
            <ol className="space-y-2.5">
              {top10Largest.map((tx, i) => {
                const cat = categories.find(c => c.id === tx.category_id)
                return (
                  <li key={tx.id} className="flex items-center gap-3">
                    <span className="w-5 shrink-0 text-center text-label font-medium tabular-nums text-fg-tertiary">{i + 1}</span>
                    <CategoryIcon name={cat?.name || 'Other'} emoji={cat?.icon} colorIndex={catIndex.get(tx.category_id) ?? 0} size={32} />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-fg">{tx.merchant || tx.description || '—'}</p><p className="text-label text-fg-tertiary">{formatDateShort(tx.transaction_date)} · {cat?.name || 'Other'}</p></div>
                    <div className="shrink-0 text-right"><span className="num block text-sm font-semibold text-fg" data-money>{formatMoney(tx.amount_mxn)}</span>{monthlySpend > 0 && <span className="num block text-micro text-fg-tertiary">{formatPct((tx.amount_mxn / monthlySpend) * 100, { decimals: 1 })}</span>}</div>
                  </li>
                )
              })}
            </ol>
          )}
        </Card>
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Repeat aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />Most Frequent Purchases</span>} />
          {top10Frequent.length === 0 ? <p className="py-4 text-center text-sm text-fg-tertiary">No data</p> : (
            <ol className="space-y-2.5">
              {top10Frequent.map((g, i) => (
                <li key={g.merchant} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-center text-label font-medium tabular-nums text-fg-tertiary">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-fg">{g.merchant}</p><span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 text-micro text-fg-secondary">×{g.count}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-3" aria-hidden="true"><div className="h-1.5 rounded-full bg-fg-tertiary" style={{ width: `${(g.count / top10Frequent[0].count) * 100}%` }} /></div>
                  </div>
                  <div className="min-w-[4.75rem] shrink-0 text-right"><span className="num block text-sm font-semibold text-fg" data-money>{formatMoney(g.total)}</span><span className="num block text-micro text-fg-tertiary">avg {formatMoney(g.total / g.count)}</span></div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Merchant Concentration */}
      {merchantConcentration.length > 0 && (
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Store aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />Merchant Concentration</span>} description="Over-reliant on any single vendor?" />
          <div className="space-y-4">
            {merchantConcentration.map(cat => (
              <div key={cat.name}>
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-0.5"><CategoryIcon name={cat.name} emoji={cat.icon} colorIndex={cat.colorIndex} size={22} /><span className="text-sm font-semibold text-fg">{cat.name}</span><span className="num text-label text-fg-tertiary" data-money>{formatMoney(cat.total)}</span></div>
                <div className="flex h-6 overflow-hidden rounded-lg bg-surface-3" aria-hidden="true">
                  {cat.merchants.slice(0, 6).map((m, mi) => (
                    <div key={m.name} className="flex h-full items-center justify-center overflow-hidden border-r border-surface last:border-0"
                      style={{ width: `${m.pct}%`, background: categoryColor(mi, 0.7) }}
                      title={`${m.name}: ${m.pct}%`}>
                      {m.pct >= 15 && <span className="truncate px-1 text-micro font-medium text-[hsl(var(--background))]">{m.name}</span>}
                    </div>
                  ))}
                </div>
                <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {cat.merchants.slice(0, 5).map((m, mi) => (
                    <li key={m.name} className="flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryColor(mi) }} /><span className="text-micro text-fg-secondary">{m.name} {m.pct}%</span></li>
                  ))}
                </ul>
                {cat.merchants[0]?.pct >= 60 && !NON_DIVERSIFIABLE.includes(cat.name) && <p className="mt-1 text-label text-warning">{cat.merchants[0].name} accounts for {cat.merchants[0].pct}% — consider diversifying</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Subscription Audit */}
      {recurring.length > 0 && (
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><ClipboardList aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />Subscription Audit</span>}
            description={`${recurring.length} active · ${formatMoney(recurring.reduce((s, r) => s + monthlyEquivalent(r), 0))}/mo equiv`}
          />
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full">
              <thead><tr className="border-b border-border">
                {['Service', 'Monthly', 'Annual', 'Flag'].map((h, i) => (
                  <th key={h} scope="col" className={`px-3 py-3 text-label font-medium text-fg-secondary ${i >= 1 && i <= 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {recurring.map(sub => (
                  <tr key={sub.id} className={cn('border-b border-border transition-colors last:border-0', flaggedSubs.has(sub.id) && 'bg-negative-bg')}>
                    <td className="px-3 py-3"><p className="text-sm font-medium text-fg">{sub.name}</p><p className="text-label text-fg-tertiary">{sub.merchant}</p></td>
                    <td className="num px-3 py-3 text-sm font-semibold text-fg"><span data-money>{formatMoney(monthlyEquivalent(sub))}/mo</span>{sub.frequency !== 'monthly' && <span className="ml-1 text-label font-normal text-fg-tertiary">({sub.frequency})</span>}</td>
                    <td className="num px-3 py-3 text-sm text-fg-secondary" data-money>{formatMoney(monthlyEquivalent(sub) * 12)}/yr</td>
                    <td className="px-3 py-3">
                      <button type="button" aria-pressed={flaggedSubs.has(sub.id)} aria-label={`Flag ${sub.name}`} onClick={() => toggleFlag(sub.id)} className={cn('rounded-md p-1.5 transition-colors', flaggedSubs.has(sub.id) ? 'bg-negative-bg text-negative' : 'text-fg-tertiary hover:bg-surface-2')}>
                        <Flag aria-hidden="true" className="h-4 w-4" fill={flaggedSubs.has(sub.id) ? 'currentColor' : 'none'} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 sm:hidden">
            {recurring.map(sub => (
              <li key={sub.id} className={cn('rounded-lg border py-1.5 pl-3 pr-2', flaggedSubs.has(sub.id) ? 'border-negative/30 bg-negative-bg' : 'border-border bg-surface-2')}>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-fg">{sub.name}</p><p className="truncate text-label text-fg-tertiary">{sub.merchant}</p></div>
                  <span className="num shrink-0 text-sm font-semibold text-fg" data-money>{formatMoney(monthlyEquivalent(sub))}/mo</span>
                  <button type="button" aria-pressed={flaggedSubs.has(sub.id)} aria-label={`Flag ${sub.name}`} onClick={() => toggleFlag(sub.id)} className={cn('-mr-1.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded', flaggedSubs.has(sub.id) ? 'text-negative' : 'text-fg-tertiary')}>
                    <Flag aria-hidden="true" className="h-4 w-4" fill={flaggedSubs.has(sub.id) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
    </PageTransition>
  )
}
