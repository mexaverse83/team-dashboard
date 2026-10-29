import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { buildInsightsPrompt, normalizeInsights, parseInsightsResponse } from '@/lib/insights-prompt.mjs'
import { CONTROLLABLE } from '@/lib/controllable-categories'
import { mexicoCityMonthKey } from '@/lib/dates'
import { deterministicBriefToInsights } from '@/lib/deterministic-brief'
import { isInsightUsable, partitionInsights } from '@/lib/insight-freshness'
import { buildSummary } from '@/lib/server/summary'
import { getWestProjection } from '@/lib/server/west'
import { configErrorResponse, getAdminClient, withDegradedHeader } from '@/lib/supabase-admin'
import { financeLocale, latestCachedBrief, loadLiveBrief, type CachedBriefRow } from '@/lib/automation/live-brief'
import { recordRun, triggerFromAuth } from '@/lib/automation/runs'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o'

// OpenAI takes priority when configured; Anthropic remains the fallback.
async function generateWithAI(prompt: string): Promise<{ text: string } | { error: string; status: number }> {
  if (OPENAI_API_KEY) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        max_completion_tokens: 16000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('OpenAI API error:', res.status, err)
      return { error: `AI analysis failed (OpenAI ${res.status}): ${err.slice(0, 500)}`, status: 500 }
    }
    const data = await res.json()
    return { text: data.choices?.[0]?.message?.content || '[]' }
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Anthropic API error:', res.status, err)
    return { error: `AI analysis failed (Anthropic ${res.status}): ${err.slice(0, 500)}`, status: 500 }
  }
  const data = await res.json()
  return { text: data.content?.[0]?.text || '[]' }
}

interface Insight {
  type: 'alert' | 'recommendation' | 'win' | 'forecast' | 'pattern' | 'saving'
  icon: string
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  category?: string
  source?: 'llm' | 'live'
}

const NO_STORE = { 'Cache-Control': 'no-store' }

