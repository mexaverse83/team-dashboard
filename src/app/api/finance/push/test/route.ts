import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { canonicalOwner, getOwnerName, OWNERS } from '@/lib/owners'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { sendPush } from '@/lib/automation/push'

/**
 * POST /api/finance/push/test — "Send test push" for the signed-in person's
 * own devices (NU-7). Requires a household session and an explicit
 * { confirm: true }; there is deliberately no GET variant.
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  if (auth.method !== 'user') return NextResponse.json({ error: 'Sign in to send a test push' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { confirm?: boolean }
  if (body.confirm !== true) return NextResponse.json({ error: 'confirm: true required' }, { status: 400 })

  const owner = auth.email ? canonicalOwner(getOwnerName(auth.email)) : null
  let supabase: SupabaseClient
  try {
    supabase = getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
  try {
    const result = await sendPush(supabase, {
      title: 'Mona test push',
      body: 'Notifications work on this device. You’ll get the morning plan and bill reminders here.',
      url: '/finance',
    }, { owner: owner && OWNERS.includes(owner) ? owner : null })
    return NextResponse.json({ ok: result.sent > 0, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 })
  }
}
