import { type ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  glowColor?: string
}

export function GlassCard({ children, className = '', glowColor }: GlassCardProps) {
  return (
    <div
      className={`glass rounded-xl p-4 ${className}`}
      style={glowColor ? {
        '--glow-color': glowColor,
        animation: 'agentGlow 3s ease-in-out infinite',
      } as React.CSSProperties : undefined}
    >
      {children}
    </div>
  )
}
