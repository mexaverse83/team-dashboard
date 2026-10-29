'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Baby, GraduationCap } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip } from 'recharts'
import { Card, CardHeader } from '@/components/ui/card'
import { Segmented } from '@/components/ui/segmented'
import { ProgressBar } from '@/components/ui/progress-bar'
import { ChartFigure, ChartGrid, ChartLegend, CHART, chartAxisProps, chartTooltipProps, moneyTick, moneyTooltipFormatter } from '@/components/ui/finance-chart'
import { RangeField } from '@/components/finance/investments/shared'
import { EDUCATION_FUND_PLAN, educationFundCurve } from '@/lib/baby-plan'
import { formatCompact, formatMoney, formatMonthShort, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'

const SERIES = {
  fund: 'hsl(var(--positive))',
  contributed: CHART.series.budget,
  tecMin: CHART.series.target,
  tecMax: CHART.series.negative,
}

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
  const monthlyPresets = [{ label: 'Lean', amount: 5000 }, { label: 'Plan', amount: 7000 }, { label: 'Accelerated', amount: 10000 }]
  const ratePresets = [{ label: 'Conservative', rate: 7 }, { label: 'Base', rate: 8 }, { label: 'Equity-heavy', rate: 10 }]
  const monthlyPreset = monthlyPresets.find(p => p.amount === monthly)?.label ?? ''
  const ratePreset = ratePresets.find(p => Math.abs(returnRate - p.rate) < 0.1)?.label ?? ''

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Education fund projection"
          description={`${formatMoney(monthly)}/mo from ${formatMonthShort(EDUCATION_FUND_PLAN.startMonth, { withYear: true })} · Tec degree ${final.year}: ${formatCompact(final.tec_min)}–${formatCompact(final.tec_max)}`}
        />
        <ChartFigure
          summary={`Education fund reaches ${formatCompact(final.fund)} by ${final.year}, against a Tec cost of ${formatCompact(final.tec_min)} to ${formatCompact(final.tec_max)}`}
        >
          <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="eduFundGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.fund} stopOpacity={CHART.areaOpacity.top} />
                  <stop offset="100%" stopColor={SERIES.fund} stopOpacity={CHART.areaOpacity.bottom} />
                </linearGradient>
              </defs>
              <ChartGrid />
              <XAxis dataKey="year" {...chartAxisProps} interval="preserveStartEnd" />
              <YAxis {...chartAxisProps} className="money-axis" width={44} tickCount={4} tickFormatter={moneyTick} />
              <Tooltip {...chartTooltipProps} formatter={(val, name) => [moneyTooltipFormatter(val), String(name)]} labelFormatter={y => `Year ${y}`} />
              <Area type="monotone" dataKey="fund" stroke={SERIES.fund} strokeWidth={CHART.strokeWidth} fill="url(#eduFundGrad)" name="Fund value" isAnimationActive={false} />
              <Line type="monotone" dataKey="contributed" stroke={SERIES.contributed} strokeDasharray={CHART.dash.budget} strokeWidth={1.5} dot={false} name="Contributed" isAnimationActive={false} />
              <Line type="monotone" dataKey="tec_min" stroke={SERIES.tecMin} strokeDasharray={CHART.dash.target} strokeWidth={1.5} dot={false} name="Tec tuition-only" isAnimationActive={false} />
              <Line type="monotone" dataKey="tec_max" stroke={SERIES.tecMax} strokeDasharray={CHART.dash.target} strokeWidth={1.5} dot={false} name="Tec all-in" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
          </div>
        </ChartFigure>
        <ChartLegend className="mt-3 justify-start" items={[
          { label: 'Fund value', color: SERIES.fund, kind: 'area' },
          { label: 'Contributed', color: SERIES.contributed, dash: CHART.dash.budget },
          { label: 'Tec tuition-only', color: SERIES.tecMin, dash: CHART.dash.target },
          { label: 'Tec all-in', color: SERIES.tecMax, dash: CHART.dash.target },
        ]} />
      </Card>

      <Card>
        <CardHeader title="Scenarios" />
        <div className="space-y-5">
          <div className="space-y-3">
            <Segmented ariaLabel="Monthly contribution preset" size="sm" fullWidth value={monthlyPreset}
              onChange={label => setMonthly(monthlyPresets.find(p => p.label === label)!.amount)}
              options={monthlyPresets.map(p => ({ value: p.label, label: <span className="text-label">{p.label} <span className="hidden tabular-nums text-fg-tertiary sm:inline">{formatCompact(p.amount)}</span></span> }))} />
            <RangeField id="edu-monthly" label="Monthly contribution" value={monthly} min={2000} max={15000} step={500}
              onChange={setMonthly} valueText={`${formatMoney(monthly)} per month`} hintMin="$2k" hintMax="$15k"
              hint="Starting 5 years late costs ~72% more per month" />
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <Segmented ariaLabel="Return preset" size="sm" fullWidth value={ratePreset}
              onChange={label => setReturnRate(ratePresets.find(p => p.label === label)!.rate)}
              options={ratePresets.map(p => ({ value: p.label, label: <span className="text-label">{p.label} <span className="hidden tabular-nums text-fg-tertiary sm:inline">{p.rate}%</span></span> }))} />
            <RangeField id="edu-return" label="Nominal annual return" value={returnRate} min={4} max={12} step={0.5}
              onChange={setReturnRate} valueText={formatPct(returnRate, { decimals: 1 })} hintMin="4%" hintMax="12%"
              hint={<>S&amp;P-like via GBM (CSPX/VOO), before the 10% ISR · education inflates at {Math.round(EDUCATION_FUND_PLAN.educationInflationRate * 100)}%</>} />
          </div>
          <dl className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-3">
            <div>
              <dt className="text-label text-fg-secondary">Fund at {final.year}</dt>
              <dd className="tabular-nums text-lg font-semibold" data-money="">{formatCompact(final.fund)}</dd>
            </div>
            <div>
              <dt className="text-label text-fg-secondary">Tuition covered</dt>
              <dd className={cn('tabular-nums text-lg font-semibold', coversTuition ? 'text-positive' : 'text-negative')}>
                {coversTuition ? 'Yes' : formatPct((final.fund / final.tec_min) * 100)}
              </dd>
            </div>
            <div>
              <dt className="text-label text-fg-secondary">All-in gap</dt>
              <dd className={cn('tabular-nums text-lg font-semibold', coversAllIn ? 'text-positive' : 'text-warning')} data-money="">
                {coversAllIn ? 'Covered' : formatCompact(gapToAllIn)}
              </dd>
            </div>
          </dl>
        </div>
      </Card>
    </div>
  )
}

