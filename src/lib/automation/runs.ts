// Run ledger for scheduled work (AUTO-06, CH-22). Every job writes one row to
// finance_automation_runs per run and upserts its row in
// finance_automation_heartbeats, so /api/finance/health can say "late" or
// "failing" instead of the household finding out months later.
// Ledger writes never throw: a broken ledger must not break the job itself.
import type { SupabaseClient } from '@supabase/supabase-js'

export type AutomationJob =
  | 'process-recurring'
  | 'net-worth'
  | 'insights'
  | 'push-daily'
  | 'reminders'
  | 'wolff-events'
  | 'mona-daemon'

export type RunStatus = 'ok' | 'warning' | 'error'
export type JobHealth = 'ok' | 'late' | 'failing'

export interface JobDefinition {
  job: AutomationJob
  label: string
  /** Expected cadence in hours; null = event-driven (never "late"). */
  expected_every_h: number | null
  /** Shown in the health panel only once it has reported at least once. */
  optional?: boolean
  /** POST target for the panel's "Run now" button. */
  run_path?: string
}

export const AUTOMATION_JOBS: readonly JobDefinition[] = [
  { job: 'process-recurring', label: 'Recurring bills, income & MSI', expected_every_h: 24, run_path: '/api/finance/process-recurring' },
  { job: 'net-worth', label: 'Net-worth snapshot', expected_every_h: 24, run_path: '/api/finance/net-worth' },
  { job: 'reminders', label: 'Reminders', expected_every_h: 24 },
  { job: 'push-daily', label: 'Daily push', expected_every_h: 24 },
  { job: 'insights', label: 'Mona AI brief', expected_every_h: 24, optional: true },
  { job: 'wolff-events', label: 'Transaction alerts', expected_every_h: null, optional: true },
  { job: 'mona-daemon', label: 'Mona chat daemon', expected_every_h: 1, optional: true },
]

/** A job is late once it misses its cadence by this much (24h job → late after 26h). */
export const LATE_GRACE_H = 2

export interface RunRecord {
  job: AutomationJob
  trigger?: string | null
  started_at: Date | string
  finished_at?: Date | string
  status: RunStatus
  created_count?: number
  details?: Record<string, unknown> | null
  error?: string | null
  /** Unique per reminder/day; a second insert with the same key is ignored. */
  dedupe_key?: string | null
}

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : v)

export function triggerFromAuth(method: string | undefined, req?: { headers: Headers }): string {
  if (method === 'cron') return 'cron'
  if (method === 'api-key') return req?.headers.get('x-automation-trigger') || 'api-key'
  return method === 'user' ? 'manual' : 'unknown'
}

/** Inserts the run row and refreshes the job heartbeat. Returns an error message instead of throwing. */
export async function recordRun(supabase: SupabaseClient, run: RunRecord): Promise<string | null> {
  const finished = iso(run.finished_at ?? new Date())
  const errors: string[] = []
  try {
    const { error } = await supabase.from('finance_automation_runs').insert({
      job: run.job,
      trigger: run.trigger ?? null,
      started_at: iso(run.started_at),
      finished_at: finished,
      ok: run.status !== 'error',
      status: run.status,
      created_count: run.created_count ?? 0,
      details: run.details ?? null,
      error: run.error ?? null,
      dedupe_key: run.dedupe_key ?? null,
    })
    if (error) errors.push(`run: ${error.message}`)
  } catch (e) {
    errors.push(`run: ${(e as Error).message}`)
  }
  const beat = await heartbeat(supabase, run.job, { status: run.status, at: finished, error: run.error, trigger: run.trigger, details: run.details })
  if (beat) errors.push(beat)
  if (errors.length) console.error('automation ledger write failed:', errors.join('; '))
  return errors.length ? errors.join('; ') : null
}

