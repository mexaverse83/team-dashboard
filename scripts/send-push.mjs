#!/usr/bin/env node
// Sends the daily brief as a web push to every subscribed device.
//
// Usage: npm run push:send                      (daily brief from live data)
//        node scripts/send-push.mjs "Title" "Body text"   (custom message)
//
// Requires in .env.local: VAPID_PRIVATE_KEY, FINANCE_API_KEY, Supabase URL +
// anon key. The VAPID public key lives in src/lib/push-config.ts.

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
const { NEXT_PUBLIC_SUPABASE_URL: URL_, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON, VAPID_PRIVATE_KEY, FINANCE_API_KEY } = env
if (!VAPID_PRIVATE_KEY) { console.error('VAPID_PRIVATE_KEY missing from .env.local'); process.exit(1) }

const pushConfig = readFileSync(join(repoRoot, 'src/lib/push-config.ts'), 'utf8')
const VAPID_PUBLIC_KEY = pushConfig.match(/VAPID_PUBLIC_KEY = '([^']+)'/)[1]
webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:bernardo.garza@nexaminds.ai', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

async function buildDailyMessage() {
  const headers = { 'x-api-key': FINANCE_API_KEY }
  const [widget, insights] = await Promise.all([
    fetch('https://finance.autonomis.co/api/finance/widget', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('https://finance.autonomis.co/api/finance/insights', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
  ])
  const lines = []
  if (widget) {
    lines.push(widget.over_committed_by > 0
      ? `Safe today: $0 (over by $${widget.over_committed_by.toLocaleString()})`
      : `Safe today: $${widget.safe_to_spend_day.toLocaleString()}/day · Week: $${widget.week_envelope.toLocaleString()}`)
  }
  const top = (insights?.insights || []).find(i => i.priority === 'high')
  if (top) lines.push(`${top.icon} ${top.title}`)
  return { title: '🐺 Wolff Daily Brief', body: lines.join('\n') || 'Open the dashboard for today\'s numbers.', url: '/finance' }
}

async function main() {
  const [, , argTitle, argBody, argUrl] = process.argv
  const message = argTitle
    ? { title: argTitle, body: argBody || '', url: argUrl || '/finance' }
    : await buildDailyMessage()

  const res = await fetch(`${URL_}/rest/v1/finance_push_subscriptions?select=endpoint,subscription`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  })
  if (!res.ok) { console.error(`subscriptions fetch failed (${res.status}) — did the table get created?`); process.exit(1) }
  const subs = await res.json()
  if (!subs.length) { console.log('No subscribed devices yet.'); return }

  let sent = 0
  for (const row of subs) {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(message))
      sent++
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        // Subscription expired/revoked — clean it up
        await fetch(`${URL_}/rest/v1/finance_push_subscriptions?endpoint=eq.${encodeURIComponent(row.endpoint)}`, {
          method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
        }).catch(() => {})
        console.log('pruned expired subscription')
      } else {
        console.error('push failed:', err.statusCode || err.message)
      }
    }
  }
  console.log(`✅ Pushed "${message.title}" to ${sent}/${subs.length} device(s).`)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
