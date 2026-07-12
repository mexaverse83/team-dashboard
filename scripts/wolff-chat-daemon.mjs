#!/usr/bin/env node
// Ask-Wolff answer daemon — runs on the home machine, billed to the ChatGPT
// subscription via Codex CLI. Polls finance_wolff_chat for pending questions,
// answers them with live financial context, and (if push is set up) notifies
// the phones when a reply lands.
//
// Usage: npm run wolff:daemon          (keeps running; Ctrl+C to stop)
//        node scripts/wolff-chat-daemon.mjs --once   (answer current queue and exit)

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const API_KEY = env.FINANCE_API_KEY || ''
const SB = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }

const ONCE = process.argv.includes('--once')
const POLL_MS = 4000

async function pendingQuestions() {
  const res = await fetch(`${URL_}/rest/v1/finance_wolff_chat?status=eq.pending&role=eq.user&order=created_at.asc&limit=5`, { headers: SB })
  if (!res.ok) throw new Error(`queue fetch ${res.status}`)
  return res.json()
}

async function recentHistory() {
  const res = await fetch(`${URL_}/rest/v1/finance_wolff_chat?order=created_at.desc&limit=12`, { headers: SB })
  if (!res.ok) return []
  const rows = await res.json()
  return rows.reverse()
}

let contextCache = { at: 0, text: '' }
async function financialContext() {
  if (Date.now() - contextCache.at < 5 * 60 * 1000) return contextCache.text
  const headers = { 'x-api-key': API_KEY }
  const [summary, widget, insights, west] = await Promise.all([
    fetch('https://finance.autonomis.co/api/finance/summary?months=3', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('https://finance.autonomis.co/api/finance/widget', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('https://finance.autonomis.co/api/finance/insights', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('https://finance.autonomis.co/api/finance/investments/west-projection', { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
  ])
  const parts = []
  if (summary) parts.push('HOUSEHOLD PLAN: ' + JSON.stringify({
    as_of: new Date().toISOString(),
    income: summary.income,
    cash_flow: summary.cash_flow,
    month_projection: summary.month_projection,
    current_month: summary.current_month,
    emergency_fund: summary.emergency_fund,
    goal_funding: summary.goal_funding,
    goals: summary.goals,
    fertility_plan: summary.fertility_plan,
    year_end_goal_plan: summary.year_end_goal_plan,
    installments: summary.installments,
    debts: summary.debts,
  }))
  if (widget) parts.push('TODAY: ' + JSON.stringify(widget))
  if (west) parts.push('WEST APARTMENT: ' + JSON.stringify({
    target: west.target, delivery: west.delivery_date, months_left: west.months_to_delivery,
    current: west.current_status, projected: west.projected_at_delivery,
    behavioral: west.behavioral, savings_plan: west.savings_plan,
  }))
  if (insights?.insights) parts.push('LATEST WOLFF BRIEF: ' + JSON.stringify(insights.insights.map(i => ({ t: i.title, d: i.detail, cat: i.category }))))
  contextCache = { at: Date.now(), text: parts.join('\n\n') }
  return contextCache.text
}

function askCodex(prompt) {
  const workDir = mkdtempSync(join(tmpdir(), 'wolff-chat-'))
  const outFile = join(workDir, 'answer.txt')
  const res = spawnSync('codex', [
    'exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only',
    '-c', 'model_reasoning_effort="medium"',
    '-C', workDir, '-o', outFile, '-',
  ], { input: prompt, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000 })
  let answer = ''
  try { answer = readFileSync(outFile, 'utf8').trim() } catch { /* no output */ }
  rmSync(workDir, { recursive: true, force: true })
  if (res.status !== 0 && !answer) throw new Error(`codex exit ${res.status}`)
  return answer
}

async function answer(question) {
  const [ctx, history] = await Promise.all([financialContext(), recentHistory()])
  const historyText = history
    .filter(m => m.id !== question.id)
    .slice(-8)
    .map(m => (m.role === 'user' ? 'THEM: ' : 'YOU: ') + m.content.slice(0, 400))
    .join('\n')

  const prompt = `You are WOLFF, the calm, exact, warm financial decision coach for Bernardo & Laura's household (Mexico, MXN). You know their live plan below. You are texting with them; help them make one good decision, not read another report.

Decision order: near-term liquidity and treatment payments; this month's WEST/GBM target; protect the already-funded emergency reserve; combined 2026 goals; then discretionary spending and investments.

Rules:
- Answer in the language asked, in 2-5 concise sentences.
- Start with the verdict (yes/no/on track/behind), then the 1-3 numbers that prove it, then one concrete next action and its consequence.
- For "how much can I spend today?", TODAY.safe_to_spend_day is the limit for EXTRA or UNPLANNED spending. If it is $0, say $0; never substitute week_envelope.
- TODAY.week_envelope is only remaining PLANNED category spending from now through Sunday across groceries, dining, transport, and other controllable categories. It is not free cash. On Sunday it covers one day only.
- When useful, distinguish "$X extra spending" from "$Y already reserved inside category budgets". Never describe a weekly envelope as unclaimed money.
- Distinguish actual-to-date, projected month-end, sustainable baseline, and scenario data. Scheduled cash flow is not guaranteed savings.
- Use the deterministic month projection for this month's expected savings. Never substitute income minus spend-to-date.
- Do not recommend adding to an emergency fund already above target unless the question explicitly asks about it.
- Avoid generic encouragement, repeated caveats, markdown headers, and long lists.
- If the data is missing or stale, say exactly what is missing. Never invent a balance, return, transaction, or date.

LIVE FINANCIAL DATA:
${ctx}

RECENT CONVERSATION:
${historyText || '(none)'}

THEIR QUESTION: ${question.content}

Respond with ONLY your reply text — you are not an agent, do not run commands or read files.`

  const text = askCodex(prompt)
  if (!text) throw new Error('empty answer')

  await fetch(`${URL_}/rest/v1/finance_wolff_chat`, {
    method: 'POST', headers: SB,
    body: JSON.stringify({ role: 'wolff', content: text.slice(0, 4000), status: 'done', reply_to: question.id }),
  })
  await fetch(`${URL_}/rest/v1/finance_wolff_chat?id=eq.${question.id}`, {
    method: 'PATCH', headers: SB, body: JSON.stringify({ status: 'answered' }),
  })

  // Best effort: push-notify the phones that Wolff replied
  spawnSync('node', [join(repoRoot, 'scripts/send-push.mjs'), '🐺 Wolff replied', text.slice(0, 140), '/finance/ask'], { encoding: 'utf8', timeout: 30000 })
  return text
}

async function tick() {
  const questions = await pendingQuestions()
  for (const q of questions) {
    console.log(`[${new Date().toISOString()}] answering: ${q.content.slice(0, 80)}`)
    try {
      const t = await answer(q)
      console.log(`  → ${t.slice(0, 100)}`)
    } catch (err) {
      console.error('  ✗', err.message)
      await fetch(`${URL_}/rest/v1/finance_wolff_chat?id=eq.${q.id}`, {
        method: 'PATCH', headers: SB, body: JSON.stringify({ status: 'failed' }),
      }).catch(() => {})
    }
  }
  return questions.length
}

async function main() {
  console.log(`🐺 Wolff chat daemon ${ONCE ? '(single pass)' : `polling every ${POLL_MS / 1000}s`} — Ctrl+C to stop`)
  for (;;) {
    try {
      await tick()
    } catch (err) {
      console.error('tick failed:', err.message)
    }
    if (ONCE) break
    await new Promise(r => setTimeout(r, POLL_MS))
  }
}

main().catch(err => { console.error(err); process.exit(1) })
