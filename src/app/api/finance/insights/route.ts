import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-6'

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

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  // Debug mode: ?debug=true sends a minimal prompt to verify API key + model
  if (req.nextUrl.searchParams.get('debug') === 'true') {
    const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }
    const body = JSON.stringify({ model: 'claude-opus-4-6', max_tokens: 1024, messages: [{ role: 'user', content: 'Say hello in one word' }] })
    // Test 1: plain
    const r1 = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: baseHeaders, body })
    const t1 = await r1.text()
    // Test 2: with anthropic-beta
    const r2 = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { ...baseHeaders, 'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15,output-128k-2025-02-19' }, body })
    const t2 = await r2.text()
    // Test 3: with token-counting beta
    const r3 = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { ...baseHeaders, 'anthropic-beta': 'token-counting-2024-11-01' }, body })
    const t3 = await r3.text()
    return NextResponse.json({ results: [
      { test: 'plain', status: r1.status, body: t1.slice(0, 300) },
      { test: 'beta-output128k', status: r2.status, body: t2.slice(0, 300) },
      { test: 'beta-token-counting', status: r3.status, body: t3.slice(0, 300) },
    ] })
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

  const cryptoSection = data.crypto ? `
CRYPTO PORTFOLIO:
- Total Value: $${Number(data.crypto.total_value_mxn).toLocaleString()} MXN ($${Number(data.crypto.total_value_usd).toLocaleString()} USD)
- Cost Basis: $${Number(data.crypto.total_cost_mxn).toLocaleString()} MXN
- P&L: ${data.crypto.pnl_mxn >= 0 ? '+' : ''}$${Number(data.crypto.pnl_mxn).toLocaleString()} MXN (${data.crypto.pnl_pct}%)
- Holdings: ${(data.crypto.holdings as Record<string, unknown>[]).map((h: Record<string, unknown>) => `${h.symbol}: ${h.qty} (${h.allocation_pct}% of crypto)`).join(', ')}
${data.crypto.risks?.concentration ? `- ⚠️ CONCENTRATION RISK: ${data.crypto.risks.concentration.symbol} is ${data.crypto.risks.concentration.pct}% of crypto portfolio` : ''}
${data.crypto.risks?.large_loss ? `- ⚠️ LARGE UNREALIZED LOSS: ${data.crypto.risks.large_loss.pnl_pct}% unrealized loss` : ''}
- Crypto as % of total finances: consider vs monthly income of $${Number(data.income?.total_monthly).toLocaleString()}/mo` : ''

  const goalSection = data.goal_funding ? `
GOAL FUNDING GAP:
- Goals need: $${Number(data.goal_funding.total_monthly_needed).toLocaleString()}/mo
- Discretionary available: $${Number(data.goal_funding.discretionary_available).toLocaleString()}/mo
- Gap: ${data.goal_funding.fully_funded ? 'FULLY FUNDED ✅' : `$${Number(data.goal_funding.gap).toLocaleString()}/mo SHORT`}` : ''

  const prompt = `You are WOLFF, a sharp personal finance analyst for a Mexican household. You analyze daily spending, cash flow, goals, debt, subscriptions, investments, crypto, and long-term financial risk. Analyze this financial data and generate actionable insights.

FULL FINANCIAL DATA:
${JSON.stringify(data, null, 2)}
${bvaSection}
${msiSection}
${goalSection}
${cryptoSection}

CONTEXT:
- Currency is MXN (Mexican Pesos)
- MSI = Meses Sin Intereses (interest-free installments, very common in Mexico)
- Owner has savings goals and emergency fund targets
- Be specific with numbers, dates, and actionable steps
- Reference actual category names, merchants, and amounts from the data
- Use only the live data provided above. Do not invent net worth, WEST, tax, retirement, property, or investment facts that are not present in the data.
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
- If crypto data exists: analyze portfolio performance, concentration risk, crypto as % of total assets
- Flag if any single coin is >80% of crypto portfolio (concentration risk)
- Flag if unrealized crypto loss exceeds 20% — suggest DCA or holding strategy
- Consider crypto value in overall financial health assessment
- If long-term investment, net worth, real-estate, retirement, or tax data is missing, do not fabricate it. Prefer a recommendation to connect or refresh that data.

CRITICAL — Bimonthly/non-monthly billing categories:
- Categories marked [bimonthly billing] or [quarterly billing] etc are KNOWN recurring charges
- Do NOT make them TODAY'S PRIORITY unless >200% of their cycle-adjusted budget
- Do NOT generate ACTIVE ALERTS for them unless >150% of cycle-adjusted budget
- When mentioning them, always note "This is a bimonthly charge — no action needed unless the amount is unusual"
- DEPRIORITIZE them vs monthly categories that the user can actually control (dining, groceries, transport, entertainment)
- Focus TODAY'S PRIORITY and top alerts on controllable monthly spending, not fixed billing events
- A bimonthly charge at 130-140% of cycle budget is normal variance, not an emergency

Return ONLY valid JSON array, no markdown, no explanation.`

  try {
    const anthropicRes = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
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
      }
    )

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      console.error('Anthropic API error:', anthropicRes.status, err)
      return NextResponse.json({ error: `AI analysis failed (${anthropicRes.status}): ${err.slice(0, 500)}` }, { status: 500 })
    }

    const anthropicData = await anthropicRes.json()
    const text = anthropicData.content?.[0]?.text || '[]'

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
