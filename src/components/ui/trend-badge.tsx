import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface TrendBadgeProps {
  value: number
  suffix?: string
  className?: string
}

export function TrendBadge({ value, suffix = '%', className = '' }: TrendBadgeProps) {
  const isPositive = value > 0
  const isNeutral = value === 0
  const Icon = isNeutral ? Minus : isPositive ? TrendingUp : TrendingDown
  const color = isNeutral
    ? 'text-[hsl(var(--text-secondary))] bg-[hsl(var(--muted))]'
    : isPositive
      ? 'text-emerald-400 bg-emerald-500/10'
      : 'text-red-400 bg-red-500/10'

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${color} ${className}`}>
      <Icon className="w-3 h-3" />
      {isPositive && '+'}{value}{suffix}
    </span>
  )
}
