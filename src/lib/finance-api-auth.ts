import { NextRequest, NextResponse } from 'next/server'
import { isAllowedEmail } from '@/lib/auth'
import { createSupabaseServer } from '@/lib/supabase-server'

type AuthOk = { ok: true; method: 'api-key' | 'cron' | 'user' }
type AuthFail = { ok: false; response: NextResponse }

interface FinanceAuthOptions {
  allowCron?: boolean
}

function hasValidApiKey(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  return Boolean(key && expected && key === expected)
}

function hasValidCronSecret(req: NextRequest) {
  const auth = req.headers.get('authorization')
  return Boolean(process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`)
}

export async function authorizeFinanceRequest(
  req: NextRequest,
  options: FinanceAuthOptions = {},
): Promise<AuthOk | AuthFail> {
  if (hasValidApiKey(req)) return { ok: true, method: 'api-key' }

  if (options.allowCron) {
    if (hasValidCronSecret(req)) return { ok: true, method: 'cron' }
    if (req.headers.get('x-vercel-cron') === '1') return { ok: true, method: 'cron' }
  }

  try {
    const supabase = await createSupabaseServer()
    const { data: { user } } = await supabase.auth.getUser()
    if (isAllowedEmail(user?.email)) return { ok: true, method: 'user' }
  } catch {
    // Missing env vars or invalid cookies should fall through to 401.
  }

  return {
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  }
}
