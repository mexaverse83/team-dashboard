import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { buildInsightsPrompt, normalizeInsights, parseInsightsResponse } from '@/lib/insights-prompt.mjs'
import { monthKey } from '@/lib/finance-utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

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
}

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const authKey = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  const refresh = req.nextUrl.searchParams.get('refresh') === 'true'

  // Always check cache first — return today's cached insights if they exist
  const { data: cached } = await supabase
    .from('finance_insights_cache')
    .select('*')
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  const cacheAge = cached ? Date.now() - new Date(cached.generated_at).getTime() : Infinity
  const cacheValid = cacheAge < 24 * 60 * 60 * 1000 // 24h

  // Serve cache unless explicit refresh requested
  if (cached && cacheValid && !refresh) {
    // no-store: a stale brief once outlived a server-side purge by an hour in
    // the browser's HTTP cache — this endpoint is one cheap Supabase read.
    return NextResponse.json({ insights: cached.insights_json, cached: true, generated_at: cached.generated_at }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // If no refresh requested and cache is stale/missing, return empty — don't auto-generate
  if (!refresh) {
    if (cached) {
      // Serve stale cache with a flag so the UI can show "stale" indicator
      return NextResponse.json({ insights: cached.insights_json, cached: true, stale: true, generated_at: cached.generated_at })
    }
    return NextResponse.json({ insights: [], cached: false, empty: true, generated_at: null })
  }

  // Only reaches here if refresh=true — explicit generation request
  // Fetch finance summary internally
  const baseUrl = req.nextUrl.origin
  const summaryRes = await fetch(`${baseUrl}/api/finance/summary?months=3`, {
    headers: { 'x-api-key': authKey || process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
  })

  if (!summaryRes.ok) {
    const errBody = await summaryRes.text().catch(() => '')
    return NextResponse.json({ error: `Failed to fetch finance data (${summaryRes.status}): ${errBody.slice(0, 200)}` }, { status: 500 })
  }

  const data = await summaryRes.json()

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

  // WEST readiness is enrichment — generation proceeds without it on failure
  const west = await fetch(`${baseUrl}/api/finance/investments/west-projection`, {
    headers: { 'x-api-key': authKey },
  }).then(r => (r.ok ? r.json() : null)).catch(() => null)

  const prompt = buildInsightsPrompt(data, west)


  try {
    const result = await generateWithAI(prompt)
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    const text = result.text

    const insights: Insight[] = normalizeInsights(parseInsightsResponse(text))

    // Cache results — live table schema is (id, insights_json, generated_at,
    // period_month NOT NULL, expires_at NOT NULL). Log but don't fail.
    const now = new Date()
    const { error: cacheErr } = await supabase.from('finance_insights_cache').insert({
      insights_json: insights,
      generated_at: now.toISOString(),
      period_month: `${monthKey(now)}-01`,
      expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    })
    if (cacheErr) console.error('Insights cache insert failed:', cacheErr.message)

    return NextResponse.json({ insights, cached: false, generated_at: new Date().toISOString() })
  } catch (err) {
    console.error('Insights generation error:', err)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
