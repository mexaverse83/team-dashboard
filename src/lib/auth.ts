// Whitelisted emails — only these can access /finance/*
export const ALLOWED_EMAILS = [
  'bernardo.gza83@gmail.com',
  // Add wife's email here later
]

export function isAllowedEmail(email: string | undefined): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}
