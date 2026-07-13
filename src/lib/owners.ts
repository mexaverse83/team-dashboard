// Owner identity — env-driven so one codebase serves the real household and
// demo clones (e.g. Mario & Karla). Defaults preserve the original deployment.
const A_NAME = process.env.NEXT_PUBLIC_OWNER_A_NAME || 'Bernardo'
const B_NAME = process.env.NEXT_PUBLIC_OWNER_B_NAME || 'Laura'
const A_EMAIL = (process.env.NEXT_PUBLIC_OWNER_A_EMAIL || 'bernardo.gza83@gmail.com').toLowerCase()
const B_EMAIL = (process.env.NEXT_PUBLIC_OWNER_B_EMAIL || 'lcampomtz89@gmail.com').toLowerCase()
const A_COLOR = process.env.NEXT_PUBLIC_OWNER_A_COLOR || '#3B82F6'
const B_COLOR = process.env.NEXT_PUBLIC_OWNER_B_COLOR || '#EC4899'

// Owner mapping: email → display name
export const OWNER_MAP: Record<string, string> = {
  [A_EMAIL]: A_NAME,
  [B_EMAIL]: B_NAME,
}

export const OWNERS = [A_NAME, B_NAME]

export function getOwnerName(email: string | undefined): string {
  if (!email) return A_NAME // default
  return OWNER_MAP[email.toLowerCase()] || email.split('@')[0]
}

export const OWNER_COLORS: Record<string, string> = {
  [A_NAME]: A_COLOR,
  [B_NAME]: B_COLOR,
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
