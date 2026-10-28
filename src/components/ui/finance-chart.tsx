'use client'

// FinanceChart kit (VIS-01, VIS-14, MOB-13): token-driven grid, a legend that
// draws each series' real stroke and dash, and a figure wrapper that gives
// every chart a text alternative. Props/tokens live in src/lib/chart-theme.ts.
import * as React from 'react'
import { CartesianGrid } from 'recharts'
import { cn } from '@/lib/utils'
import { chartGridProps } from '@/lib/chart-theme'

export {
  CHART,
  chartTooltipProps,
  chartGridProps,
  chartAxisProps,
  chartXAxisMonthProps,
  chartYAxisMoneyProps,
  chartAnimationProps,
  monthTick,
  moneyTick,
  moneyTooltipFormatter,
  trimLeadingEmpty,
  describeSeries,
} from '@/lib/chart-theme'

/** Horizontal, solid, `--chart-grid` gridlines. Drop-in for <CartesianGrid/> inside any Recharts chart. */
export function ChartGrid(props: React.ComponentProps<typeof CartesianGrid>) {
  return <CartesianGrid {...chartGridProps} {...props} />
}

export interface ChartLegendItem {
  label: string
  color: string
  /** SVG dasharray ('4 4') to mirror a dashed series. */
  dash?: string
  kind?: 'line' | 'area' | 'bar'
}

/** 12px legend that shows the true stroke and dash of each series (never a grey square). */
export function ChartLegend({ items, className }: { items: ChartLegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-label text-fg-secondary', className)}>
      {items.map(item => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <svg aria-hidden="true" width="16" height="10" viewBox="0 0 16 10" className="shrink-0">
            {item.kind === 'bar'
              ? <rect x="3" y="0" width="10" height="10" rx="2" fill={item.color} />
              : <>
                  {item.kind === 'area' && <rect x="0" y="5" width="16" height="5" fill={item.color} opacity="0.18" />}
                  <line x1="0" y1="5" x2="16" y2="5" stroke={item.color} strokeWidth="2" strokeDasharray={item.dash} strokeLinecap="round" />
                </>}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  )
}

export interface ChartFigureProps extends Omit<React.HTMLAttributes<HTMLElement>, 'role'> {
  /** What the chart shows, in one sentence — read by screen readers instead of the SVG. */
  summary: string
  /** Optional visible caption. */
  caption?: React.ReactNode
  /** Optional data table for assistive tech (rendered visually hidden). */
  table?: { columns: string[]; rows: Array<Array<string | number>> }
}

export function ChartFigure({ summary, caption, table, className, children, ...props }: ChartFigureProps) {
  return (
    <figure className={cn('m-0 min-w-0', className)} {...props}>
      <div role="img" aria-label={summary}>{children}</div>
      {caption && <figcaption className="mt-2 text-label text-fg-tertiary">{caption}</figcaption>}
      {table && (
        <table className="sr-only">
          <caption>{summary}</caption>
          <thead><tr>{table.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
          <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
        </table>
      )}
    </figure>
  )
}
