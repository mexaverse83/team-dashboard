import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

interface Insight {
  type: 'alert' | 'recommendation' | 'win' | 'forecast' | 'pattern' | 'saving'
  icon: string
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  category?: string
}

export async function GET(req: NextRequest) {
  // Auth: API key for external calls, allow same-origin browser requests
  const key = req.headers.get('x-api-key')
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes(req.nextUrl.host)
  if (!isSameOrigin && (!key || key !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const authKey = key || expected || ''

  const refresh = req.nextUrl.searchParams.get('refresh') === 'true'

  // Always check cache first — return today's cached insights if they exist
  const { data: cached } = await supabase
    .from('finance_insights_cache')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const cacheAge = cached ? Date.now() - new Date(cached.created_at).getTime() : Infinity
  const cacheValid = cacheAge < 24 * 60 * 60 * 1000 // 24h

  // Serve cache unless explicit refresh requested
  if (cached && cacheValid && !refresh) {
    return NextResponse.json({ insights: cached.insights_json, cached: true, generated_at: cached.created_at })
  }

  // If no refresh requested and cache is stale/missing, return empty — don't auto-generate
  if (!refresh) {
    if (cached) {
      // Serve stale cache with a flag so the UI can show "stale" indicator
      return NextResponse.json({ insights: cached.insights_json, cached: true, stale: true, generated_at: cached.created_at })
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

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  // Build prompt with rich budget vs actual context
  const bva = data.current_month?.budget_vs_actual || []
  const bvaSection = bva.length > 0 ? `
BUDGET VS ACTUAL (Current Month - Day ${data.current_month?.day_of_month}/${data.current_month?.days_in_month}, ${data.current_month?.month_progress_pct}% through month):
${bva.map((b: Record<string, unknown>) =>
  `- ${b.category}${b.is_non_monthly ? ` [${b.billing_cycle} billing — amount is amortized monthly]` : ''}: Spent $${Number(b.spent).toLocaleString()} / Budget $${Number(b.budget).toLocaleString()} (${b.pct_used}% used)${b.is_non_monthly ? ' (amortized)' : ` | Daily pace: $${Number(b.daily_pace).toLocaleString()}/day vs budget $${Number(b.budget_daily_pace).toLocaleString()}/day (${Number(b.pace_vs_budget_pct) > 0 ? '+' : ''}${b.pace_vs_budget_pct}%) | Projected: $${Number(b.projected_month_total).toLocaleString()}`} | Status: ${b.status === 'ok' ? '✅' : b.status === 'warning' ? '⚠️' : '🔴'}`
).join('\n')}` : ''

  const msiSection = (data.msi_timeline || []).length > 0 ? `
MSI PAYOFF TIMELINE:
${(data.msi_timeline as Record<string, unknown>[]).map((m) =>
  `- ${m.name} (${m.merchant}): $${Number(m.monthly_payment).toLocaleString()}/mo × ${m.payments_remaining} remaining → ends ${m.end_date} → frees $${Number(m.monthly_payment).toLocaleString()}/mo`
).join('\n')}` : ''

  const goalSection = data.goal_funding ? `
GOAL FUNDING GAP:
- Goals need: $${Number(data.goal_funding.total_monthly_needed).toLocaleString()}/mo
- Discretionary available: $${Number(data.goal_funding.discretionary_available).toLocaleString()}/mo
- Gap: ${data.goal_funding.fully_funded ? 'FULLY FUNDED ✅' : `$${Number(data.goal_funding.gap).toLocaleString()}/mo SHORT`}` : ''

  const prompt = `You are WOLFF, a sharp personal finance analyst for a Mexican professional. Analyze this financial data and generate actionable insights.

FULL FINANCIAL DATA:
${JSON.stringify(data, null, 2)}
${bvaSection}
${msiSection}
${goalSection}

CONTEXT:
- Currency is MXN (Mexican Pesos)
- MSI = Meses Sin Intereses (interest-free installments, very common in Mexico)
- Owner has savings goals and emergency fund targets
- Be specific with numbers, dates, and actionable steps
- Reference actual category names, merchants, and amounts from the data
- Flag anomalies (e.g. electricity at 271% could be bimonthly billing — explain it)
- For each category significantly over pace, explain WHY based on transaction patterns
- Calculate month-to-date pace: are they on track to stay under budget based on days remaining?

Generate a JSON array of insights. Each insight must have:
- type: "alert" | "recommendation" | "win" | "forecast" | "pattern" | "saving"
- icon: emoji that fits the insight
- title: short headline (max 80 chars)
- detail: 2-3 sentence explanation with specific numbers and daily pace analysis
- priority: "high" | "medium" | "low"
- category: optional finance category name
- savings_amount: optional number — estimated MXN savings if recommendation is followed
- effort: optional "easy" | "medium" | "hard" — how hard is this to implement

Rules:
- Generate 10-18 insights
- At least 2 alerts, 3 recommendations, 1 win, 2 forecasts
- Prioritize actionable advice over observations
- Celebrate wins — motivation matters
- Flag anomalies and explain likely causes
- Reference MSI payoff dates and freed-up cash amounts
- Analyze goal funding gap — can goals be met with current discretionary income?
- Compare daily spending pace vs budget pace for categories over 80%
- If a category is way over budget, suggest specific cuts or explain if it's a billing anomaly

Return ONLY valid JSON array, no markdown, no explanation.`

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('Gemini API error:', err)
      return NextResponse.json({ error: `AI analysis failed: ${err.slice(0, 200)}` }, { status: 500 })
    }

    const geminiData = await geminiRes.json()
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '[]'

    let insights: Insight[]
    try {
      insights = JSON.parse(text)
    } catch {
      // Try extracting JSON from potential markdown wrapper
      const match = text.match(/\[[\s\S]*\]/)
      insights = match ? JSON.parse(match[0]) : []
    }

    // Cache results (table may not exist yet — log but don't fail)
    const { error: cacheErr } = await supabase.from('finance_insights_cache').insert({
      insights_json: insights,
      data_snapshot: data,
    })
    if (cacheErr) console.error('Insights cache insert failed:', cacheErr.message)

    return NextResponse.json({ insights, cached: false, generated_at: new Date().toISOString() })
  } catch (err) {
    console.error('Insights generation error:', err)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
