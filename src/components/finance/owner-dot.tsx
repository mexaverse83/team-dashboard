'use client'

import { cn } from '@/lib/utils'

const config: Record<string, { color: string; label: string; name: string }> = {
  Bernardo: { color: 'bg-blue-500', label: 'B', name: 'Bernardo' },
  Laura: { color: 'bg-pink-500', label: 'L', name: 'Laura' },
  shared: { color: 'bg-violet-500', label: '👥', name: 'Shared' },
}

interface OwnerDotProps {
  owner: string | null | undefined
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

export function OwnerDot({ owner, size = 'sm', showLabel = false, className }: OwnerDotProps) {
  if (!owner) return null
  const c = config[owner] || config['shared']
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={c.name}>
      <span className={cn("rounded-full shrink-0", dotSize, c.color)} />
      {showLabel && <span className="text-xs text-[hsl(var(--text-tertiary))]">{c.name}</span>}
    </span>
  )
}

export function OwnerBar({ bernardo, laura, className }: { bernardo: number; laura: number; className?: string }) {
  const total = bernardo + laura
  if (total === 0) return null
  const bPct = (bernardo / total) * 100
  const lPct = (laura / total) * 100

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-1 w-full rounded-full overflow-hidden">
        <div className="bg-blue-500 transition-all" style={{ width: `${bPct}%` }} />
        <div className="bg-pink-500 transition-all" style={{ width: `${lPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-[hsl(var(--text-tertiary))]">
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />B: ${bernardo.toLocaleString()}</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-pink-500" />L: ${laura.toLocaleString()}</span>
      </div>
    </div>
  )
}
