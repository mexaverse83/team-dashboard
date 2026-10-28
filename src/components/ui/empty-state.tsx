import type { ReactNode } from 'react'
import { Inbox, BarChart3, Radio, Users, CheckSquare } from 'lucide-react'

const icons = {
  inbox: Inbox,
  chart: BarChart3,
  radio: Radio,
  users: Users,
  tasks: CheckSquare,
}

interface EmptyStateProps {
  icon?: keyof typeof icons
  title: string
  description?: string
  /** One call to action (VIS-17). */
  action?: ReactNode
}

/** Empty (not failed) lists. For load failures / sign-in walls use <ErrorState/>. */
export function EmptyState({ icon = 'inbox', title, description, action }: EmptyStateProps) {
  const Icon = icons[icon]
  return (
    <div role="status" className="flex flex-col items-center justify-center py-16 px-4">
      <div className="h-12 w-12 rounded-xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
        <Icon aria-hidden="true" className="h-6 w-6 text-[hsl(var(--text-tertiary))]" />
      </div>
      <h3 className="text-sm font-semibold text-[hsl(var(--text-secondary))] mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-[hsl(var(--text-tertiary))] text-center max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
