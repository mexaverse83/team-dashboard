import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { formatTrendPct, MINUS } from '@/lib/format'
import { TONE_BG_CLASS, TONE_TEXT_CLASS } from '@/lib/budget-tone'

interface TrendBadgeProps {
  /** Signed change as it happened (+12 = up 12%). */
  value: number
  suffix?: string
  /** A rise is bad (spending): keep the real sign in the text, flip only the colour. */
  invert?: boolean
  className?: string
}

export function TrendBadge({ value, suffix = '%', invert = false, className = '' }: TrendBadgeProps) {
  const isUp = value > 0
  const isNeutral = value === 0
  const Icon = isNeutral ? Minus : isUp ? TrendingUp : TrendingDown
  const good = invert ? value < 0 : value > 0
  const tone = isNeutral ? 'neutral' : good ? 'positive' : 'negative'
  // Percentages are clamped (±999%, '>10×') so tiny baselines can't print '+3401%'.
  const text = suffix.startsWith('%')
    ? `${Math.abs(value) >= 999.5 ? '>10×' : formatTrendPct(value)}${suffix.slice(1)}`
    : `${isUp ? '+' : value < 0 ? MINUS : ''}${Math.abs(value)}${suffix}`

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${TONE_TEXT_CLASS[tone]} ${TONE_BG_CLASS[tone]} ${className}`}>
      <Icon aria-hidden="true" className="w-3 h-3" />
      {text}
    </span>
  )
}
