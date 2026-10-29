'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronDown, CircleHelp, Landmark, RotateCcw, ShieldCheck, X } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { supabase } from '@/lib/supabase'
import { useFinanceData } from '@/hooks/use-finance-data'
import { PageTransition } from '@/components/page-transition'
import { Page, PageHeader } from '@/components/ui/page'
import { Card, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/stat'
import { StatusPill } from '@/components/ui/status-pill'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { ChartFigure, ChartGrid } from '@/components/ui/finance-chart'
import { CHART, chartAnimationProps, chartAxisProps, chartTooltipProps, chartYAxisMoneyProps, moneyTooltipFormatter } from '@/lib/chart-theme'
import { addMonthsKey, diffDaysKey, localDateKey, monthKey } from '@/lib/dates'
import { ErrorState } from '@/components/ui/error-state'
import { formatCompact, formatDateShort, formatMoney, formatMonthShort } from '@/lib/format'
import { inputCls } from '@/lib/form-style'
import { cn } from '@/lib/utils'
import type { Tone } from '@/lib/budget-tone'
import type { SummaryResponse } from '@/lib/summary/types'

// Answer-first Emergency Fund (VIS-12, UX-05, F02 display): months covered,
// balance, target and surplus up top; setup lives in a Settings disclosure.
// Essentials and coverage come from /api/finance/summary when available so
// this page agrees with home; WS4 owns the math.

interface RiskAnswers { job_stability?: number; income_sources?: number; dependents?: number; health?: number; housing?: number }

const QUESTIONS = [
  { id: 'job_stability', question: 'How stable is your primary income?', options: [{ value: 1, label: 'Government / tenured' }, { value: 2, label: 'Stable corporate' }, { value: 3, label: 'Startup / contract' }, { value: 4, label: 'Freelance / variable' }] },
  { id: 'income_sources', question: 'How many income sources?', options: [{ value: 1, label: '3+ diversified' }, { value: 2, label: '2 sources' }, { value: 3, label: '1 source only' }] },
  { id: 'dependents', question: 'Dependents relying on your income?', options: [{ value: 1, label: 'None' }, { value: 2, label: '1-2' }, { value: 3, label: '3+' }] },
  { id: 'health', question: 'Health insurance coverage?', options: [{ value: 1, label: 'Full private + IMSS' }, { value: 2, label: 'IMSS only' }, { value: 3, label: 'No coverage' }] },
  { id: 'housing', question: 'Housing situation?', options: [{ value: 1, label: 'Own — paid off' }, { value: 2, label: 'Mortgage' }, { value: 3, label: 'Renting' }] },
]

// Indicative yields entered Feb 2026 — shown with that date, never as live rates.
const RATES_AS_OF = 'Feb 2026'
const ACCOUNTS = [
  { name: 'Nu México', rate: '~15.0%', tier: 1, access: 'Daily', pro: 'Highest yield, daily liquidity', con: 'SOFIPO — insured up to $190K (PROSOFIPO)' },
  { name: 'Mercado Pago', rate: '~14.0%', tier: 1, access: 'Daily', pro: 'Instant in/out, familiar platform', con: 'Rate fluctuates' },
  { name: 'Hey Banco', rate: '~13.5%', tier: 2, access: '1-2 days', pro: 'Banregio-backed, solid brand', con: 'Slightly lower rate' },
  { name: 'Supertasas', rate: '~12.5%', tier: 3, access: '7-30 days', pro: 'SOFIPO, competitive rates', con: 'Less known, $190K PROSOFIPO cap' },
  { name: 'Kubo Financiero', rate: '~11.0%', tier: 3, access: '7 days', pro: 'Established SOFIPO', con: '$190K insurance cap' },
  { name: 'CETES Directo', rate: '~10.5%', tier: 3, access: '28 días', pro: 'Government-backed, highest safety', con: 'Min 28-day lock-in' },
]

const DECISION_STEPS = [
  { question: 'Is this unexpected?', noMsg: 'Not an emergency — budget for it next month.' },
  { question: 'Is this necessary?', noMsg: 'Not an emergency — it can wait.' },
  { question: 'Is this urgent?', noMsg: 'Not urgent — save up for it separately.' },
  { question: 'Can you cover it any other way?', yesMsg: 'Try that first — keep your fund intact.', noMsg: 'Use your emergency fund. Start with Tier 1.' },
]

const TIERS = [
  { tier: 1, label: 'Instant Access', desc: 'Checking account — immediate emergencies', access: 'Instant', rec: '1 month of essentials', color: 'hsl(var(--cat-1))' },
  { tier: 2, label: 'Quick Access', desc: 'High-yield savings (Nu, Hey Banco)', access: '1-3 days', rec: '2-3 months of essentials', color: 'hsl(var(--cat-2))' },
  { tier: 3, label: 'Growth Tier', desc: 'CETES 28d, Supertasas — higher returns', access: '7-28 days', rec: '2-3+ months of essentials', color: 'hsl(var(--cat-3))' },
] as const

type FundRow = {
  id: string
  current_amount: number | null
  target_amount?: number | null
  target_months?: number | null
  updated_at?: string | null
  created_at?: string | null
  account_allocation_json?: Record<string, any> | null
}

async function loadSummary(signal: AbortSignal): Promise<SummaryResponse> {
  const res = await fetch('/api/finance/summary', { signal })
  if (!res.ok) throw new Error(`summary ${res.status}`)
  return res.json() as Promise<SummaryResponse>
}

// A balance older than this is not trusted for "move the surplus" advice.
const CONFIRM_STALE_DAYS = 60

/** Calendar day of a date or timestamp, in local time (never a UTC slice). */
function toLocalDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value.slice(0, 10) : localDateKey(d)
}

