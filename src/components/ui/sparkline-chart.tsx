'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface SparklineChartProps {
  data: number[]
  color?: string
  width?: number
  height?: number
}

export function SparklineChart({ data, color = 'hsl(217, 91%, 60%)', width = 80, height = 24 }: SparklineChartProps) {
  const chartData = data.map((value, i) => ({ value, i }))

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
