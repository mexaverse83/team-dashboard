import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartFigure, ChartGrid, ChartLegend, chartXAxisMonthProps, chartYAxisMoneyProps } from '@/components/ui/finance-chart'

const data = [
  { month: '2026-08', spend: 120_000 },
  { month: '2026-09', spend: 98_000 },
  { month: '2026-10', spend: 110_000 },
]

describe('FinanceChart kit', () => {
  it('ChartGrid renders inside a real Recharts chart (wrapper components are supported)', () => {
    const { container } = render(
      <LineChart width={400} height={200} data={data}>
        <ChartGrid />
        <XAxis dataKey="month" {...chartXAxisMonthProps} />
        <YAxis {...chartYAxisMoneyProps} />
        <Line dataKey="spend" isAnimationActive={false} />
      </LineChart>,
    )
    const grid = container.querySelector('.recharts-cartesian-grid')
    expect(grid).not.toBeNull()
    expect(container.querySelectorAll('.recharts-cartesian-grid-vertical line')).toHaveLength(0)
    const horizontal = container.querySelector('.recharts-cartesian-grid-horizontal line')
    expect(horizontal?.getAttribute('stroke')).toBe('hsl(var(--chart-grid))')
  })

  it('ChartLegend draws the true stroke and dash', () => {
    const { container } = render(
      <ChartLegend items={[
        { label: 'Spend', color: 'hsl(var(--foreground) / 0.7)' },
        { label: 'Budget', color: 'hsl(var(--text-tertiary))', dash: '4 4' },
        { label: 'Income', color: 'hsl(var(--positive))', kind: 'bar' },
      ]} />,
    )
    expect(screen.getByText('Budget')).toBeInTheDocument()
    const lines = container.querySelectorAll('line')
    expect(lines[1].getAttribute('stroke-dasharray')).toBe('4 4')
    expect(lines[0].getAttribute('stroke')).toBe('hsl(var(--foreground) / 0.7)')
    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('hsl(var(--positive))')
  })

  it('ChartFigure gives the chart a text alternative and an optional data table', () => {
    render(
      <ChartFigure summary="Spending: $120k in Aug to $110k in Oct" caption="Last 3 months" table={{ columns: ['Month', 'Spend'], rows: [['Aug', '$120k']] }}>
        <svg />
      </ChartFigure>,
    )
    expect(screen.getByRole('img', { name: 'Spending: $120k in Aug to $110k in Oct' })).toBeInTheDocument()
    expect(screen.getByText('Last 3 months')).toBeInTheDocument()
    expect(screen.getByRole('table')).toHaveClass('sr-only')
  })
})
