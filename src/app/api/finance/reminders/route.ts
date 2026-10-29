import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest, type AuthOk } from '@/lib/finance-api-auth'
import { addDaysKey, mexicoCityDateParts, mexicoCityToday } from '@/lib/dates'
import { bbvaCycleToPay } from '@/lib/payment-methods'
import { BABY_CHECKLIST } from '@/lib/baby-plan'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { buildReminders, type Reminder, type ReminderInput } from '@/lib/automation/reminders'
import { financeLocale, loadLiveBrief } from '@/lib/automation/live-brief'
import { hasPushAudience, sendPush } from '@/lib/automation/push'
import { claimDedupeKey, recordRun, releaseDedupeKey, triggerFromAuth } from '@/lib/automation/runs'

/**
 * Daily reminders (OPP-01/03/04): card due, tomorrow's month-start bills,
 * price changes, budget 80/100% crossings, logging gaps, the Sunday digest
 * and checklist deadlines. Each reminder is claimed once per key in the run
 * ledger, then pushed to its owner's devices.
 *
 * GET by the scheduler (Bearer CRON_SECRET) or POST with the API key sends.
 * Any other GET returns today's reminders without sending, so the app can show
 * them in-app while nobody is subscribed to push.
 */
async function gather(supabase: SupabaseClient, now: Date): Promise<{ input: ReminderInput; warnings: string[] }> {
  const today = mexicoCityToday(now)
  const mx = mexicoCityDateParts(now)
  const cycle = bbvaCycleToPay(today)
  const warnings: string[] = []

  const [cards, recurring, priceChanges, lastManual, checklistStatus] = await Promise.all([
    supabase.from('finance_transactions').select('type, amount_mxn, transaction_date, owner, payment_method')
      .not('payment_method', 'is', null).gte('transaction_date', cycle.start).lte('transaction_date', cycle.cut)
      .order('transaction_date', { ascending: true }).order('id', { ascending: true }).limit(1000),
    supabase.from('finance_recurring').select('name, amount, next_due_date, is_active').eq('is_active', true),
    supabase.from('finance_transactions').select('merchant, description, amount, transaction_date')
      .contains('flags', ['price_changed']).gte('transaction_date', addDaysKey(today, -1)),
    supabase.from('finance_transactions').select('created_at')
      .or('is_recurring.is.null,is_recurring.eq.false').order('created_at', { ascending: false }).limit(1),
    supabase.from('finance_checklist_status').select('item_id, done_at'),
  ])
  for (const [name, res] of Object.entries({ cards, recurring, priceChanges, lastManual })) {
    if (res.error) throw new Error(`${name}: ${res.error.message}`)
  }
  // The checklist table is new; until it's migrated nothing counts as done.
  if (checklistStatus.error) warnings.push('finance_checklist_status unavailable — run supabase-2026-10-checklist-status.sql')
  const done = new Set((checklistStatus.data || []).filter(r => r.done_at).map(r => String(r.item_id)))

  let budgets: ReminderInput['budgets'] = []
  let digest: ReminderInput['digest'] = null
  try {
    const { summary, brief } = await loadLiveBrief(supabase, now)
    const bva = (summary.current_month?.budget_vs_actual || []) as Array<{ category: string; spent: number; budget: number; is_non_monthly?: boolean; is_fixed?: boolean }>
    budgets = bva
    const top = [...bva].filter(b => b.budget > 0 && !b.is_fixed && !b.is_non_monthly)
      .sort((a, b) => b.spent / b.budget - a.spent / a.budget).slice(0, 3)
    digest = { weekTitle: brief.week.title, weekDetail: brief.week.detail, householdTitle: brief.household.title, topCategories: top }
  } catch (err) {
    warnings.push(`summary unavailable: ${(err as Error).message}`)
  }

  return {
    warnings,
    input: {
      today,
      dayOfWeek: mx.dayOfWeek,
      cardTransactions: (cards.data || []) as ReminderInput['cardTransactions'],
      recurring: recurring.data || [],
      priceChanges: priceChanges.data || [],
      budgets,
      lastManualEntryAt: lastManual.data?.[0]?.created_at ?? null,
      checklist: BABY_CHECKLIST.map(item => ({ id: item.id, title: item.title, windowEnd: item.windowEnd })),
      checklistDone: done,
      digest,
      lang: financeLocale(),
    },
  }
}

async function run(req: NextRequest, auth: AuthOk, send: boolean) {
  let supabase: SupabaseClient
  try {
    supabase = getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
  const startedAt = new Date()
  const trigger = triggerFromAuth(auth.method, req)

  let reminders: Reminder[]
  let warnings: string[]
  try {
    const gathered = await gather(supabase, startedAt)
    reminders = buildReminders(gathered.input)
    warnings = gathered.warnings
  } catch (err) {
    const error = (err as Error).message
    if (send) await recordRun(supabase, { job: 'reminders', trigger, started_at: startedAt, status: 'error', error })
    return NextResponse.json({ error }, { status: 503 })
  }

  if (!send) return NextResponse.json({ reminders, warnings, sent: false }, { headers: { 'Cache-Control': 'no-store' } })

  // Without an audience nothing is claimed, so nothing is marked "sent" that wasn't.
  const audience = await hasPushAudience(supabase)
  const outcomes: Array<{ key: string; status: 'sent' | 'duplicate' | 'no-audience' | 'ledger-missing' | 'failed'; devices?: number }> = []
  for (const reminder of reminders) {
    if (!audience) {
      outcomes.push({ key: reminder.key, status: 'no-audience' })
      continue
    }
    // Claimed before sending so a concurrent retry can't double-send; given
    // back when nothing was delivered so the next run tries again.
    const dedupeKey = `reminder:${reminder.key}`
    const claim = await claimDedupeKey(supabase, 'reminders', dedupeKey, { kind: reminder.kind, owner: reminder.owner })
    if (claim !== 'claimed') {
      outcomes.push({ key: reminder.key, status: claim === 'duplicate' ? 'duplicate' : 'ledger-missing' })
      continue
    }
    try {
      const result = await sendPush(supabase, reminder, { owner: reminder.owner })
      if (result.sent === 0) await releaseDedupeKey(supabase, dedupeKey)
      outcomes.push({ key: reminder.key, status: result.sent > 0 ? 'sent' : 'failed', devices: result.sent })
    } catch (err) {
      await releaseDedupeKey(supabase, dedupeKey)
      outcomes.push({ key: reminder.key, status: 'failed' })
      warnings.push(`${reminder.key}: ${(err as Error).message}`)
    }
  }
  if (outcomes.some(o => o.status === 'ledger-missing')) {
    warnings.push('Reminders not sent: run ledger unavailable — run supabase-2026-10-automation-runs.sql')
  }

  const sent = outcomes.filter(o => o.status === 'sent').length
  const failed = outcomes.filter(o => o.status === 'failed').length
  if (!audience && reminders.length) warnings.push('No push audience (VAPID_PRIVATE_KEY unset or no subscribed devices)')
  await recordRun(supabase, {
    job: 'reminders',
    trigger,
    started_at: startedAt,
    status: failed ? 'warning' : warnings.length ? 'warning' : 'ok',
    created_count: sent,
    error: failed ? `${failed} reminder(s) failed to send` : null,
    details: { outcomes, warnings },
  })
  return NextResponse.json({ reminders, outcomes, warnings, sent }, { headers: { 'Cache-Control': 'no-store' } })
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
