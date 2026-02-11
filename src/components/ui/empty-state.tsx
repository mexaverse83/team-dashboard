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
}

export function EmptyState({ icon = 'inbox', title, description }: EmptyStateProps) {
  const Icon = icons[icon]
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="h-12 w-12 rounded-xl bg-[hsl(var(--muted))] flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-[hsl(var(--text-tertiary))]" />
      </div>
      <h3 className="text-sm font-semibold text-[hsl(var(--text-secondary))] mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-[hsl(var(--text-tertiary))] text-center max-w-xs">{description}</p>
      )}
    </div>
  )
}
