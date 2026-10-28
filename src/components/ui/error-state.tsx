import * as React from 'react'
import { AlertTriangle, Inbox, Lock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ErrorStateVariant = 'empty' | 'error' | 'restricted'

export interface ErrorStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: ErrorStateVariant
  title?: React.ReactNode
  body?: React.ReactNode
  /** Custom action (link/button). */
  action?: React.ReactNode
  /** Renders a Retry button (error variant). */
  onRetry?: () => void
  retryLabel?: string
  /** Inline (inside a card) instead of a padded block. */
  compact?: boolean
}

const DEFAULTS: Record<ErrorStateVariant, { title: string; body: string; Icon: typeof Inbox }> = {
  empty: { title: 'Nothing here yet', body: 'Items you add will show up here.', Icon: Inbox },
  error: { title: "Couldn't load this", body: 'The numbers below may be out of date. Try again in a moment.', Icon: AlertTriangle },
  restricted: { title: 'Sign in to see this', body: 'This data is only visible to the household.', Icon: Lock },
}

/**
 * Tells "empty", "failed" and "not visible" apart (VIS-17). Never pair an
 * error with $0 KPIs: show '—' with this state instead.
 */
export function ErrorState({ variant = 'error', title, body, action, onRetry, retryLabel = 'Retry', compact = false, className, ...props }: ErrorStateProps) {
  const d = DEFAULTS[variant]
  const Icon = d.Icon
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      data-variant={variant}
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-2 py-4' : 'gap-3 px-4 py-12',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl',
          variant === 'error' ? 'bg-warning-bg text-warning' : 'bg-surface-2 text-fg-tertiary',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="max-w-xs">
        <p className="text-sm font-semibold text-fg">{title ?? d.title}</p>
        <p className="mt-1 text-[0.8125rem] leading-[1.125rem] text-fg-secondary">{body ?? d.body}</p>
      </div>
      {(action || onRetry) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface-2 px-4 text-sm font-semibold text-fg hover:border-border-strong"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              {retryLabel}
            </button>
          )}
          {action}
        </div>
      )}
    </div>
  )
}
