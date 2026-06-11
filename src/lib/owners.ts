// Owner mapping: email → display name
export const OWNER_MAP: Record<string, string> = {
  'bernardo.gza83@gmail.com': 'Bernardo',
  'lcampomtz89@gmail.com': 'Laura',
}

export const OWNERS = Object.values(OWNER_MAP)

export function getOwnerName(email: string | undefined): string {
  if (!email) return 'Bernardo' // default
  return OWNER_MAP[email.toLowerCase()] || email.split('@')[0]
}

export const OWNER_COLORS: Record<string, string> = {
  'Bernardo': '#3B82F6', // blue
  'Laura': '#EC4899',    // pink
}

export function getOwnerColor(name: string): string {
  return OWNER_COLORS[name] || '#6B7280'
}

/** Case-insensitive owner comparison — the DB holds mixed casing
 * ('Bernardo' from manual entry forms, 'bernardo' from the recurring
 * processor's source tables). */
export function ownersEqual(a?: string | null, b?: string | null): boolean {
  return (a || '').toLowerCase() === (b || '').toLowerCase()
}

/** Map any casing ('bernardo', 'BERNARDO') to the canonical display name
 * ('Bernardo'); unknown values ('joint', null) pass through unchanged. */
export function canonicalOwner(owner?: string | null): string | null {
  if (!owner) return null
  return OWNERS.find(o => o.toLowerCase() === owner.toLowerCase()) || owner
}