/** Upserts the one-row-per-job heartbeat; last_ok_at only moves on a non-error run. */
export async function heartbeat(
  supabase: SupabaseClient,
  job: AutomationJob,
  { status, at = new Date().toISOString(), error, trigger, details }: { status: RunStatus; at?: string; error?: string | null; trigger?: string | null; details?: Record<string, unknown> | null },
): Promise<string | null> {
  const def = AUTOMATION_JOBS.find(j => j.job === job)
  const row: Record<string, unknown> = {
    job,
    last_run_at: at,
    last_status: status,
    last_error: status === 'ok' ? null : (error ?? null),
    last_trigger: trigger ?? null,
    expected_every_h: def?.expected_every_h ?? null,
    details: details ?? null,
    updated_at: new Date().toISOString(),
  }
  if (status !== 'error') row.last_ok_at = at
  try {
    const { error: upsertError } = await supabase.from('finance_automation_heartbeats').upsert(row, { onConflict: 'job' })
    return upsertError ? `heartbeat: ${upsertError.message}` : null
  } catch (e) {
    return `heartbeat: ${(e as Error).message}`
  }
}

/**
 * Claims a dedupe key (e.g. `card-due:BBVA Infinite:Laura:2026-10-29`).
 * true = first claim, go ahead and send; false = already sent (or the ledger
 * is unavailable, in which case we'd rather skip than spam).
 */
export async function claimDedupeKey(supabase: SupabaseClient, job: AutomationJob, key: string, details?: Record<string, unknown>): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('finance_automation_runs')
      .upsert({
        job,
        trigger: 'dedupe',
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        ok: true,
        status: 'ok',
        created_count: 1,
        details: details ?? null,
        dedupe_key: key,
      }, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id')
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

export interface HeartbeatRow {
  job: string
  last_run_at?: string | null
  last_ok_at?: string | null
  last_status?: RunStatus | null
  last_error?: string | null
  last_trigger?: string | null
  expected_every_h?: number | null
  details?: Record<string, unknown> | null
}

export interface JobStatus {
  job: string
  label: string
  last_ok_at: string | null
  last_run_at: string | null
  status: JobHealth
  last_error: string | null
  expected_every_h: number | null
  last_trigger?: string | null
  warnings?: string[]
  run_path?: string
  /** 'ledger' = heartbeat table; 'inferred' = derived from data timestamps (ledger not migrated yet). */
  source?: 'ledger' | 'inferred'
}

const hoursSince = (at: string | null | undefined, now: Date) => {
  if (!at) return Infinity
  const t = new Date(at).getTime()
  return Number.isFinite(t) ? (now.getTime() - t) / 3_600_000 : Infinity
}

/** failing beats late beats ok. A job whose latest run errored is failing even if an older run was fine. */
export function computeJobHealth(
  row: Pick<HeartbeatRow, 'last_run_at' | 'last_ok_at' | 'last_status'> | null | undefined,
  expectedEveryH: number | null,
  now: Date = new Date(),
): JobHealth {
  if (row?.last_status === 'error') {
    const okAfterRun = row.last_ok_at && row.last_run_at && new Date(row.last_ok_at) >= new Date(row.last_run_at)
    if (!okAfterRun) return 'failing'
  }
  if (expectedEveryH == null) return 'ok'
  return hoursSince(row?.last_ok_at, now) > expectedEveryH + LATE_GRACE_H ? 'late' : 'ok'
}

export function buildJobStatuses(rows: readonly HeartbeatRow[], now: Date = new Date(), source: 'ledger' | 'inferred' = 'ledger'): JobStatus[] {
  const byJob = new Map(rows.map(r => [r.job, r]))
  const out: JobStatus[] = []
  for (const def of AUTOMATION_JOBS) {
    const row = byJob.get(def.job)
    if (!row && def.optional) continue
    const expected = row?.expected_every_h ?? def.expected_every_h
    const warnings = Array.isArray(row?.details?.warnings) ? (row!.details!.warnings as unknown[]).map(String).slice(0, 10) : undefined
    out.push({
      job: def.job,
      label: def.label,
      last_ok_at: row?.last_ok_at ?? null,
      last_run_at: row?.last_run_at ?? null,
      status: computeJobHealth(row, expected, now),
      last_error: row?.last_error ?? null,
      expected_every_h: expected,
      last_trigger: row?.last_trigger ?? null,
      ...(warnings?.length ? { warnings } : {}),
      ...(def.run_path ? { run_path: def.run_path } : {}),
      source,
    })
  }
  return out
}

export function overallHealth(jobs: readonly Pick<JobStatus, 'status'>[]): JobHealth {
  if (jobs.some(j => j.status === 'failing')) return 'failing'
  if (jobs.some(j => j.status === 'late')) return 'late'
  return 'ok'
}
