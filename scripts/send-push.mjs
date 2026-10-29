#!/usr/bin/env node
// Sends the daily brief (or a custom message) as a web push.
//
// Usage: npm run push:send                      (today's plan from live numbers)
//        node scripts/send-push.mjs "Title" "Body text" [/finance/url]
//
// The server does the work: POST /api/finance/push/daily builds the message
// from the deterministic live plan (never a stale brief), dedupes per day,
// sends with Vercel's VAPID_PRIVATE_KEY and logs the run (AUTO-07, AUTO-08).
// Only when the server has no VAPID key does this script send itself, with
// VAPID_PRIVATE_KEY from .env.local.
//
// Requires in .env.local: FINANCE_API_KEY (and, for the local fallback,
// VAPID_PRIVATE_KEY + Supabase URL + SUPABASE_SERVICE_ROLE_KEY — after the RLS
// lockdown the anon key can no longer read finance_push_subscriptions). The
// VAPID public key lives in src/lib/push-config.ts.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import webpush from 'web-push'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const env = {}
  for (const line of readFileSync(join(repoRoot, '.env.local'), 'utf8').split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}
const env = loadEnvLocal()
const { NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, VAPID_PRIVATE_KEY, FINANCE_API_KEY } = env
const BASE_URL = env.FINANCE_BASE_URL || 'https://finance.autonomis.co'
const headers = { 'x-api-key': FINANCE_API_KEY || '', 'Content-Type': 'application/json', 'x-automation-trigger': 'send-push' }

// Used only when the server is unreachable: no numbers rather than old numbers.
const OFFLINE_MESSAGE = { title: 'Mona', body: 'Open Mona for today\'s plan.', url: '/finance' }

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

async function logRun(status, error, details) {
  if (!FINANCE_API_KEY) return
  await post('/api/finance/automation/runs', { job: 'push-daily', status, error, details }).catch(() => {})
}

// Legacy direct send (home machine's VAPID key).
async function sendLocally(message) {
  if (!VAPID_PRIVATE_KEY) throw new Error('server cannot send (no VAPID key in Vercel) and VAPID_PRIVATE_KEY is missing from .env.local')
  const pushConfig = readFileSync(join(repoRoot, 'src/lib/push-config.ts'), 'utf8')
  const VAPID_PUBLIC_KEY = pushConfig.match(/VAPID_PUBLIC_KEY = '([^']+)'/)[1]
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:bernardo.garza@nexaminds.ai', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

  // finance_push_subscriptions is service-role only once supabase-2026-10-rls-lockdown.sql
  // is applied; the anon key is a pre-lockdown fallback that then reads nothing.
  const key = SERVICE || ANON
  const res = await fetch(`${URL_}/rest/v1/finance_push_subscriptions?select=endpoint,subscription`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`subscriptions fetch failed (${res.status})${SERVICE ? '' : ' — add SUPABASE_SERVICE_ROLE_KEY to .env.local (the RLS lockdown blocks the anon key)'}`)
  const subs = await res.json()
  if (!SERVICE && subs.length === 0) console.warn('no subscriptions visible with the anon key — after the RLS lockdown, set SUPABASE_SERVICE_ROLE_KEY in .env.local')
  let sent = 0
  for (const row of subs) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(message))
      sent++
    } catch (err) {
      console.error('push failed:', err.statusCode || err.message)
    }
  }
  return { sent, targeted: subs.length }
}

async function main() {
  if (!FINANCE_API_KEY) throw new Error('FINANCE_API_KEY missing from .env.local')
  const [, , argTitle, argBody, argUrl] = process.argv

  if (argTitle) {
    const message = { title: argTitle, body: argBody || '', url: argUrl || '/finance' }
    const res = await post('/api/finance/push/send', message)
    if (res.ok && res.json.skipped !== 'no-vapid-key') {
      console.log(`✅ Server pushed "${message.title}" to ${res.json.sent}/${res.json.targeted} device(s)${res.json.skipped ? ` (${res.json.skipped})` : ''}.`)
      return
    }
    const local = await sendLocally(message)
    console.log(`✅ Pushed "${message.title}" locally to ${local.sent}/${local.targeted} device(s).`)
    return
  }

  let res
  try {
    res = await post('/api/finance/push/daily')
  } catch (err) {
    res = { ok: false, status: 0, json: { error: err.message } }
  }
  // 'ledger-missing': the server can't dedupe, so a local send would break the
  // once-per-day guarantee — skip it and say how to fix it instead.
  if (res.ok && res.json.skipped === 'ledger-missing') {
    console.warn('⚠️  Daily push skipped: the run ledger is missing, so the send cannot be deduped. Apply supabase-2026-10-automation-runs.sql.')
    await logRun('warning', 'ledger-missing: daily push not sent', { via: 'none' })
    return
  }
  // 'no-audience' (no VAPID key in Vercel / nobody subscribed) means nothing was delivered.
  if (res.ok && res.json.skipped !== 'no-audience') {
    console.log(`✅ Daily push: ${res.json.skipped ? res.json.skipped : `${res.json.sent} device(s)`} — "${res.json.message?.title}"`)
    return
  }
  // The server built the message but did not send it: try the home machine's key.
  const message = res.json?.message || OFFLINE_MESSAGE
  if (!res.ok) console.error(`server daily push failed (HTTP ${res.status}): ${res.json?.error || 'unknown'} — sending a generic message locally`)
  const local = await sendLocally(message)
  await logRun(local.sent > 0 ? 'ok' : 'warning', local.sent > 0 ? null : 'no devices reached', { via: 'local', ...local, message })
  console.log(`✅ Pushed "${message.title}" locally to ${local.sent}/${local.targeted} device(s).`)
}

main().catch(async err => {
  console.error('❌', err.message)
  await logRun('error', err.message)
  process.exit(1)
})
