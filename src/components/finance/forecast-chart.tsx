'use client'

import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Bar,
} from 'recharts'

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

const tooltipStyle = {
  contentStyle: {
    background: 'hsl(222, 47%, 6%)',
    border: '1px solid hsl(222, 20%, 18%)',
    borderRadius: '8px',
    fontSize: '12px',
    padding: '8px 12px',
  },
  labelStyle: { color: 'hsl(222, 15%, 55%)', fontSize: 11 },
}

function fmtMoney(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n).toLocaleString()}`
}

function fmtDate(s: string) {
  const d = new Date(s + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function ForecastChart({ data, height = 240, showBalance = true, showFlows = true }: ForecastChartProps) {
  const minBal = Math.min(...data.map(d => d.running_balance), 0)
  const negativeZone = minBal < 0

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 14%)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'hsl(222, 15%, 55%)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtMoney}
            width={50}
          />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(label) => fmtDate(String(label))}
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                inflow: 'Inflow',
                outflow: 'Outflow',
                running_balance: 'Balance',
              }
              return [fmtMoney(Number(value) || 0), labels[String(name)] || String(name)]
            }}
          />
          {negativeZone && (
            <ReferenceLine y={0} stroke="hsl(0, 84%, 60%)" strokeDasharray="4 4" strokeOpacity={0.5} />
          )}
          {showFlows && (
            <>
              <Bar dataKey="inflow" fill="hsl(142, 71%, 45%)" fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={6} />
              <Bar dataKey="outflow" fill="hsl(0, 84%, 60%)" fillOpacity={0.6} radius={[2, 2, 0, 0]} maxBarSize={6} />
            </>
          )}
          {showBalance && (
            <Area
              type="monotone"
              dataKey="running_balance"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              fill="url(#balanceGrad)"
              dot={false}
              activeDot={{ r: 4, fill: 'hsl(217, 91%, 60%)', stroke: 'hsl(222, 47%, 3%)', strokeWidth: 2 }}
            />
          )}
          {showFlows && !showBalance && (
            <Line type="monotone" dataKey="net" stroke="hsl(217, 91%, 60%)" strokeWidth={1.5} dot={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
