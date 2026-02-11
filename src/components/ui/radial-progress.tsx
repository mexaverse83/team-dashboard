'use client'

interface RadialProgressProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  color?: string
  trackColor?: string
  label?: string
  sublabel?: string
}

export function RadialProgress({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  color = 'hsl(217, 91%, 60%)',
  trackColor = 'hsl(222, 47%, 9%)',
  label,
  sublabel,
}: RadialProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percentage = Math.min(value / max, 1)
  const offset = circumference - percentage * circumference

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="progress-ring"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold" style={{ color }}>{label ?? `${Math.round(percentage * 100)}%`}</span>
        {sublabel && <span className="text-xs text-[hsl(var(--text-secondary))]">{sublabel}</span>}
      </div>
    </div>
  )
}