function ageLabel(days: number): string {
  if (days < 45) return `${days} days ago`
  const months = Math.round(days / 30.4)
  return `${months} ${months === 1 ? 'month' : 'months'} ago`
}

function MoneyInput({ id, label, value, onChange, step = 1000, hint }: { id: string; label: string; value: number; onChange: (n: number) => void; step?: number; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-label font-medium text-fg-secondary">{label}</label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-tertiary">$</span>
        <input id={id} type="number" inputMode="decimal" min={0} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className={cn(inputCls, 'pl-7 tabular-nums')} />
      </div>
      {hint && <p className="mt-1 text-label text-fg-tertiary">{hint}</p>}
    </div>
  )
}

export default function EmergencyFundClient() {
  // Fund settings (user-editable). Start empty — never show placeholder money as real data.
  const [monthlyEssentials, setMonthlyEssentials] = useState(0)
  const [currentFund, setCurrentFund] = useState(0)
  const [monthlySaving, setMonthlySaving] = useState(0)
  const [riskAnswers, setRiskAnswers] = useState<RiskAnswers>({})
  const [tier1, setTier1] = useState(0)
  const [tier2, setTier2] = useState(0)
  const [tier3, setTier3] = useState(0)
  const [fund, setFund] = useState<FundRow | null>(null)
  const [fundStatus, setFundStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const settingsRef = useRef<HTMLDetailsElement>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Decision tree
  const [decisionStep, setDecisionStep] = useState(0)
  const [decisionAnswers, setDecisionAnswers] = useState<Record<number, string>>({})
  const [decisionComplete, setDecisionComplete] = useState(false)
  const [decisionResult, setDecisionResult] = useState<'use' | 'redirect'>('redirect')
  const [decisionMsg, setDecisionMsg] = useState('')

  const { data: summary, error: summaryError, loading: summaryLoading, refresh: refreshSummary } = useFinanceData('ef:summary', loadSummary)

  const loadFund = useCallback(() => {
    supabase.from('finance_emergency_fund').select('*').order('created_at', { ascending: false }).limit(1).then(({ data, error }) => {
      setFundStatus(error ? 'error' : 'ready')
      if (data && data[0]) {
        const d = data[0] as FundRow
        setFund(d)
        if (d.current_amount != null) setCurrentFund(d.current_amount)
        const a = d.account_allocation_json
        if (a) {
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

  useEffect(() => { loadFund() }, [loadFund])

  // Risk calculation (Settings)
  const answeredAll = Object.keys(riskAnswers).length === 5
  const riskScore = answeredAll ? Object.values(riskAnswers).reduce((s, v) => s + (v || 0), 0) : 0
  const recommendedMonths = answeredAll ? Math.min(12, Math.max(3, Math.round(riskScore * 0.6))) : 6
  const settingsTarget = monthlyEssentials * recommendedMonths

  // Answer-first numbers: the summary (same source as home) wins; the saved row is the fallback.
  const ef = summary?.emergency_fund
  const hasData = !!ef || !!fund
  const pending = !hasData && (summaryLoading || fundStatus === 'loading')
  // Either source failing with nothing to show is an error, not "no fund yet".
  const failed = !hasData && !pending && (!!summaryError || fundStatus === 'error')
  const essentials = ef?.monthly_essentials && ef.monthly_essentials > 0 ? ef.monthly_essentials : monthlyEssentials
  const balance = ef ? ef.current : currentFund
  const targetMonths = ef?.target_months || fund?.target_months || recommendedMonths
  const target = ef?.target && ef.target > 0 ? ef.target : essentials * targetMonths
  const monthsCovered = ef ? ef.months_covered : essentials > 0 ? Math.round((balance / essentials) * 10) / 10 : 0
  const surplus = balance - target
  const basis = ef?.essentials_basis ?? 'manual'
  // Only an explicit balance confirmation counts — updated_at moves on any settings save.
  const confirmedRaw = summary?.staleness?.ef_confirmed_at ?? ef?.confirmed_at ?? null
  const confirmedDay = confirmedRaw ? toLocalDay(confirmedRaw) : null
  const confirmedAgeDays = confirmedDay ? Math.max(0, diffDaysKey(confirmedDay, localDateKey())) : null
  const savedDay = !confirmedDay && fund?.updated_at ? toLocalDay(fund.updated_at) : null
  const balanceStale = confirmedAgeDays == null || confirmedAgeDays > CONFIRM_STALE_DAYS
  const coverageTone: Tone = monthsCovered >= targetMonths ? 'positive' : monthsCovered >= 3 ? 'warning' : 'negative'
  const coverageWord = monthsCovered >= targetMonths ? 'Fully funded' : monthsCovered >= 3 ? 'Building' : 'Thin cushion'

  // Save to Supabase (Settings only)
  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    const record = {
      target_months: recommendedMonths,
      target_amount: settingsTarget,
      current_amount: currentFund,
      risk_score: answeredAll ? riskScore : null,
      account_allocation_json: {
        tier1, tier2, tier3,
        monthly_essentials: monthlyEssentials,
        monthly_saving: monthlySaving,
        risk_answers: answeredAll ? riskAnswers : null,
      },
    }
    if (fund?.id) {
      const { error } = await supabase.from('finance_emergency_fund').update(record).eq('id', fund.id)
      if (error) setSaveError(error.message)
    } else {
      const { data, error } = await supabase.from('finance_emergency_fund').insert(record).select().single()
      if (error) setSaveError(error.message)
      else if (data) setFund(data as FundRow)
    }
    setSaving(false)
    void refreshSummary()
  }, [fund, monthlyEssentials, currentFund, monthlySaving, riskScore, riskAnswers, answeredAll, tier1, tier2, tier3, recommendedMonths, settingsTarget, refreshSummary])

  const gap = Math.max(0, target - balance)
  const monthsToTarget = monthlySaving > 0 ? Math.ceil(gap / monthlySaving) : Infinity

  // Tier distribution
  const totalAllocated = tier1 + tier2 + tier3
  const tierAmounts = [tier1, tier2, tier3]
  const tierSetters = [setTier1, setTier2, setTier3]

  // Savings timeline (only while there is a gap to close)
  const savingsData = useMemo(() => {
    if (gap <= 0 || monthlySaving <= 0) return []
    const data: { month: string; balance: number }[] = []
    const start = monthKey(new Date())
    let bal = balance
    for (let i = 0; i <= Math.min(monthsToTarget + 3, 60); i++) {
      data.push({ month: addMonthsKey(start, i), balance: Math.round(bal) })
      // The fund stops at its target: past it, the surplus goes to WEST and goals.
      bal = Math.min(target, bal + monthlySaving)
    }
    return data
  }, [balance, gap, monthlySaving, monthsToTarget, target])

  const handleDecision = (step: number, answer: string) => {
    setDecisionAnswers(prev => ({ ...prev, [step]: answer }))
    const s = DECISION_STEPS[step]
    if (step === 3) {
      setDecisionComplete(true)
      if (answer === 'yes') { setDecisionResult('redirect'); setDecisionMsg(s.yesMsg!) }
      else { setDecisionResult('use'); setDecisionMsg(s.noMsg) }
    } else if (answer === 'no') {
      setDecisionComplete(true); setDecisionResult('redirect'); setDecisionMsg(s.noMsg)
    } else {
      setDecisionStep(step + 1)
    }
  }
  const resetDecision = () => { setDecisionStep(0); setDecisionAnswers({}); setDecisionComplete(false) }

  const openSettings = () => {
    const el = settingsRef.current
    if (!el) return
    el.open = true
    el.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    el.querySelector<HTMLInputElement>('#ef-balance')?.focus({ preventScroll: true })
  }

  const markers = [3, targetMonths].filter((m, i, arr) => m > 0 && arr.indexOf(m) === i)
  const scaleMax = Math.max(targetMonths, monthsCovered, 1)
  const roundedSurplus = Math.floor(surplus / 1000) * 1000

  return (
    <PageTransition>
    <Page>
      <PageHeader
        title="Emergency Fund"
        description="Your household safety net"
        meta={confirmedDay ? `Balance last confirmed ${formatDateShort(confirmedDay)}` : savedDay ? `Settings last saved ${formatDateShort(savedDay)} · balance not confirmed` : undefined}
      />

      {pending ? (
        <div aria-busy="true" aria-label="Loading emergency fund" className="h-56 rounded-2xl skeleton" data-testid="ef-loading" />
      ) : failed ? (
        <Card><ErrorState title="Couldn't load your emergency fund" body="Nothing is shown rather than placeholder numbers." onRetry={() => { setFundStatus('loading'); loadFund(); void refreshSummary() }} /></Card>
      ) : !hasData ? (
        <Card>
          <ErrorState
            variant="empty"
            title="No emergency fund set up yet"
            body="Enter your balance and monthly essentials in Fund settings to see how many months you're covered."
            action={<Button size="sm" onClick={() => openSettings()}>Open Fund settings</Button>}
          />
        </Card>
      ) : (
      <>
      {/* Answer first */}
      <Card variant="hero" className="sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />
              <span className="text-label font-medium text-fg-secondary">Months of essentials covered</span>
              <StatusPill tone={coverageTone}>{coverageWord}</StatusPill>
            </div>
            <p className="num-metric mt-2 text-[2.5rem] font-semibold leading-[2.75rem] tracking-[-0.025em] text-fg" data-privacy-exempt data-testid="ef-months">
              {monthsCovered.toFixed(1)} <span className="text-xl font-medium text-fg-secondary">months</span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-secondary">
              <span>Essentials <span className="num font-medium text-fg" data-money>{formatMoney(essentials)}</span>/mo</span>
              {basis === 'manual'
                ? <StatusPill tone="warning" data-testid="ef-basis">Manual estimate</StatusPill>
                : <StatusPill tone="neutral" data-testid="ef-basis">From your spending</StatusPill>}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-4 lg:min-w-[26rem] lg:gap-6">
            <Stat size="sm" label="Balance" money value={formatCompact(balance)} />
            <Stat size="sm" label={`Target (${targetMonths} mo)`} money value={formatCompact(target)} />
            <Stat
              size="sm"
              label={surplus >= 0 ? 'Surplus' : 'Gap'}
              money
              value={formatCompact(Math.abs(surplus))}
              hint={surplus >= 0 ? 'above target' : 'to go'}
              tone={surplus >= 0 ? 'positive' : 'warning'}
            />
          </div>
        </div>

        {/* Coverage scale with 3-month and target ticks */}
        <div className="mt-6">
          <div
            role="progressbar"
            aria-label="Emergency fund coverage"
            aria-valuemin={0}
            aria-valuemax={Math.round(scaleMax * 10) / 10}
            aria-valuenow={Math.round(monthsCovered * 10) / 10}
            aria-valuetext={`${monthsCovered.toFixed(1)} of ${targetMonths} months`}
            className="relative h-2 w-full rounded-full bg-surface-3"
          >
            <div className={cn('h-full rounded-full', coverageTone === 'positive' ? 'bg-positive' : coverageTone === 'warning' ? 'bg-warning' : 'bg-negative')} style={{ width: `${Math.min(100, (monthsCovered / scaleMax) * 100)}%` }} />
            {markers.map(m => (
              <span key={m} aria-hidden="true" className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-fg-secondary" style={{ left: `${(m / scaleMax) * 100}%` }} />
            ))}
          </div>
          <div className="relative mt-1.5 h-4 text-micro text-fg-tertiary" aria-hidden="true">
            {markers.map(m => (
              <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.min(94, Math.max(6, (m / scaleMax) * 100))}%` }}>{m} mo</span>
            ))}
          </div>
        </div>

        {balanceStale && !(surplus > 0 && monthsCovered > targetMonths) && (
          <div role="status" className="mt-5 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-bg p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="ef-stale">
            <p className="text-sm text-fg">
              {confirmedDay
                ? <>Balance last confirmed {formatDateShort(confirmedDay)} — <span className="font-semibold">{ageLabel(confirmedAgeDays!)}</span>. These months only hold if it is still right.</>
                : <>The balance has never been confirmed, so these months may not hold.</>}
            </p>
            <Button className="shrink-0" variant="secondary" onClick={() => openSettings()}>Confirm balance</Button>
          </div>
        )}
        {surplus > 0 && monthsCovered > targetMonths && (balanceStale || basis === 'manual') && (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="ef-confirm-first">
            <p className="text-sm text-fg-secondary">
              About <span className="num font-semibold text-fg" data-money>{formatMoney(roundedSurplus)}</span> may sit above your {targetMonths}-month target, but{' '}
              {[
                balanceStale && (confirmedDay ? `the balance was last confirmed ${formatDateShort(confirmedDay)} (${ageLabel(confirmedAgeDays!)})` : 'the balance has never been confirmed'),
                basis === 'manual' && 'essentials are a manual estimate',
              ].filter(Boolean).join(' and ')}. Confirm both before moving money.
            </p>
            <Button className="shrink-0" variant="secondary" onClick={() => openSettings()}>Confirm your balance first</Button>
          </div>
        )}
        {surplus > 0 && monthsCovered > targetMonths && !balanceStale && basis !== 'manual' && (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-fg-secondary">
              About <span className="num font-semibold text-fg" data-money>{formatMoney(roundedSurplus)}</span> sits above your {targetMonths}-month target. Consider moving it toward WEST or the baby fund.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/finance/investments?tab=Real%20Estate" className="btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold">
                Plan it for WEST <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
              <Link href="/finance/goals" className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold text-fg hover:border-border-strong">
                See goals
              </Link>
            </div>
          </div>
        )}
      </Card>
      </>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {/* Savings plan — only meaningful while there is a gap */}
        {hasData && <Card>
          <CardHeader title="Savings Plan" description={gap <= 0 ? 'You are at or above target'
            : monthlySaving > gap ? `One ${formatMoney(gap)} top-up reaches the ${targetMonths}-month target (your saved plan is ${formatMoney(monthlySaving)}/mo; the rest goes to WEST and goals)`
              : `${formatMoney(monthlySaving)}/mo toward the ${targetMonths}-month target (your saved plan)`} />
          {gap > 0 ? (
            <>
              <dl className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-2 p-3"><dt className="text-label text-fg-secondary">Still to save</dt><dd className="num mt-0.5 text-left text-base font-semibold text-fg" data-money>{formatMoney(gap)}</dd></div>
                <div className="rounded-lg bg-surface-2 p-3"><dt className="text-label text-fg-secondary">Months to target</dt><dd className="num mt-0.5 text-left text-base font-semibold text-fg">{monthsToTarget === Infinity ? '—' : monthsToTarget}</dd></div>
              </dl>
              {savingsData.length > 0 && (
                <ChartFigure summary={`Balance grows from ${formatCompact(balance)} to the ${formatCompact(target)} target in ${monthsToTarget} months`}>
                  <div className="h-44 sm:h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={savingsData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <defs><linearGradient id="fundGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART.series.income} stopOpacity={CHART.areaOpacity.top} /><stop offset="100%" stopColor={CHART.series.income} stopOpacity={0} /></linearGradient></defs>
                        <ChartGrid />
                        <XAxis dataKey="month" {...chartAxisProps} tickFormatter={(v: string) => formatMonthShort(v)} interval="preserveStartEnd" minTickGap={24} />
                        <YAxis {...chartYAxisMoneyProps} />
                        <Tooltip {...chartTooltipProps} labelFormatter={l => formatMonthShort(String(l), { withYear: true })} formatter={moneyTooltipFormatter} />
                        <Area type="linear" dataKey="balance" name="Balance" stroke={CHART.series.income} fill="url(#fundGrad)" strokeWidth={CHART.strokeWidth} {...chartAnimationProps()} />
                        <ReferenceLine y={target} stroke={CHART.series.target} strokeDasharray={CHART.dash.target} label={{ value: `${targetMonths} mo target`, fill: CHART.axis, fontSize: 11, position: 'insideBottomRight' }} />
                        <ReferenceLine y={essentials * 3} stroke={CHART.series.budget} strokeDasharray={CHART.dash.budget} label={{ value: '3 mo', fill: CHART.axis, fontSize: 11, position: 'insideTopRight' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </ChartFigure>
              )}
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-positive-bg p-4">
              <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-positive" />
              <p className="text-sm text-fg">No monthly saving needed for the fund. Keep the balance where you can reach it within days, and top it up after any withdrawal.</p>
            </div>
          )}
        </Card>}

        {/* Decision tree */}
        <Card>
          <CardHeader
            title={<span className="inline-flex items-center gap-2"><CircleHelp aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />Is This a Real Emergency?</span>}
            description="Before dipping into your fund, run this checklist."
          />
          <ol className="space-y-2">
            {DECISION_STEPS.map((step, i) => {
              const active = decisionStep === i && !decisionComplete
              const done = decisionAnswers[i] !== undefined
              return (
                <li key={i} className={cn('rounded-lg border p-3', active ? 'border-border-strong bg-surface-2' : 'border-border', !active && !done && 'opacity-60')}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-fg">{step.question}</p>
                    {done && <span className="text-label text-fg-secondary">{decisionAnswers[i] === 'yes' ? 'Yes' : 'No'}</span>}
                  </div>
                  {active && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => handleDecision(i, 'yes')}><Check aria-hidden="true" className="h-3.5 w-3.5" />Yes</Button>
                      <Button size="sm" variant="secondary" className="flex-1" onClick={() => handleDecision(i, 'no')}><X aria-hidden="true" className="h-3.5 w-3.5" />No</Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          {decisionComplete && (
            <div role="status" className={cn('mt-3 rounded-xl p-4 text-sm font-medium', decisionResult === 'use' ? 'bg-positive-bg text-fg' : 'bg-warning-bg text-fg')}>
              {decisionMsg}
            </div>
          )}
          <Button size="sm" variant="ghost" className="mt-2" onClick={resetDecision}><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />Reset checklist</Button>
        </Card>
      </div>

      {/* Settings disclosure: inputs, risk quiz, tiers */}
      <Card padding="none">
        <details ref={settingsRef} id="fund-settings" className="group">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-[0.9375rem] font-semibold text-fg">Fund settings</span>
              <span className="block text-label text-fg-secondary">Balance, essentials, monthly savings, risk profile and liquidity tiers</span>
            </span>
            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-tertiary transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-6 border-t border-border px-4 py-5 sm:px-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MoneyInput id="ef-essentials" label="Monthly Essentials (manual)" value={monthlyEssentials} onChange={setMonthlyEssentials}
                hint={basis === 'derived' && ef ? `Derived from spending: ${formatMoney(ef.monthly_essentials)}/mo` : 'Used until essentials are derived from spending'} />
              <MoneyInput id="ef-balance" label="Current Fund Balance" value={currentFund} onChange={setCurrentFund} />
              <MoneyInput id="ef-saving" label="Monthly Savings" value={monthlySaving} onChange={setMonthlySaving} step={500} />
            </div>

            <div>
              <h3 className="text-[0.9375rem] font-semibold text-fg">Risk Assessment</h3>
              <p className="mb-4 mt-0.5 text-label text-fg-secondary">Answers set how many months of essentials to hold.</p>
              <div className="space-y-4">
                {QUESTIONS.map(q => (
                  <div key={q.id}>
                    <p id={`q-${q.id}`} className="mb-2 text-sm font-medium text-fg">{q.question}</p>
                    <Segmented
                      ariaLabel={q.question}
                      size="sm"
                      fullWidth
                      className="flex-wrap"
                      value={String(riskAnswers[q.id as keyof RiskAnswers] ?? '')}
                      onChange={v => setRiskAnswers(prev => ({ ...prev, [q.id]: Number(v) }))}
                      options={q.options.map(o => ({ value: String(o.value), label: o.label }))}
                    />
                  </div>
                ))}
              </div>
              {answeredAll && (
                <div className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-surface-2 p-4">
                  <Stat size="sm" label="Risk score" value={`${riskScore}/20`} hint={riskScore <= 8 ? 'Low risk' : riskScore <= 13 ? 'Moderate' : 'High risk'} />
                  <Stat size="sm" className="text-right" label="Recommended fund" value={`${recommendedMonths} months`} hint={formatMoney(settingsTarget)} />
                </div>
              )}
            </div>

            <div>
              <h3 className="text-[0.9375rem] font-semibold text-fg">Liquidity Tiers</h3>
              <p className="mb-4 mt-0.5 text-label text-fg-secondary">Distribute your fund across tiers for access vs. returns.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {TIERS.map((t, i) => (
                  <div key={t.tier} className="rounded-xl border border-border p-3 sm:p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                      <h4 className="text-sm font-semibold text-fg">Tier {t.tier}: {t.label}</h4>
                    </div>
                    <p className="mb-3 text-label text-fg-secondary">{t.desc} · {t.access}</p>
                    <MoneyInput id={`ef-tier-${t.tier}`} label="Allocated" value={tierAmounts[i]} onChange={tierSetters[i]} hint={`Rec: ${t.rec}`} />
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between"><span className="text-label text-fg-secondary">Distribution</span><span className="num text-label text-fg-tertiary" data-money>{formatMoney(totalAllocated)} allocated</span></div>
                <div className="flex h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                  {TIERS.map((t, i) => (
                    <div key={t.tier} style={{ width: `${totalAllocated > 0 ? (tierAmounts[i] / totalAllocated) * 100 : 33.3}%`, background: t.color }} />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              {saveError ? <p role="alert" className="text-label text-negative">Save failed: {saveError}</p> : <p className="text-label text-fg-tertiary">Saving updates the balance and the manual essentials estimate.</p>}
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Emergency Fund'}</Button>
            </div>
          </div>
        </details>
      </Card>

      {/* Where to keep it */}
      <Card>
        <CardHeader
          title={<span className="inline-flex items-center gap-2"><Landmark aria-hidden="true" className="h-4 w-4 text-fg-tertiary" />Recommended Accounts</span>}
          description={`Mexico-specific options by liquidity tier · indicative rates as of ${RATES_AS_OF}, check before moving money`}
        />
        <ul className="divide-y divide-border">
          {ACCOUNTS.map(acct => (
            <li key={acct.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-sm font-semibold text-fg">{acct.name}</span>
                <StatusPill tone="neutral">Tier {acct.tier}</StatusPill>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-label text-fg-secondary">
                <span><span className="num font-semibold text-fg">{acct.rate}</span> yield</span>
                <span>Access: {acct.access}</span>
              </div>
              <p className="text-label text-fg-tertiary sm:w-72 sm:shrink-0">{acct.pro} · {acct.con}</p>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
    </PageTransition>
  )
}
