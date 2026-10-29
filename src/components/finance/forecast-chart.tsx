'use client'

import {
  ComposedChart, Area, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, Bar,
} from 'recharts'
import { ChartFigure, ChartGrid } from '@/components/ui/finance-chart'
import { CHART, chartAnimationProps, chartAxisProps, chartTooltipProps } from '@/lib/chart-theme'
import { formatCompact, formatDateShort } from '@/lib/format'

type ForecastPoint = {
  date: string
  inflow: number
  outflow: number
  net: number
  running_balance: number
}

interface ForecastChartProps {
  data: ForecastPoint[]
  height?: number
  showBalance?: boolean
  showFlows?: boolean
}

const SERIES_LABELS: Record<string, string> = {
  inflow: 'Inflow',
  outflow: 'Outflow',
  running_balance: 'Balance',
  net: 'Net',
}

function dateTick(value: string): string {
  return formatDateShort(value)
}

export function ForecastChart({ data, height = 240, showBalance = true, showFlows = true }: ForecastChartProps) {
  const minBal = Math.min(...data.map(d => d.running_balance), 0)
  const negativeZone = minBal < 0
  const first = data[0]
  const last = data[data.length - 1]
  const summary = first && last
    ? `Projected balance: ${formatCompact(first.running_balance)} on ${formatDateShort(first.date)} to ${formatCompact(last.running_balance)} on ${formatDateShort(last.date)}${negativeZone ? `, dipping to ${formatCompact(minBal)}` : ''}`
    : 'Cash-flow forecast: no data'
  const animation = chartAnimationProps()

  return (
    <ChartFigure summary={summary}>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.series.info} stopOpacity={CHART.areaOpacity.top} />
                <stop offset="100%" stopColor={CHART.series.info} stopOpacity={CHART.areaOpacity.bottom} />
              </linearGradient>
            </defs>
            <ChartGrid />
            <XAxis
              dataKey="date"
              {...chartAxisProps}
              tickFormatter={dateTick}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis {...chartAxisProps} className="money-axis" tickFormatter={(v: number) => formatCompact(v)} width={48} tickCount={4} />
            <Tooltip
              {...chartTooltipProps}
              labelFormatter={(label) => formatDateShort(String(label))}
              formatter={(value, name) => [formatCompact(Number(value) || 0), SERIES_LABELS[String(name)] || String(name)]}
            />
            {negativeZone && (
              <ReferenceLine y={0} stroke={CHART.series.negative} strokeDasharray={CHART.dash.budget} strokeOpacity={0.6} />
            )}
            {showFlows && (
              <>
                <Bar dataKey="inflow" fill={CHART.series.income} fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={6} {...animation} />
                <Bar dataKey="outflow" fill={CHART.series.spend} fillOpacity={0.45} radius={[2, 2, 0, 0]} maxBarSize={6} {...animation} />
              </>
            )}
            {showBalance && (
              <Area
                type="linear"
                dataKey="running_balance"
                stroke={CHART.series.info}
                strokeWidth={CHART.strokeWidth}
                fill="url(#balanceGrad)"
                dot={false}
                activeDot={{ r: 4, fill: CHART.series.info, stroke: CHART.surface, strokeWidth: 2 }}
                {...animation}
              />
            )}
            {showFlows && !showBalance && (
              <Line type="linear" dataKey="net" stroke={CHART.series.info} strokeWidth={1.5} dot={false} {...animation} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  )
}
