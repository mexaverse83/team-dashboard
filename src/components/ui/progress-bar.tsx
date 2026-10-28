import * as React from 'react'
import { cn } from '@/lib/utils'
import { getBudgetTone, TONE_FILL_CLASS, type Tone } from '@/lib/budget-tone'

export interface ProgressBarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'> {
  value: number
  max: number
  /** 'auto' (default) colours via getBudgetTone(value vs max). */
  tone?: Tone | 'auto'
  /** Projected total, so 'auto' turns amber when only the projection is over. */
  projected?: number | null
  isFixed?: boolean
  /** Pace marker in the same units as value/max (e.g. max × day/daysInMonth). */
  marker?: number | null
  /** Accessible name, e.g. "Dining Out budget". */
  label: string
  /** Spoken value, e.g. "55% — $69,047 short". Defaults to the percentage. */
  valueText?: string
}

/** 6px bar on a surface-3 track with an optional pace marker (MOB-13, VIS-03). */
export function ProgressBar({ value, max, tone = 'auto', projected, isFixed, marker, label, valueText, className, ...props }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 0
  const pct = safeMax > 0 ? (Math.max(0, value) / safeMax) * 100 : 0
  const resolvedTone: Tone = tone === 'auto' ? getBudgetTone({ actual: value, budget: max, projected, isFixed }) : tone
  const markerPct = marker != null && safeMax > 0 ? Math.min(100, Math.max(0, (marker / safeMax) * 100)) : null
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(Math.max(0, value))}
      aria-valuetext={valueText ?? `${Math.round(pct)}%`}
      data-tone={resolvedTone}
      className={cn('relative h-1.5 w-full rounded-full bg-surface-3', className)}
      {...props}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', TONE_FILL_CLASS[resolvedTone])} style={{ width: `${Math.min(100, pct)}%` }} />
      {markerPct != null && (
        <span
          aria-hidden="true"
          data-testid="progress-marker"
          className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-fg-secondary"
          style={{ left: `${markerPct}%` }}
        />
      )}
    </div>
  )
}
