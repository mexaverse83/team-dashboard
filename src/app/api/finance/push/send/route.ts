import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { canonicalOwner } from '@/lib/owners'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { sendPush } from '@/lib/automation/push'

/**
 * POST /api/finance/push/send — send one message to every device, or to one
 * owner's devices. Schedulers and scripts only (CRON_SECRET bearer or
 * x-api-key); a browser session cannot broadcast. Body: { title, body, url?, owner? }.
 * The person-initiated test send is POST /api/finance/push/test.
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response
  if (auth.method !== 'cron' && auth.method !== 'api-key') {
    return NextResponse.json({ error: 'Scheduler or API key required' }, { status: 403 })
  }

  let body: { title?: string; body?: string; url?: string; owner?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const title = String(body.title || '').trim().slice(0, 120)
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const url = typeof body.url === 'string' && body.url.startsWith('/') ? body.url : '/finance'

  let supabase: SupabaseClient
  try {
    supabase = getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
  try {
    const result = await sendPush(supabase, { title, body: String(body.body || '').slice(0, 400), url }, { owner: canonicalOwner(body.owner) })
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 })
  }
}
