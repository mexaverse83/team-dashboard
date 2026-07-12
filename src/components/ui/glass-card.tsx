import { type ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  glowColor?: string
  onClick?: () => void
}

export function GlassCard({ children, className = '', glowColor, onClick }: GlassCardProps) {
  return (
    <div
      className={`glass rounded-2xl p-4 sm:p-5 ${className}`}
      onClick={onClick}
      style={glowColor ? {
        '--glow-color': glowColor,
        animation: 'agentGlow 3s ease-in-out infinite',
      } as React.CSSProperties : undefined}
    >
      {children}
    </div>
  )
}
