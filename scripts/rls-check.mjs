#!/usr/bin/env node
// Verifies the anon key cannot read household data (CH-01, AUTO-14, NU-3).
// GET-only count queries with the public anon key — the same thing anyone
// who opens the JS bundle can do. Exits 1 if any table returns rows.
//
// Usage: npm run rls:check            (reads .env.local or the environment)
//        node scripts/rls-check.mjs --json
//
// Expected to FAIL until supabase-2026-10-rls-lockdown.sql is applied.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv() {
  const env = { ...process.env }
  const file = join(repoRoot, '.env.local')
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !env[m[1]]) env[m[1]] = m[2]
    }
  }
  return env
}

export const CHECKED_TABLES = [
  'finance_transactions', 'finance_categories', 'finance_budgets', 'finance_recurring',
  'finance_goals', 'finance_income_sources', 'finance_debts', 'finance_debt_payments',
  'finance_installments', 'finance_recurring_income', 'finance_rules',
  'finance_net_worth_snapshots', 'finance_portfolio_snapshots', 'finance_crypto_holdings',
  'crypto_transactions', 'finance_stock_holdings', 'finance_fixed_income',
  'finance_real_estate', 'finance_real_estate_targets', 'finance_retirement',
  'finance_emergency_fund', 'finance_insights_cache', 'finance_wolff_chat',
  'finance_audit_reports', 'finance_checklist_status', 'finance_monthly_savings',
  'finance_automation_runs', 'finance_automation_heartbeats', 'finance_push_subscriptions',
]

/** Reads Content-Range "0-0/839" → 839; "*\/0" → 0. */
export function countFromContentRange(header) {
  const total = String(header || '').split('/')[1]
  return total && total !== '*' ? Number(total) : null
}

async function checkTable(url, anon, table) {
  const res = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
    method: 'GET',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, Prefer: 'count=exact', Range: '0-0' },
  })
  if (res.status === 404) return { table, status: 'missing' }
  if (res.status === 401 || res.status === 403) return { table, status: 'blocked', http: res.status }
  if (!res.ok) return { table, status: 'error', http: res.status, detail: (await res.text()).slice(0, 160) }
  const rows = await res.json().catch(() => [])
  const count = countFromContentRange(res.headers.get('content-range')) ?? (Array.isArray(rows) ? rows.length : 0)
  return { table, status: count > 0 ? 'LEAK' : 'empty', rows: count }
}

async function main() {
  const env = loadEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
    process.exit(2)
  }
  const results = []
  for (const table of CHECKED_TABLES) results.push(await checkTable(url, anon, table))

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2))
  } else {
    for (const r of results) {
      const mark = r.status === 'LEAK' ? '✗' : r.status === 'error' ? '?' : '✓'
      console.log(`${mark} ${r.table.padEnd(32)} ${r.status}${r.rows != null ? ` (${r.rows} rows readable)` : ''}${r.http ? ` HTTP ${r.http}` : ''}`)
    }
  }
  const leaks = results.filter(r => r.status === 'LEAK')
  const errors = results.filter(r => r.status === 'error')
  if (leaks.length) console.error(`\n${leaks.length} table(s) readable with the public anon key: ${leaks.map(r => r.table).join(', ')}`)
  if (errors.length) console.error(`${errors.length} table(s) could not be checked.`)
  process.exit(leaks.length || errors.length ? 1 : 0)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(err => { console.error(err.message); process.exit(2) })
}
