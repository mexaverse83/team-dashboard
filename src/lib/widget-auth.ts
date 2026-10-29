// Read-only phone-widget tokens (W12, CH-03).
//
// WIDGET_READ_TOKENS is a comma list (one per phone, so each can be revoked on
// its own). A token unlocks only GET /api/finance/widget and widget-code; it is
// never accepted by authorizeFinanceRequest, so a leaked Finance.js cannot
// write. Until the env var is set the loader keeps the legacy behaviour.
import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

export const WIDGET_TOKEN_HEADER = 'x-widget-token'

export function widgetReadTokens(env: NodeJS.ProcessEnv = process.env): string[] {
  return String(env.WIDGET_READ_TOKENS || '')
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length >= 16)
}

const digest = (s: string) => createHash('sha256').update(s).digest()

/** Constant-time match against every configured token. */
export function isValidWidgetToken(candidate: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!candidate) return false
  const given = digest(candidate)
  let ok = false
  for (const token of widgetReadTokens(env)) {
    if (timingSafeEqual(given, digest(token))) ok = true
  }
  return ok
}

/** Widget GET routes: a read token first, then the normal finance auth. */
export async function authorizeWidgetRequest(req: NextRequest) {
  if (req.method === 'GET' && isValidWidgetToken(req.headers.get(WIDGET_TOKEN_HEADER))) {
    return { ok: true as const, method: 'widget-token' as const }
  }
  return authorizeFinanceRequest(req)
}

/**
 * The token embedded in a downloaded loader. `slot` picks one phone's token
 * (?slot=1 → the second entry); no slot means the first. An out-of-range or
 * invalid slot returns null — never another phone's token, or revoking one
 * phone would silently break both.
 */
export function widgetTokenForLoader(slot: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  const tokens = widgetReadTokens(env)
  if (!tokens.length) return null
  if (slot == null || slot === '') return tokens[0]
  const i = Number(slot)
  return Number.isInteger(i) && i >= 0 && i < tokens.length ? tokens[i] : null
}