function admin(): SupabaseClient | Response {
  try {
    return getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
}

async function cacheInsights(supabase: SupabaseClient, insights: Insight[], generatedAt: Date) {
  // Live schema: (id, insights_json, generated_at, period_month NOT NULL, expires_at NOT NULL)
  return supabase.from('finance_insights_cache').insert({
    insights_json: insights,
    generated_at: generatedAt.toISOString(),
    period_month: `${mexicoCityMonthKey(generatedAt)}-01`,
    expires_at: new Date(generatedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  })
}

/**
 * GET /api/finance/insights
 *
 * Contract (AUTO-01, F01): `insights` is always safe to show as current.
 * - The LLM brief is served (`source:'llm'`) only while it is from today's
 *   Mexico City day and month (insight-freshness).
 * - Otherwise `insights` is the deterministic live plan (`source:'live'`),
 *   plus any LLM items that are not day-scoped and still under 72h, and the
 *   expired LLM items move to `archived` (the Insights page's "Show last brief").
 * `?refresh=true` generates a new LLM brief in-process (needs an AI key).
 */
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const supabase = admin()
  if (supabase instanceof Response) return supabase

  if (req.nextUrl.searchParams.get('refresh') === 'true') return refreshBrief(req, supabase, triggerFromAuth(auth.method, req))

  const now = new Date()
  let cached: CachedBriefRow | null = null
  try {
    cached = await latestCachedBrief(supabase)
  } catch (err) {
    console.error('Insights cache read failed:', (err as Error).message)
  }
  const cachedItems = (Array.isArray(cached?.insights_json) ? cached!.insights_json : []) as Insight[]
  const llmGeneratedAt = cached?.generated_at ?? null

  if (cached && cachedItems.length && isInsightUsable(llmGeneratedAt, { now, category: 'WIDGET', periodMonth: cached.period_month })) {
    return withDegradedHeader(NextResponse.json({
      insights: cachedItems.map(i => ({ ...i, source: 'llm' })),
      archived: [],
      cached: true,
      stale: false,
      expired: false,
      source: 'llm',
      generated_at: llmGeneratedAt,
      llm_generated_at: llmGeneratedAt,
    }, { headers: NO_STORE }))
  }

  const { usable, archived } = partitionInsights(cachedItems, llmGeneratedAt, { now, periodMonth: cached?.period_month })
  try {
    const { brief } = await loadLiveBrief(supabase, now)
    return withDegradedHeader(NextResponse.json({
      insights: [...deterministicBriefToInsights(brief), ...usable.map(i => ({ ...i, source: 'llm' as const }))],
      archived,
      brief,
      cached: false,
      stale: false,
      expired: cachedItems.length > 0,
      empty: cachedItems.length === 0,
      source: 'live',
      generated_at: brief.generated_at,
      llm_generated_at: llmGeneratedAt,
    }, { headers: NO_STORE }))
  } catch (err) {
    // No live numbers either: never fall back to the expired text as current.
    console.error('Live brief failed:', (err as Error).message)
    return NextResponse.json({
      insights: usable.map(i => ({ ...i, source: 'llm' as const })),
      archived,
      cached: false,
      stale: false,
      expired: cachedItems.length > 0,
      empty: usable.length === 0,
      source: 'live',
      generated_at: null,
      llm_generated_at: llmGeneratedAt,
      live_error: 'Live plan temporarily unavailable',
    }, { headers: NO_STORE })
  }
}

async function refreshBrief(req: NextRequest, supabase: SupabaseClient, trigger: string) {
  const startedAt = new Date()
  if (!OPENAI_API_KEY && !ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'No AI API key configured on the server. Insights are generated via Codex instead — run `npm run insights:codex` on the home machine, or set OPENAI_API_KEY / ANTHROPIC_API_KEY in Vercel to enable this button.' }, { status: 500 })
  }

  // Debug mode: ?debug=true sends a minimal prompt to verify API key + model
  if (req.nextUrl.searchParams.get('debug') === 'true') {
    const result = await generateWithAI('Say hello in one word')
    const provider = OPENAI_API_KEY ? `openai:${OPENAI_MODEL}` : `anthropic:${ANTHROPIC_MODEL}`
    if ('error' in result) return NextResponse.json({ provider, ok: false, error: result.error })
    return NextResponse.json({ provider, ok: true, response: result.text.slice(0, 300) })
  }

  const fail = async (error: string, status: number) => {
    await recordRun(supabase, { job: 'insights', trigger, started_at: startedAt, status: 'error', error })
    return NextResponse.json({ error }, { status })
  }

  let data: Awaited<ReturnType<typeof buildSummary>>
  try {
    data = await buildSummary(supabase, { months: 3, now: startedAt })
  } catch (err) {
    return fail(`Failed to build finance data: ${(err as Error).message}`, 503)
  }
  // WEST readiness is enrichment — generation proceeds without it on failure
  const west = await getWestProjection(supabase, { now: startedAt }).catch(() => null)
  const prompt = buildInsightsPrompt(data, west, { controllable: CONTROLLABLE, lang: financeLocale() })

  try {
    const result = await generateWithAI(prompt)
    if ('error' in result) return fail(result.error, result.status)
    const insights: Insight[] = normalizeInsights(parseInsightsResponse(result.text))
    const generatedAt = new Date()
    const { error: cacheErr } = await cacheInsights(supabase, insights, generatedAt)
    if (cacheErr) console.error('Insights cache insert failed:', cacheErr.message)
    await recordRun(supabase, { job: 'insights', trigger, started_at: startedAt, status: cacheErr ? 'warning' : 'ok', created_count: insights.length, error: cacheErr?.message ?? null, details: { provider: OPENAI_API_KEY ? 'openai' : 'anthropic' } })
    return NextResponse.json({
      insights: insights.map(i => ({ ...i, source: 'llm' })),
      archived: [],
      cached: false,
      stale: false,
      expired: false,
      source: 'llm',
      generated_at: generatedAt.toISOString(),
      llm_generated_at: generatedAt.toISOString(),
    }, { headers: NO_STORE })
  } catch (err) {
    console.error('Insights generation error:', err)
    return fail('Failed to generate insights', 500)
  }
}

/**
 * POST /api/finance/insights — store a brief generated elsewhere (the home
 * PC's Codex script), so scripts never write the cache with the anon key.
 * API key only. Body: { insights: Insight[] }.
 */
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  if (auth.method !== 'api-key') return NextResponse.json({ error: 'API key required' }, { status: 403 })
  const supabase = admin()
  if (supabase instanceof Response) return supabase

  let body: { insights?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const insights: Insight[] = normalizeInsights(body.insights)
  if (insights.length === 0) return NextResponse.json({ error: 'no valid insights' }, { status: 400 })

  const startedAt = new Date()
  const trigger = req.headers.get('x-automation-trigger') || 'codex'
  const { error } = await cacheInsights(supabase, insights, startedAt)
  await recordRun(supabase, { job: 'insights', trigger, started_at: startedAt, status: error ? 'error' : 'ok', created_count: insights.length, error: error?.message ?? null })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: insights.length, generated_at: startedAt.toISOString() }, { headers: NO_STORE })
}
