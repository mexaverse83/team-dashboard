'use client'

import { cn } from '@/lib/utils'
import { canonicalOwner, OWNERS, ownerColor } from '@/lib/owners'
import { formatMoney } from '@/lib/format'

/** Display name for an owner value in any casing; joint/unknown → 'Shared'. */
function ownerName(owner: string): string {
  const canonical = canonicalOwner(owner)
  return canonical && OWNERS.includes(canonical) ? canonical : 'Shared'
}

interface OwnerDotProps {
  owner: string | null | undefined
  size?: 'sm' | 'md'
  showLabel?: boolean
  className?: string
}

// Canonicalizes casing first (VIS-11): processor rows hold 'bernardo', which
// must still render as Bernardo, not fall through to Shared.
export function OwnerDot({ owner, size = 'sm', showLabel = false, className }: OwnerDotProps) {
  if (!owner) return null
  const name = ownerName(owner)
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)} title={name} data-owner={name}>
      <span className={cn("rounded-full shrink-0", dotSize)} style={{ background: ownerColor(owner) }} />
      {showLabel && <span className="text-xs text-fg-tertiary">{name}</span>}
    </span>
  )
}

export function OwnerBar({ bernardo, laura, className }: { bernardo: number; laura: number; className?: string }) {
  const total = bernardo + laura
  if (total === 0) return null
  const bPct = (bernardo / total) * 100
  const lPct = (laura / total) * 100
  const aColor = ownerColor(OWNERS[0])
  const bColor = ownerColor(OWNERS[1])

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-1 w-full rounded-full overflow-hidden" aria-hidden="true">
        <div className="transition-all" style={{ width: `${bPct}%`, background: aColor }} />
        <div className="transition-all" style={{ width: `${lPct}%`, background: bColor }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-micro text-fg-tertiary">
        <span className="flex items-center gap-1 whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full" style={{ background: aColor }} />{OWNERS[0].charAt(0)}: <span data-money>{formatMoney(bernardo)}</span></span>
        <span className="flex items-center gap-1 whitespace-nowrap"><span className="h-1.5 w-1.5 rounded-full" style={{ background: bColor }} />{OWNERS[1].charAt(0)}: <span data-money>{formatMoney(laura)}</span></span>
      </div>
    </div>
  )
}
