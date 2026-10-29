import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { AUTOMATION_JOBS, heartbeat, recordRun, type AutomationJob, type RunStatus } from '@/lib/automation/runs'

/**
 * POST /api/finance/automation/runs — lets home-PC scripts (Codex brief,
 * send-push, the chat daemon) write to the run ledger with the API key
 * instead of the anon key (AUTO-06, AUTO-14).
 *
 * Body: { job, status: 'ok'|'warning'|'error', started_at?, error?, created_count?, details?, heartbeat_only? }
 * `heartbeat_only` upserts the job's heartbeat without adding a run row
 * (for frequent pings like the daemon's).
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  if (auth.method !== 'api-key') return NextResponse.json({ error: 'API key required' }, { status: 403 })

  const body = await req.json().catch(() => null) as null | {
    job?: string; status?: string; started_at?: string; error?: string; created_count?: number; details?: Record<string, unknown>; heartbeat_only?: boolean; trigger?: string
  }
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  const job = AUTOMATION_JOBS.find(j => j.job === body.job)?.job as AutomationJob | undefined
  if (!job) return NextResponse.json({ error: 'unknown job', jobs: AUTOMATION_JOBS.map(j => j.job) }, { status: 400 })
  const status = (['ok', 'warning', 'error'] as const).find(s => s === body.status) as RunStatus | undefined
  if (!status) return NextResponse.json({ error: 'status must be ok, warning or error' }, { status: 400 })
  const startedAt = body.started_at && !Number.isNaN(new Date(body.started_at).getTime()) ? body.started_at : new Date().toISOString()
  const details = body.details && typeof body.details === 'object' ? body.details : null
  const error = body.error ? String(body.error).slice(0, 2000) : null
  const trigger = String(body.trigger || req.headers.get('x-automation-trigger') || 'script').slice(0, 40)

  let supabase: SupabaseClient
  try {
    supabase = getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
  const failure = body.heartbeat_only
    ? await heartbeat(supabase, job, { status, error, trigger, details })
    : await recordRun(supabase, { job, trigger, started_at: startedAt, status, error, created_count: Number(body.created_count) || 0, details })
  if (failure) return NextResponse.json({ error: failure }, { status: 503 })
  return NextResponse.json({ ok: true })
}
