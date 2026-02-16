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
