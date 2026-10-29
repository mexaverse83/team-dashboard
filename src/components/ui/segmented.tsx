'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: React.ReactNode
  icon?: React.ReactNode
  /** Accessible name when `label` is visual-only (an icon). */
  ariaLabel?: string
  disabled?: boolean
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /** Required: names the group for VoiceOver ("Transaction type"). */
  ariaLabel: string
  /** Id of a visible label; takes precedence over ariaLabel when set. */
  ariaLabelledBy?: string
  size?: 'sm' | 'md'
  /** Stretch segments to fill the width. */
  fullWidth?: boolean
  className?: string
}

/**
 * Single-choice segmented control (MOB-12): role=radiogroup with
 * role=radio + aria-checked, roving tabindex and arrow-key navigation.
 * md segments are 44px tall; sm (36px) segments keep a 44px hit area.
 */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, ariaLabelledBy, size = 'md', fullWidth = false, className }: SegmentedProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([])
  const enabled = options.filter(o => !o.disabled)

  const move = (from: number, step: number) => {
    if (enabled.length === 0) return
    const current = enabled.findIndex(o => o.value === options[from].value)
    const next = enabled[(current + step + enabled.length) % enabled.length]
    onChange(next.value)
    refs.current[options.indexOf(next)]?.focus()
  }

  const onKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(index, 1) }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(index, -1) }
  }

  const selectedIndex = Math.max(0, options.findIndex(o => o.value === value))

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cn('inline-flex gap-1 rounded-xl border border-border bg-surface-2 p-1', fullWidth && 'flex w-full', className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            ref={el => { refs.current[index] = el }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown(index)}
            className={cn(
              'relative inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors disabled:opacity-50',
              size === 'md' ? 'h-11' : "h-9 after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-['']",
              fullWidth && 'flex-1',
              checked ? 'bg-surface text-fg shadow-card' : 'text-fg-secondary hover:text-fg',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
