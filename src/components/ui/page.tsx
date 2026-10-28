import * as React from 'react'
import { cn } from '@/lib/utils'

// One page shell for every finance route (VIS-09). The root layout's <main>
// already provides the side gutters, so Page only constrains width and
// spaces sections; PageHeader replaces the ad-hoc section-tick headers.

export interface PageProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Reading-width column (Ask Mona). */
  narrow?: boolean
}

export function Page({ narrow = false, className, ...props }: PageProps) {
  return (
    <div
      className={cn('mx-auto flex w-full min-w-0 flex-col gap-6', narrow ? 'max-w-3xl' : 'max-w-[1200px]', className)}
      {...props}
    />
  )
}

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned controls; at most one primary button. */
  actions?: React.ReactNode
  /** Small line under the description, e.g. "Updated 9:15". */
  meta?: React.ReactNode
}

export function PageHeader({ eyebrow, title, description, actions, meta, className, ...props }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)} {...props}>
      <div className="min-w-0">
        {eyebrow && <p className="text-label font-medium text-fg-tertiary">{eyebrow}</p>}
        <h1 className="text-[1.75rem] font-semibold leading-[2.125rem] tracking-[-0.02em] text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-secondary">{description}</p>}
        {meta && <p className="mt-1 text-label text-fg-tertiary">{meta}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
