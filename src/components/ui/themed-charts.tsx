'use client'

import {
  AreaChart, Area, ResponsiveContainer,
  RadialBarChart, RadialBar,
  Tooltip,
} from 'recharts'

// Themed colors from CSS vars (resolved at render time)
const CHART_COLORS = {
  brand: 'hsl(217, 91%, 60%)',
  success: 'hsl(142, 71%, 45%)',
  warning: 'hsl(38, 92%, 50%)',
  danger: 'hsl(0, 84%, 60%)',
  tars: 'hsl(35, 92%, 50%)',
  cooper: 'hsl(205, 84%, 50%)',
  murph: 'hsl(263, 70%, 58%)',
  brand_agent: 'hsl(145, 63%, 42%)',
  mann: 'hsl(350, 80%, 55%)',
  tom: 'hsl(174, 60%, 47%)',
}

interface ThemedAreaChartProps {
  data: Record<string, unknown>[]
  dataKey: string
  color?: keyof typeof CHART_COLORS | string
  height?: number
  showTooltip?: boolean
  gradient?: boolean
}

export function ThemedAreaChart({
  data,
  dataKey,
  color = 'brand',
  height = 120,
  showTooltip = true,
  gradient = true,
}: ThemedAreaChartProps) {
  const strokeColor = CHART_COLORS[color as keyof typeof CHART_COLORS] || color
  const id = `gradient-${dataKey}-${Math.random().toString(36).slice(2, 6)}`

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        {gradient && (
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity={0.3} />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
            </linearGradient>
          </defs>
        )}
        {showTooltip && (
          <Tooltip
            contentStyle={{
              background: 'hsl(222, 47%, 6%)',
              border: '1px solid hsl(222, 20%, 18%)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'hsl(0, 0%, 95%)',
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={strokeColor}
          strokeWidth={2}
          fill={gradient ? `url(#${id})` : 'none'}
          dot={false}
          animationDuration={800}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

interface ThemedRadialChartProps {
  value: number
  max?: number
  color?: keyof typeof CHART_COLORS | string
  size?: number
  innerRadius?: string
  outerRadius?: string
  label?: string
}

export function ThemedRadialChart({
  value,
  max = 100,
  color = 'brand',
  size = 120,
  innerRadius = '70%',
  outerRadius = '90%',
  label,
}: ThemedRadialChartProps) {
  const fillColor = CHART_COLORS[color as keyof typeof CHART_COLORS] || color
  const data = [{ value, fill: fillColor }]

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          data={data}
          startAngle={90}
          endAngle={90 - (360 * value / max)}
          barSize={8}
        >
          <RadialBar
            dataKey="value"
            background={{ fill: 'hsl(222, 47%, 9%)' }}
            cornerRadius={4}
            animationDuration={1000}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      {label && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color: fillColor }}>{label}</span>
        </div>
      )}
    </div>
  )
}

export { CHART_COLORS }
