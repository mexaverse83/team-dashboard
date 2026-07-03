#!/usr/bin/env node
// Generates AI insights via Codex CLI (ChatGPT-subscription auth — no API key)
// and writes them to the finance_insights_cache table that the dashboard reads.
//
// Usage: npm run insights:codex
//        node scripts/generate-insights-codex.mjs [--base-url http://localhost:3000]
//
// Requires: `codex login` done (ChatGPT sign-in), .env.local with Supabase URL
// + anon key, and NEXT_PUBLIC_AUTH_BYPASS=1 so the local summary API is open.
// If no dev server is running at the base URL, one is started and stopped.

import { spawn, spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildInsightsPrompt, parseInsightsResponse } from '../src/lib/insights-prompt.mjs'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  const env = {}
  const raw = readFileSync(join(repoRoot, '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2]
  }
  return env
}

const env = loadEnvLocal()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

// Prefer the production summary: it runs with the service role and sees
// RLS-hidden tables (finance_recurring_income holds the salaries!). The local
// dev server only has the anon key, which understates income by ~$195k/mo and
// makes every cash-flow insight a false alarm. Requires FINANCE_API_KEY (or
// SUPABASE_SERVICE_ROLE_KEY) in .env.local; falls back to localhost otherwise.
const PROD_URL = env.INSIGHTS_SUMMARY_URL || 'https://finance.autonomis.co'
const API_KEY = env.FINANCE_API_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''

const baseUrlArg = process.argv.indexOf('--base-url')
const BASE_URL = baseUrlArg > -1 ? process.argv[baseUrlArg + 1] : 'http://localhost:3000'
const useProd = Boolean(API_KEY) && baseUrlArg === -1

async function fetchSummary() {
  const url = `${useProd ? PROD_URL : BASE_URL}/api/finance/summary?months=3`
  const res = await fetch(url, useProd ? { headers: { 'x-api-key': API_KEY } } : undefined)
  if (!res.ok) throw new Error(`summary ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

// WEST readiness data is enrichment — generation proceeds without it.
async function fetchWestProjection() {
  try {
    const url = `${useProd ? PROD_URL : BASE_URL}/api/finance/investments/west-projection`
    const res = await fetch(url, useProd ? { headers: { 'x-api-key': API_KEY } } : undefined)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function serverIsUp() {
  try {
    const res = await fetch(`${BASE_URL}/api/finance/summary?months=3`, { method: 'HEAD' })
    return res.status < 500
  } catch {
    return false
  }
}

async function main() {
  // 1. Ensure a local server is available for the summary API
  let devServer = null
  if (useProd) {
    console.log(`Using production summary at ${PROD_URL} (service-role numbers).`)
  } else if (!(await serverIsUp())) {
    console.log(`No server at ${BASE_URL} — starting npm run dev ...`)
    devServer = spawn('npm', ['run', 'dev'], { cwd: repoRoot, detached: true, stdio: 'ignore' })
    const deadline = Date.now() + 120_000
    while (!(await serverIsUp())) {
      if (Date.now() > deadline) throw new Error('dev server did not become ready within 120s')
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  try {
    // 2. Fetch summary and build the WOLFF prompt
    console.log('Fetching finance summary ...')
    const data = await fetchSummary()
    const west = await fetchWestProjection()
    console.log(west ? 'WEST projection included.' : 'WEST projection unavailable — continuing without it.')
    const prompt = buildInsightsPrompt(data, west)
    console.log(`Prompt built (${prompt.length.toLocaleString()} chars). Running codex exec ...`)

    // 3. Run through Codex CLI — billed to the ChatGPT subscription
    const workDir = mkdtempSync(join(tmpdir(), 'wolff-insights-'))
    const outFile = join(workDir, 'last-message.txt')
    const instructions =
      'You are generating data for an API, not chatting. Do not run commands or read files. ' +
      'Respond with ONLY the JSON array requested below — no markdown fences, no commentary.\n\n' + prompt
    const result = spawnSync(
      'codex',
      ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '-C', workDir, '-o', outFile, '-'],
      { input: instructions, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    if (result.status !== 0) {
      throw new Error(`codex exec failed (exit ${result.status}): ${(result.stderr || result.stdout || '').slice(-800)}`)
    }

    const text = readFileSync(outFile, 'utf8')
    rmSync(workDir, { recursive: true, force: true })
    // Keep the raw response around until the cache insert succeeds, so a
    // failed insert never wastes a generation.
    const rawBackup = join(tmpdir(), 'wolff-insights-raw.txt')
    writeFileSync(rawBackup, text)
    const insights = parseInsightsResponse(text)
    const valid = insights.filter((i) => i && i.title && i.detail && i.type)
    if (valid.length < 5) {
      throw new Error(`Only ${valid.length} valid insights parsed — raw response saved to ${rawBackup}`)
    }
    console.log(`Parsed ${valid.length} insights.`)

    // 4. Write to the cache table the dashboard serves from. Live schema:
    // (id, insights_json, generated_at, period_month NOT NULL, expires_at NOT NULL)
    const now = new Date()
    const res = await fetch(`${SUPABASE_URL}/rest/v1/finance_insights_cache`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        insights_json: valid,
        generated_at: now.toISOString(),
        period_month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    })
    if (!res.ok) throw new Error(`cache insert failed (${res.status}): ${(await res.text()).slice(0, 300)} — raw response saved to ${rawBackup}`)
    rmSync(rawBackup, { force: true })
    console.log('✅ Insights cached — the dashboard will serve them for the next 24h.')
  } finally {
    if (devServer?.pid) {
      try { process.kill(-devServer.pid) } catch { /* already gone */ }
    }
  }
}

main().catch((err) => {
  console.error('❌', err.message)
  process.exit(1)
})
