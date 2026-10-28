import * as React from 'react'
import { cn } from '@/lib/utils'
import { TONE_TEXT_CLASS, type Tone } from '@/lib/budget-tone'

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
  value: React.ReactNode
  /** Change vs a reference ('+$12.4k'); this is what carries colour. */
  delta?: React.ReactNode
  hint?: React.ReactNode
  /** Tone for delta/hint only. The value itself stays neutral (VIS-03). */
  tone?: Tone
  size?: 'hero' | 'md' | 'sm'
  /** Mark the value as money so the privacy toggle blurs it (non-money stats stay visible). */
  money?: boolean
}

const VALUE_SIZE: Record<NonNullable<StatProps['size']>, string> = {
  hero: 'text-[2.5rem] leading-[2.75rem] tracking-[-0.025em]',
  md: 'text-[1.75rem] leading-8 tracking-[-0.02em]',
  sm: 'text-xl leading-[1.625rem]',
}

export function Stat({ label, value, delta, hint, tone = 'neutral', size = 'md', money = false, className, ...props }: StatProps) {
  return (
    <div className={cn('min-w-0', className)} {...props}>
      <div className="text-label font-medium text-fg-secondary">{label}</div>
      <div
        className={cn('num-metric mt-1 font-semibold text-fg', VALUE_SIZE[size])}
        {...(money ? { 'data-money': '' } : { 'data-privacy-exempt': '' })}
      >
        {value}
      </div>
      {(delta || hint) && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-label">
          {delta && <span className={cn('num font-medium', TONE_TEXT_CLASS[tone])}>{delta}</span>}
          {hint && <span className={tone === 'neutral' || delta ? 'text-fg-tertiary' : TONE_TEXT_CLASS[tone]}>{hint}</span>}
        </div>
      )}
    </div>
  )
}
