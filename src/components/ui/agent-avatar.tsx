interface AgentAvatarProps {
  src: string
  name: string
  status?: 'online' | 'busy' | 'offline'
  size?: 'sm' | 'md' | 'lg'
  glowColor?: string
}

const sizes = {
  sm: 'h-8 w-8',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
}

const statusColors = {
  online: 'ring-emerald-500',
  busy: 'ring-yellow-500',
  offline: 'ring-gray-500',
}

export function AgentAvatar({ src, name, status, size = 'md', glowColor }: AgentAvatarProps) {
  return (
    <div
      className={`relative ${sizes[size]} rounded-2xl overflow-hidden shadow-lg ${status ? `ring-2 ${statusColors[status]}` : ''}`}
      style={glowColor && status === 'online' ? {
        '--glow-color': glowColor,
        animation: 'agentGlow 3s ease-in-out infinite',
      } as React.CSSProperties : undefined}
    >
      <img src={src} alt={name} className="w-full h-full object-cover" />
    </div>
  )
}
