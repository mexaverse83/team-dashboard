'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Baby, GraduationCap, Home } from 'lucide-react'
import {
  ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { GlassCard } from '@/components/ui/glass-card'
import { CHART_TOOLTIP_STYLE } from '@/lib/chart-style'
import { EDUCATION_FUND_PLAN, educationFundCurve } from '@/lib/baby-plan'
import { cn } from '@/lib/utils'

function fmt(n: number, d = 0) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n) }
function fmtMXN(n: number) { return `$${fmt(n)} MXN` }
function fmtShort(n: number) { return Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${(n / 1e3).toFixed(0)}k` }

// ─── Education fund projection with scenarios ────────────────────────────────
// Same interaction language as WestProjectionWithScenarios: a chart telling
// the story, then sliders to stress the assumptions. All math is client-side
// from the plan constants — the fund starts May 2027, so there is no live
// balance yet; once contributions exist (tag 'education-fund' / a dedicated
// GBM position), thread the balance into educationFundCurve's third argument.
export function EducationProjectionWithScenarios() {
  const [monthly, setMonthly] = useState(EDUCATION_FUND_PLAN.monthlyContribution)
  const [returnRate, setReturnRate] = useState(EDUCATION_FUND_PLAN.annualReturnRate * 100)

  const curve = useMemo(() => educationFundCurve(monthly, returnRate / 100), [monthly, returnRate])
  if (curve.length === 0) return null

  const final = curve[curve.length - 1]
  const coversTuition = final.fund >= final.tec_min
  const coversAllIn = final.fund >= final.tec_max
  const gapToAllIn = Math.max(0, final.tec_max - final.fund)

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Education Fund Projection</h3>
          <span className="text-xs text-[hsl(var(--text-tertiary))]">
            {fmtMXN(monthly)}/mo from {EDUCATION_FUND_PLAN.startMonth} · Tec degree {final.year}: {fmtShort(final.tec_min)}–{fmtShort(final.tec_max)}
          </span>
        </div>
        <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve}>
              <defs>
                <linearGradient id="eduFundGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(34, 22%, 85%)" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(28, 11%, 42%)' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(28, 11%, 42%)' }} tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(val: unknown, name: unknown) => [fmtMXN(Number(val) || 0), String(name)]}
                labelFormatter={(y: unknown) => `Year: ${y}`}
              />
              <Area type="monotone" dataKey="fund" stroke="hsl(var(--chart-3))" strokeWidth={2} fill="url(#eduFundGrad)" name="Fund value" />
              <Line type="monotone" dataKey="contributed" stroke="hsl(28, 11%, 55%)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} name="Contributed" />
              <Line type="monotone" dataKey="tec_min" stroke="hsl(var(--chart-5))" strokeDasharray="6 4" strokeWidth={1.5} dot={false} name="Tec tuition-only" />
              <Line type="monotone" dataKey="tec_max" stroke="hsl(var(--chart-6))" strokeDasharray="6 4" strokeWidth={1.5} dot={false} name="Tec all-in" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-blue-500" /><span className="text-xs text-[hsl(var(--text-secondary))]">Fund value</span></div>
          <div className="flex items-center gap-1.5"><div className="h-0.5 w-4 border-t-2 border-dashed border-[hsl(28,11%,55%)]" /><span className="text-xs text-[hsl(var(--text-secondary))]">Contributed</span></div>
          <div className="flex items-center gap-1.5"><div className="h-0.5 w-4 border-t-2 border-dashed border-amber-500" /><span className="text-xs text-[hsl(var(--text-secondary))]">Tec tuition-only</span></div>
          <div className="flex items-center gap-1.5"><div className="h-0.5 w-4 border-t-2 border-dashed border-red-500" /><span className="text-xs text-[hsl(var(--text-secondary))]">Tec all-in</span></div>
        </div>
      </GlassCard>

      <GlassCard className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-4">Scenarios</h3>

        <div className="flex gap-2 mb-4">
          {[{ label: 'Lean', amount: 5000 }, { label: 'Plan', amount: 7000 }, { label: 'Accelerated', amount: 10000 }].map(p => (
            <button key={p.label} onClick={() => setMonthly(p.amount)}
              className={cn('flex-1 py-2 rounded-lg text-xs font-medium transition-all border',
                monthly === p.amount
                  ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                  : 'border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]'
              )}>{p.label} (${(p.amount / 1000).toFixed(0)}k)</button>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-[hsl(var(--text-secondary))]">Monthly contribution</label>
            <span className="text-sm font-bold tabular-nums">{fmtMXN(monthly)}</span>
          </div>
          <input type="range" min={2000} max={15000} step={500} value={monthly} onChange={e => setMonthly(parseInt(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[hsl(var(--bg-elevated))]
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing" />
          <div className="flex justify-between text-[10px] text-[hsl(var(--text-tertiary))]"><span>$2k</span><span>Starting 5 years late costs ~72% more per month</span><span>$15k</span></div>
        </div>

        <div className="space-y-2 mt-4 pt-4 border-t border-[hsl(var(--border))]">
          <div className="flex gap-2 mb-2">
            {[{ label: 'Conservative', rate: 7 }, { label: 'Base', rate: 8 }, { label: 'Equity-heavy', rate: 10 }].map(p => (
              <button key={p.label} onClick={() => setReturnRate(p.rate)}
                className={cn('flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all border',
                  Math.abs(returnRate - p.rate) < 0.1
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                    : 'border-[hsl(var(--border))] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))]'
                )}>{p.label} ({p.rate}%)</button>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-[hsl(var(--text-secondary))]">Nominal annual return</label>
            <span className="text-sm font-bold tabular-nums text-emerald-600">{returnRate.toFixed(1)}%</span>
          </div>
          <input type="range" min={4} max={12} step={0.5} value={returnRate} onChange={e => setReturnRate(parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[hsl(var(--bg-elevated))]
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-500 [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:active:cursor-grabbing" />
          <div className="flex justify-between text-[10px] text-[hsl(var(--text-tertiary))]">
            <span>4%</span><span>S&amp;P-like via GBM (CSPX/VOO), before the 10% definitive ISR · education inflates at {Math.round(EDUCATION_FUND_PLAN.educationInflationRate * 100)}%</span><span>12%</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-4 p-3 rounded-lg bg-[hsl(var(--bg-elevated))]/50">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Fund at {final.year}</span>
            <p className="text-lg font-bold tabular-nums text-emerald-600">{fmtShort(final.fund)}</p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Tuition covered</span>
            <p className={cn('text-lg font-bold tabular-nums', coversTuition ? 'text-emerald-600' : 'text-red-600')}>
              {coversTuition ? '✅ Yes' : `${Math.round((final.fund / final.tec_min) * 100)}%`}
            </p>
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">All-in gap</span>
            <p className={cn('text-lg font-bold tabular-nums', coversAllIn ? 'text-emerald-600' : 'text-amber-600')}>
              {coversAllIn ? '✅ Covered' : fmtShort(gapToAllIn)}
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}

// ─── Family future strip — the portfolio's jobs ──────────────────────────────
// Lives at the bottom of the Investments → Portfolio tab, under the WEST
// projection: the same pot of money read as the family's commitments.
type FamilyFutureRow = {
  icon: typeof Home
  eyebrow: string
  title: string
  value: string
  detail: string
  progress: number
  tone: 'sky' | 'violet' | 'emerald'
}

type FamilyFutureBaby = {
  due_month: string
  months_to_birth: number
  planning_total: number
  remaining_amount: number
  spent_to_date: number
  education: { monthly_contribution: number; projected_value: number; tec_cost_min: number; tec_cost_max: number; coverage_pct_min: number; start_month: string; target_month: string }
}

export function FamilyFutureStrip() {
  const [baby, setBaby] = useState<FamilyFutureBaby | null>(null)

  useEffect(() => {
    fetch('/api/finance/summary')
      .then(r => r.ok ? r.json() : null)
      .then(d => setBaby(d?.baby_plan ?? null))
      .catch(() => setBaby(null))
  }, [])

  if (!baby || baby.planning_total <= 0) return null
  const edu = baby.education
  const babyPct = baby.planning_total > 0 ? Math.round((baby.spent_to_date / baby.planning_total) * 100) : 0

  const rows: FamilyFutureRow[] = [
    {
      icon: Baby,
      eyebrow: `Baby · ${baby.due_month}`,
      title: 'Birth envelope',
      value: `${fmtShort(baby.remaining_amount)} to fund`,
      detail: `${baby.months_to_birth} months to birth · covered by the emergency-fund surplus, not this portfolio's goals`,
      progress: babyPct,
      tone: 'sky',
    },
    {
      icon: GraduationCap,
      eyebrow: `Education · ${edu.target_month.slice(0, 4)}`,
      title: 'Tec degree fund',
      value: `${fmtShort(edu.projected_value)} projected`,
      detail: `${fmtMXN(edu.monthly_contribution)}/mo into a dedicated GBM portfolio from ${edu.start_month} — a new standing claim on this engine`,
      progress: edu.coverage_pct_min,
      tone: 'violet',
    },
  ]

  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Family Future — this portfolio&rsquo;s next jobs</h3>
        <Link href="/finance/family" className="inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--brand))] hover:underline">
          Family plan <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <p className="text-[11px] text-[hsl(var(--text-secondary))] mb-4">
        WEST above is the pot&rsquo;s 2027 claim. These are the ones after it — what the same investing engine funds next.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map(row => (
          <div key={row.title} className={cn(
            'rounded-xl border p-3.5',
            row.tone === 'sky' && 'border-sky-500/25 bg-sky-500/5',
            row.tone === 'violet' && 'border-violet-500/25 bg-violet-500/5',
            row.tone === 'emerald' && 'border-emerald-500/25 bg-emerald-500/5',
          )}>
            <div className="flex items-center gap-2">
              <row.icon className={cn('h-4 w-4',
                row.tone === 'sky' && 'text-sky-600',
                row.tone === 'violet' && 'text-violet-600',
                row.tone === 'emerald' && 'text-emerald-600',
              )} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">{row.eyebrow}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{row.title}</span>
              <span className="text-sm font-bold tabular-nums">{row.value}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))]">{row.detail}</p>
            <div className="mt-2.5 h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
              <div className={cn('h-full rounded-full',
                row.tone === 'sky' && 'bg-sky-500',
                row.tone === 'violet' && 'bg-violet-500',
                row.tone === 'emerald' && 'bg-emerald-500',
              )} style={{ width: `${Math.min(100, Math.max(0, row.progress))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}