// ─── Family future strip — the portfolio's jobs ──────────────────────────────
// Lives at the bottom of the Investments → Portfolio tab, under the WEST
// projection: the same pot of money read as the family's commitments. The page
// passes summary.baby_plan in (fetched once there) instead of the strip loading
// the whole summary itself (perf-11).
export type FamilyFutureBaby = {
  due_month: string
  months_to_birth: number
  planning_total: number
  remaining_amount: number
  spent_to_date: number
  /** summary.emergency_fund.gap: > 0 means there is no e-fund surplus to draw on. */
  emergency_fund_gap?: number
  education?: {
    monthly_contribution: number
    projected_value: number
    tec_cost_min: number
    tec_cost_max: number
    coverage_pct_min: number
    start_month: string
    target_month: string
  }
}

export function FamilyFutureStrip({ baby }: { baby: FamilyFutureBaby | null | undefined }) {
  if (!baby || baby.planning_total <= 0) return null
  const edu = baby.education
  const rows = [
    {
      icon: Baby,
      eyebrow: `Baby · ${formatMonthShort(baby.due_month, { withYear: true })}`,
      title: 'Birth envelope',
      value: `${formatCompact(baby.remaining_amount)} to fund`,
      detail: (baby.emergency_fund_gap ?? 0) > 0
        ? `${baby.months_to_birth} months to birth · funded from monthly cash flow (the emergency fund is ${formatCompact(baby.emergency_fund_gap!)} below target)`
        : `${baby.months_to_birth} months to birth · covered by the emergency-fund surplus, not this portfolio's goals`,
      spent: baby.spent_to_date,
      total: baby.planning_total,
      color: 'hsl(var(--info))',
    },
    ...(edu ? [{
      icon: GraduationCap,
      eyebrow: `Education · ${edu.target_month.slice(0, 4)}`,
      title: 'Tec degree fund',
      value: `${formatCompact(edu.projected_value)} projected`,
      detail: `${formatMoney(edu.monthly_contribution)}/mo into a dedicated GBM portfolio from ${formatMonthShort(edu.start_month, { withYear: true })} — a new standing claim on this engine`,
      spent: edu.coverage_pct_min,
      total: 100,
      color: 'hsl(var(--cat-3))',
    }] : []),
  ]

  return (
    <Card>
      <CardHeader
        title="Family future — this portfolio’s next jobs"
        description="WEST above is the pot’s 2027 claim. These are the ones after it."
        action={(
          <Link href="/finance/family" className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-label font-semibold text-[hsl(var(--brand))] hover:underline">
            Family plan <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        )}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map(row => (
          <div key={row.title} className="rounded-xl border border-border bg-surface-2 p-3.5">
            <div className="flex items-center gap-2">
              <row.icon aria-hidden className="h-4 w-4" style={{ color: row.color }} />
              <span className="text-label font-medium text-fg-tertiary">{row.eyebrow}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{row.title}</span>
              <span className="tabular-nums text-sm font-semibold" data-money="">{row.value}</span>
            </div>
            <p className="mt-1 text-label leading-relaxed text-fg-secondary">{row.detail}</p>
            <ProgressBar className="mt-2.5" value={row.spent} max={row.total} tone="neutral" label={`${row.title} progress`}
              valueText={`${formatPct(row.total > 0 ? (row.spent / row.total) * 100 : 0)} of ${row.title.toLowerCase()}`} />
          </div>
        ))}
      </div>
    </Card>
  )
}
