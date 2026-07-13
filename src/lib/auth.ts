// Whitelisted emails — only these can access /finance/*.
// Env-driven so demo clones define their own list (comma-separated).
const fromEnv = (process.env.NEXT_PUBLIC_ALLOWED_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

export const ALLOWED_EMAILS = fromEnv.length > 0 ? fromEnv : [
  'bernardo.gza83@gmail.com',
  'lcampomtz89@gmail.com',
  'bernardo.garza@nexaminds.ai',
]

export function isAllowedEmail(email: string | undefined): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}
