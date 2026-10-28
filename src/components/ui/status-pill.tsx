import * as React from 'react'
import { cn } from '@/lib/utils'
import { TONE_BG_CLASS, TONE_FILL_CLASS, TONE_TEXT_CLASS, type Tone } from '@/lib/budget-tone'

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

/** Dot + word status (replaces 🔴⚠️✅ markers, VIS-10). The word carries the meaning; colour reinforces it. */
export function StatusPill({ tone = 'neutral', className, children, ...props }: StatusPillProps) {
  return (
    <span
      data-tone={tone}
      className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.75rem]/4 font-medium', TONE_BG_CLASS[tone], TONE_TEXT_CLASS[tone], className)}
      {...props}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 shrink-0 rounded-full', TONE_FILL_CLASS[tone])} />
      {children}
    </span>
  )
}
