// Token-driven chart theme (VIS-01, VIS-14, MOB-13). Every colour resolves
// through CSS variables, so the same props render correctly in both themes.
// Components (<ChartGrid/>, <ChartLegend/>, <ChartFigure/>) live in
// src/components/ui/finance-chart.tsx; this module is plain data + helpers.
import type { CSSProperties } from 'react'
import { formatCompact, formatMonthShort, formatMoney } from './format'

const v = (name: string, alpha?: number) => (alpha == null ? `hsl(var(--${name}))` : `hsl(var(--${name}) / ${alpha})`)

export const CHART = {
  grid: v('chart-grid'),
  axis: v('text-tertiary'),
  cursor: v('border-strong'),
  surface: v('popover'),
  series: {
    income: v('positive'),
    spend: v('foreground', 0.7),
    budget: v('text-tertiary'),
    target: v('warning'),
    info: v('info'),
    ownerA: v('owner-a'),
    ownerB: v('owner-b'),
    shared: v('owner-shared'),
    negative: v('negative'),
  },
  dash: { budget: '4 4', target: '6 4' },
  strokeWidth: 2,
  animationMs: 400,
  bar: { radius: [4, 4, 0, 0] as [number, number, number, number], maxBarSize: 28, categoryGap: 8 },
  areaOpacity: { top: 0.18, bottom: 0 },
  fontSize: 11,
} as const

/** `<Tooltip {...chartTooltipProps} />` — popover surface, readable label, tabular numbers. */
export const chartTooltipProps: {
  contentStyle: CSSProperties
  labelStyle: CSSProperties
  itemStyle: CSSProperties
  wrapperStyle: CSSProperties
  cursor: { stroke: string; strokeWidth: number }
} = {
  contentStyle: {
    background: CHART.surface,
    border: `1px solid ${v('border')}`,
    borderRadius: 10,
    boxShadow: `0 12px 32px -12px ${v('shadow-color', 0.5)}`,
    padding: '8px 12px',
    fontSize: 12,
    color: v('foreground'),
  },
  labelStyle: { color: v('text-secondary'), fontWeight: 500, fontSize: 12, marginBottom: 4 },
  itemStyle: { color: v('foreground'), fontVariantNumeric: 'tabular-nums', padding: 0 },
  wrapperStyle: { outline: 'none' },
  cursor: { stroke: CHART.cursor, strokeWidth: 1 },
}

/** `<CartesianGrid {...chartGridProps} />` — horizontal lines only, solid, quiet. */
export const chartGridProps = { vertical: false, horizontal: true, stroke: CHART.grid, strokeDasharray: '0' } as const

const tick = { fill: CHART.axis, fontSize: CHART.fontSize }

/** Shared axis look: 11px tertiary ticks, no axis or tick lines. */
export const chartAxisProps = { tick, axisLine: false, tickLine: false, tickMargin: 6 } as const

/** Recharts tick formatter for 'YYYY-MM' (or 'YYYY-MM-DD') x values: 'Jul', with the year on the first tick and on January. */
export function monthTick(value: string, index = 1): string {
  return formatMonthShort(value, { withYear: index === 0 ? true : 'auto' })
}

/** Compact money ticks: '$20k', '$1.5M'. */
export function moneyTick(value: number): string {
  return formatCompact(value)
}

/** Tooltip value formatter: full money ('$83,536'). */
export function moneyTooltipFormatter(value: unknown): string {
  return formatMoney(typeof value === 'number' ? value : Number(value))
}

export const chartXAxisMonthProps = { ...chartAxisProps, tickFormatter: monthTick } as const
export const chartYAxisMoneyProps = { ...chartAxisProps, width: 44, tickCount: 4, tickFormatter: moneyTick } as const

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Spread on Line/Area/Bar: 400ms, off when the user prefers reduced motion. */
export function chartAnimationProps(): { isAnimationActive: boolean; animationDuration: number } {
  return { isAnimationActive: !prefersReducedMotion(), animationDuration: CHART.animationMs }
}

/** Drop leading periods where every given key is 0/empty (no fake ramps from empty months). */
export function trimLeadingEmpty<T extends Record<string, unknown>>(rows: readonly T[], keys: Array<keyof T>): T[] {
  const first = rows.findIndex(row => keys.some(k => Number(row[k]) !== 0 && row[k] != null && row[k] !== ''))
  return first === -1 ? [] : rows.slice(first)
}

/**
 * Drop leading periods whose combined value is immaterial — under `ratio` of the
 * median non-zero period. A few stray legacy rows would otherwise start the
 * chart months early with a fake ramp up from ~0.
 */
export function trimLeadingSparse<T extends Record<string, unknown>>(rows: readonly T[], keys: Array<keyof T>, ratio = 0.05): T[] {
  const totals = rows.map(row => keys.reduce((s, k) => s + Math.abs(Number(row[k]) || 0), 0))
  const nonZero = totals.filter(t => t > 0).sort((a, b) => a - b)
  if (nonZero.length === 0) return []
  const mid = Math.floor(nonZero.length / 2)
  const median = nonZero.length % 2 ? nonZero[mid] : (nonZero[mid - 1] + nonZero[mid]) / 2
  const first = totals.findIndex(t => t > 0 && t >= median * ratio)
  return first === -1 ? [] : rows.slice(first)
}

/** Text alternative for a series: "Balance: $120k in Jul to $98k in Dec". */
export function describeSeries(label: string, points: Array<{ x: string; y: number }>): string {
  if (points.length === 0) return `${label}: no data`
  const first = points[0]
  const last = points[points.length - 1]
  if (points.length === 1) return `${label}: ${formatCompact(first.y)} in ${formatMonthShort(first.x, { withYear: true })}`
  return `${label}: ${formatCompact(first.y)} in ${formatMonthShort(first.x, { withYear: true })} to ${formatCompact(last.y)} in ${formatMonthShort(last.x, { withYear: true })}`
}
