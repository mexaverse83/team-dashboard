// Whitelisted emails — only these can access /finance/*
export const ALLOWED_EMAILS = [
  'bernardo.gza83@gmail.com',
  'lcampomtz89@gmail.com',
  'bernardo.garza@nexaminds.ai',
]

export function isAllowedEmail(email: string | undefined): boolean {
  if (!email) return false
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}
