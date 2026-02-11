'use client'

import { type ReactNode } from 'react'

type ActivityState = 'idle' | 'thinking' | 'acting' | 'complete'

interface AgentActivityRingProps {
  state: ActivityState
  color: string
  size?: number
  strokeWidth?: number
  children: ReactNode
}

export function AgentActivityRing({ state, color, size = 64, strokeWidth = 3, children }: AgentActivityRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  const stateStyles: Record<ActivityState, string> = {
    idle: 'animate-[breathe_2s_ease-in-out_infinite]',
    thinking: 'animate-[breathe_0.8s_ease-in-out_infinite]',
    acting: 'animate-[spin_1.5s_linear_infinite]',
    complete: 'animate-[flash_0.6s_ease-out]',
  }

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className={`absolute inset-0 -rotate-90 ${stateStyles[state]}`}
      >
        {/* Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={0.15}
        />
        {/* Active ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={state === 'acting' ? `${circumference * 0.3} ${circumference * 0.7}` : circumference.toString()}
          strokeDashoffset={state === 'idle' || state === 'thinking' ? '0' : undefined}
          opacity={state === 'idle' ? 0.4 : state === 'complete' ? 1 : 0.8}
        />
      </svg>
      <div className="relative z-10">
        {children}
      </div>

      <style jsx>{`
        @keyframes breathe {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes flash {
          0% { opacity: 1; filter: brightness(1.5); }
          100% { opacity: 0.4; filter: brightness(1); }
        }
      `}</style>
    </div>
  )
}
