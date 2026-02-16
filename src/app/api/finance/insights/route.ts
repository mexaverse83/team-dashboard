import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

interface Insight {
  type: 'alert' | 'recommendation' | 'win' | 'forecast' | 'pattern' | 'saving'
  icon: string
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
  category?: string
}

export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || key !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const refresh = req.nextUrl.searchParams.get('refresh') === 'true'

  // Check cache (valid for 24h)
  if (!refresh) {
    const { data: cached } = await supabase
      .from('finance_insights_cache')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (cached && new Date(cached.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000) {
      return NextResponse.json({ insights: cached.insights_json, cached: true, generated_at: cached.created_at })
    }
  }

  // Fetch finance summary internally
  const baseUrl = req.nextUrl.origin
  const summaryRes = await fetch(`${baseUrl}/api/finance/summary?months=3`, {
    headers: { 'x-api-key': key },
  })

  if (!summaryRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch finance data' }, { status: 500 })
  }

  const data = await summaryRes.json()

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  // Build prompt
  const prompt = `You are WOLFF, a personal finance analyst for a Mexican professional. Analyze this financial data and generate actionable insights.

FINANCIAL DATA:
${JSON.stringify(data, null, 2)}

CONTEXT:
- Currency is MXN (Mexican Pesos)
- MSI = Meses Sin Intereses (interest-free installments, very common in Mexico)
- Owner has savings goals and emergency fund targets
- Be specific with numbers, dates, and actionable steps
- Reference actual category names, merchants, and amounts from the data

Generate a JSON array of insights. Each insight must have:
- type: "alert" | "recommendation" | "win" | "forecast" | "pattern" | "saving"
- icon: emoji that fits the insight
- title: short headline (max 80 chars)
- detail: 1-2 sentence explanation with specific numbers
- priority: "high" | "medium" | "low"
- category: optional finance category name

Rules:
- Generate 8-15 insights
- At least 1 of each type (alert, recommendation, win, forecast)
- Prioritize actionable advice over observations
- Celebrate wins — motivation matters
- Flag anomalies and upcoming cash flow changes
- Reference MSI payoff dates and freed-up cash
- Compare current month vs average

Return ONLY valid JSON array, no markdown, no explanation.`

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      console.error('Claude API error:', err)
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 500 })
    }

    const claudeData = await claudeRes.json()
    const text = claudeData.content?.[0]?.text || '[]'

    let insights: Insight[]
    try {
      insights = JSON.parse(text)
    } catch {
      // Try extracting JSON from potential markdown wrapper
      const match = text.match(/\[[\s\S]*\]/)
      insights = match ? JSON.parse(match[0]) : []
    }

    // Cache results
    await supabase.from('finance_insights_cache').insert({
      insights_json: insights,
      data_snapshot: data,
    })

    return NextResponse.json({ insights, cached: false, generated_at: new Date().toISOString() })
  } catch (err) {
    console.error('Insights generation error:', err)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
