import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { configErrorResponse, getAdminClientInfo } from '@/lib/supabase-admin'
import { buildJobStatuses, overallHealth, type HeartbeatRow } from '@/lib/automation/runs'
import { isInsightUsable } from '@/lib/insight-freshness'

const PAGE_SIZE = 1000

/**
 * GET /api/finance/health (AUTO-06, CH-22) — is the household's automation
 * alive? Per job: last_ok_at, last_run_at, status ok|late|failing, last_error,
 * expected_every_h. Plus the checks that silently broke before: service-key
 * presence (boolean only), transactions vs the 1000-row page, the latest
 * AI brief, and at least one active recurring-income row (F18).
 *
 * Before supabase-2026-10-automation-runs.sql is applied the job times are
 * inferred from data timestamps (`source: 'inferred'`).
 */
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response

  let supabase: SupabaseClient
  let degraded: boolean
  try {
    const info = getAdminClientInfo()
    supabase = info.client
    degraded = info.degraded
  } catch (err) {
    return configErrorResponse(err)
  }
  const now = new Date()

  const [heartbeats, runs, txCount, insights, recurringIncome] = await Promise.all([
    supabase.from('finance_automation_heartbeats').select('*'),
    supabase.from('finance_automation_runs').select('job, trigger, started_at, finished_at, status, created_count, error')
      .is('dedupe_key', null).order('started_at', { ascending: false }).limit(15),
    supabase.from('finance_transactions').select('id', { count: 'exact', head: true }),
    supabase.from('finance_insights_cache').select('generated_at, period_month').order('generated_at', { ascending: false }).limit(1),
    supabase.from('finance_recurring_income').select('id', { count: 'exact', head: true }).eq('active', true),
  ])

  const ledger = heartbeats.error ? 'missing' : 'ok'
  let jobs
  if (!heartbeats.error) {
    jobs = buildJobStatuses((heartbeats.data || []) as HeartbeatRow[], now, 'ledger')
  } else {
    // Ledger not migrated yet: infer from the data the jobs produce.
    const [autoTx, snapshot] = await Promise.all([
      supabase.from('finance_transactions').select('created_at')
        .overlaps('tags', ['auto-recurring', 'auto-income', 'auto-msi']).order('created_at', { ascending: false }).limit(1),
      supabase.from('finance_net_worth_snapshots').select('created_at').order('created_at', { ascending: false }).limit(1),
    ])
    const inferred: HeartbeatRow[] = []
    const at = (v: unknown) => (typeof v === 'string' ? v : null)
    const recurringAt = at(autoTx.data?.[0]?.created_at)
    const snapshotAt = at(snapshot.data?.[0]?.created_at)
    if (recurringAt) inferred.push({ job: 'process-recurring', last_ok_at: recurringAt, last_run_at: recurringAt, last_status: 'ok' })
    if (snapshotAt) inferred.push({ job: 'net-worth', last_ok_at: snapshotAt, last_run_at: snapshotAt, last_status: 'ok' })
    const briefAt = at(insights.data?.[0]?.generated_at)
    if (briefAt) inferred.push({ job: 'insights', last_ok_at: briefAt, last_run_at: briefAt, last_status: 'ok' })
    // Reminders and the daily push have no data trail to infer from.
    jobs = buildJobStatuses(inferred, now, 'inferred').filter(j => j.job !== 'reminders' && j.job !== 'push-daily')
  }

  const latestBrief = insights.data?.[0] ?? null
  const transactions = txCount.error ? null : (txCount.count ?? 0)
  const activeIncome = recurringIncome.error ? null : (recurringIncome.count ?? 0)
  const checks = {
    ledger,
    service_key_present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    data_degraded: degraded,
    cron_secret_present: Boolean(process.env.CRON_SECRET),
    push_configured: Boolean(process.env.VAPID_PRIVATE_KEY),
    transactions: transactions == null ? null : {
      count: transactions,
      page_size: PAGE_SIZE,
      pages: Math.ceil(transactions / PAGE_SIZE),
    },
    insights: {
      generated_at: latestBrief?.generated_at ?? null,
      usable_today: isInsightUsable(latestBrief?.generated_at, { now, category: 'WIDGET', periodMonth: latestBrief?.period_month }),
    },
    recurring_income_active: activeIncome,
  }
  const problems: string[] = []
  if (!checks.service_key_present) problems.push('SUPABASE_SERVICE_ROLE_KEY is not set')
  if (activeIncome === 0) problems.push('No active recurring income rows — salaries will not post')
  const status = problems.length && overallHealth(jobs) === 'ok' ? 'late' : overallHealth(jobs)

  return NextResponse.json({
    status,
    generated_at: now.toISOString(),
    jobs,
    checks,
    problems,
    recent_runs: runs.error ? [] : runs.data || [],
  }, { headers: { 'Cache-Control': 'no-store' } })
}
