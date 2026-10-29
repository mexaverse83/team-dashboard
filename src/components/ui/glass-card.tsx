import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

/**
 * @deprecated Use `Card` from `@/components/ui/card`. Kept as a token-based
 * alias (no `.glass` styles) for the screens that still import it.
 */
export function GlassCard({ children, className, onClick }: GlassCardProps) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface p-4 text-fg shadow-card sm:p-5', className)} onClick={onClick}>
      {children}
    </div>
  )
}
