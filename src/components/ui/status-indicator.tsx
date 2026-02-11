interface StatusIndicatorProps {
  status: 'online' | 'busy' | 'offline'
  label?: boolean
  size?: 'sm' | 'md'
}

const config = {
  online: { color: 'bg-emerald-500', pulse: true, text: 'Online' },
  busy: { color: 'bg-yellow-500', pulse: true, text: 'Busy' },
  offline: { color: 'bg-gray-500', pulse: false, text: 'Offline' },
}

export function StatusIndicator({ status, label = false, size = 'sm' }: StatusIndicatorProps) {
  const c = config[status] ?? config.offline
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${dotSize} rounded-full ${c.color} ${c.pulse ? 'status-online' : ''}`} />
      {label && <span className="text-xs text-[hsl(var(--text-secondary))]">{c.text}</span>}
    </span>
  )
}
