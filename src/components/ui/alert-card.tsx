'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, AlertCircle, Info, CheckCircle2, X, ChevronRight } from 'lucide-react'

export type AlertSeverity = 'info' | 'success' | 'warning' | 'danger'

interface AlertCardProps {
  severity?: AlertSeverity
  title: string
  description?: ReactNode
  action?: { label: string; href?: string; onClick?: () => void }
  onDismiss?: () => void
  compact?: boolean
}

const SEVERITY_STYLES: Record<AlertSeverity, { bg: string; border: string; icon: typeof Info; iconColor: string }> = {
  info: {
    bg: 'bg-[hsl(217,91%,60%)/0.08]',
    border: 'border-[hsl(217,91%,60%)/0.25]',
    icon: Info,
    iconColor: 'text-blue-400',
  },
  success: {
    bg: 'bg-[hsl(142,71%,45%)/0.08]',
    border: 'border-[hsl(142,71%,45%)/0.25]',
    icon: CheckCircle2,
    iconColor: 'text-emerald-400',
  },
  warning: {
    bg: 'bg-[hsl(38,92%,50%)/0.08]',
    border: 'border-[hsl(38,92%,50%)/0.3]',
    icon: AlertTriangle,
    iconColor: 'text-amber-400',
  },
  danger: {
    bg: 'bg-[hsl(0,84%,60%)/0.08]',
    border: 'border-[hsl(0,84%,60%)/0.3]',
    icon: AlertCircle,
    iconColor: 'text-rose-400',
  },
}

export function AlertCard({
  severity = 'info',
  title,
  description,
  action,
  onDismiss,
  compact = false,
}: AlertCardProps) {
  const styles = SEVERITY_STYLES[severity]
  const Icon = styles.icon

  return (
    <div className={`relative rounded-lg border ${styles.bg} ${styles.border} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex gap-3">
        <Icon className={`h-5 w-5 shrink-0 ${styles.iconColor} ${compact ? 'mt-0' : 'mt-0.5'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug">{title}</p>
          {description && (
            <div className={`text-xs text-[hsl(var(--text-secondary))] ${compact ? 'mt-0.5' : 'mt-1'} leading-relaxed`}>
              {description}
            </div>
          )}
          {action && (
            action.href ? (
              <Link
                href={action.href}
                className={`inline-flex items-center gap-1 mt-2 text-xs font-medium ${styles.iconColor} hover:underline`}
              >
                {action.label} <ChevronRight className="h-3 w-3" />
              </Link>
            ) : (
              <button
                onClick={action.onClick}
                className={`inline-flex items-center gap-1 mt-2 text-xs font-medium ${styles.iconColor} hover:underline`}
              >
                {action.label} <ChevronRight className="h-3 w-3" />
              </button>
            )
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="shrink-0 h-5 w-5 rounded hover:bg-[hsl(var(--muted))] flex items-center justify-center text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-primary))] transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  )
}
