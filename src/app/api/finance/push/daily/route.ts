import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest, type AuthOk } from '@/lib/finance-api-auth'
import { mexicoCityToday } from '@/lib/dates'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { dailyPushMessage, freshLlmDirective, latestCachedBrief, loadLiveBrief } from '@/lib/automation/live-brief'
import { hasPushAudience, sendPush, type PushMessage } from '@/lib/automation/push'
import { claimDedupeKey, recordRun, triggerFromAuth } from '@/lib/automation/runs'

/**
 * The 08:00 CDMX push (MOB-04, AUTO-08). Built from the live deterministic
 * numbers so it is never stale; the LLM's WIDGET title is used only when it is
 * from today. Cron GET (Bearer CRON_SECRET) or API-key POST sends; any other
 * GET returns a preview without sending.
 */
async function run(req: NextRequest, auth: AuthOk, send: boolean) {
  let supabase: SupabaseClient
  try {
    supabase = getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
  const startedAt = new Date()
  const today = mexicoCityToday(startedAt)
  const trigger = triggerFromAuth(auth.method, req)

  let message: PushMessage
  try {
    const { brief } = await loadLiveBrief(supabase, startedAt)
    const llm = freshLlmDirective(await latestCachedBrief(supabase).catch(() => null), startedAt)
    message = dailyPushMessage(brief, llm?.title)
  } catch (err) {
    const error = `live brief unavailable: ${(err as Error).message}`
    if (send) await recordRun(supabase, { job: 'push-daily', trigger, started_at: startedAt, status: 'error', error })
    return NextResponse.json({ error }, { status: 503 })
  }

  if (!send) return NextResponse.json({ preview: true, message }, { headers: { 'Cache-Control': 'no-store' } })

  if (!(await hasPushAudience(supabase))) {
    await recordRun(supabase, { job: 'push-daily', trigger, started_at: startedAt, status: 'warning', error: 'No push audience (VAPID_PRIVATE_KEY unset or no subscribed devices)', details: { message } })
    return NextResponse.json({ ok: true, sent: 0, skipped: 'no-audience', message })
  }
  // One daily push per Mexico City day, however many times the scheduler retries.
  if (!(await claimDedupeKey(supabase, 'push-daily', `push-daily:${today}`))) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 'already-sent', message })
  }
  try {
    const result = await sendPush(supabase, message)
    await recordRun(supabase, {
      job: 'push-daily', trigger, started_at: startedAt,
      status: result.failed > 0 && result.sent === 0 ? 'error' : 'ok',
      created_count: result.sent,
      error: result.failed ? `${result.failed} device(s) failed` : null,
      details: { message, ...result },
    })
    return NextResponse.json({ ok: true, message, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    await recordRun(supabase, { job: 'push-daily', trigger, started_at: startedAt, status: 'error', error: (err as Error).message })
    return NextResponse.json({ error: (err as Error).message }, { status: 503 })
  }
}

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response
  return run(req, auth, auth.method === 'cron')
}

export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response
  if (auth.method !== 'cron' && auth.method !== 'api-key') {
    return NextResponse.json({ error: 'Scheduler or API key required' }, { status: 403 })
  }
  return run(req, auth, true)
}
