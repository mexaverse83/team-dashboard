import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isAllowedEmail } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase-server'

export type AuthMethod = 'api-key' | 'cron' | 'user'
export type AuthOk = { ok: true; method: AuthMethod; email?: string | null }
type AuthFail = { ok: false; response: NextResponse }

interface FinanceAuthOptions {
  allowCron?: boolean
}

/** Constant-time string comparison; false for empty or missing values. */
export function safeEqual(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!provided || !expected) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    // Still burn a comparison so the length mismatch isn't observably faster.
    timingSafeEqual(b, b)
    return false
  }
  return timingSafeEqual(a, b)
}

// The service-role key used to double as an API key (widget, insights and
// scripts forwarded it when FINANCE_API_KEY was unset). Kept behind a flag
// until every caller sends FINANCE_API_KEY; set FINANCE_ALLOW_SERVICE_KEY_AS_API_KEY=0 to drop it.
function serviceKeyAcceptedAsApiKey() {
  return process.env.FINANCE_ALLOW_SERVICE_KEY_AS_API_KEY !== '0'
}

function hasValidApiKey(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  if (!key) return false
  if (safeEqual(key, process.env.FINANCE_API_KEY)) return true
  return serviceKeyAcceptedAsApiKey() && safeEqual(key, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function hasValidCronSecret(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return safeEqual(req.headers.get('authorization'), `Bearer ${secret}`)
}

// Order: dev bypass → Bearer CRON_SECRET (only where allowCron) → x-api-key →
// signed-in household session. `x-vercel-cron` is NOT trusted: any client can
// send it. Vercel cron authenticates with the CRON_SECRET bearer.
export async function authorizeFinanceRequest(
  req: NextRequest,
  options: FinanceAuthOptions = {},
): Promise<AuthOk | AuthFail> {
  // Local-only bypass, mirrors FinanceAuthGuard's: NODE_ENV is 'production'
  // in every deployed build, so this branch cannot exist outside `npm run dev`.
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_AUTH_BYPASS === '1') {
    return { ok: true, method: 'user' }
  }

  if (options.allowCron && hasValidCronSecret(req)) return { ok: true, method: 'cron' }

  if (hasValidApiKey(req)) return { ok: true, method: 'api-key' }

  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (isAllowedEmail(user?.email)) return { ok: true, method: 'user', email: user?.email ?? null }
  } catch {
    // Missing env vars or invalid cookies should fall through to 401.
  }

  return {
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  }
}
