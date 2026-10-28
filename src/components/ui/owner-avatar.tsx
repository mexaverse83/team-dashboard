import * as React from 'react'
import { cn } from '@/lib/utils'
import { canonicalOwner, OWNERS } from '@/lib/owners'

export type OwnerSlot = 'owner-a' | 'owner-b' | 'owner-shared'

/** Token slot for an owner in any casing ('bernardo' → owner-a); unknown/joint/null → shared. */
export function ownerSlot(owner: string | null | undefined): OwnerSlot {
  const canonical = canonicalOwner(owner)
  if (canonical === OWNERS[0]) return 'owner-a'
  if (canonical === OWNERS[1]) return 'owner-b'
  return 'owner-shared'
}

export interface OwnerAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  owner: string | null | undefined
  /** Diameter in px (default 20). */
  size?: number
  /** Show the canonical name next to the initial. */
  showName?: boolean
}

/** Initial in an owner-coloured ring (VIS-11). Canonicalizes casing first. */
export function OwnerAvatar({ owner, size = 20, showName = false, className, ...props }: OwnerAvatarProps) {
  const name = canonicalOwner(owner) || 'Shared'
  const slot = ownerSlot(owner)
  const initial = slot === 'owner-shared' ? (name.toLowerCase() === 'shared' || name.toLowerCase() === 'joint' ? 'B+L' : name.charAt(0).toUpperCase()) : name.charAt(0).toUpperCase()
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)} data-owner-slot={slot} {...props}>
      <span
        role="img"
        aria-label={name}
        className="inline-flex shrink-0 items-center justify-center rounded-full border-[1.5px] font-semibold leading-none"
        style={{
          width: size,
          height: size,
          fontSize: Math.max(9, Math.round(size * (initial.length > 1 ? 0.36 : 0.5))),
          borderColor: `hsl(var(--${slot}))`,
          color: `hsl(var(--${slot}))`,
          background: `hsl(var(--${slot}) / 0.12)`,
        }}
      >
        {initial}
      </span>
      {showName && <span className="text-label text-fg-secondary">{name}</span>}
    </span>
  )
}
