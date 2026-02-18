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

  const cryptoSection = data.crypto ? `
CRYPTO PORTFOLIO:
- Total Value: $${Number(data.crypto.total_value_mxn).toLocaleString()} MXN ($${Number(data.crypto.total_value_usd).toLocaleString()} USD)
- Cost Basis: $${Number(data.crypto.total_cost_mxn).toLocaleString()} MXN
- P&L: ${data.crypto.pnl_mxn >= 0 ? '+' : ''}$${Number(data.crypto.pnl_mxn).toLocaleString()} MXN (${data.crypto.pnl_pct}%)
- Holdings: ${(data.crypto.holdings as Record<string, unknown>[]).map((h: Record<string, unknown>) => `${h.symbol}: ${h.qty} (${h.allocation_pct}% of crypto)`).join(', ')}
${data.crypto.risks?.concentration ? `- ⚠️ CONCENTRATION RISK: ${data.crypto.risks.concentration.symbol} is ${data.crypto.risks.concentration.pct}% of crypto portfolio` : ''}
${data.crypto.risks?.large_loss ? `- ⚠️ LARGE UNREALIZED LOSS: ${data.crypto.risks.large_loss.pnl_pct}% unrealized loss` : ''}
- Crypto as % of total finances: consider vs monthly income of $${Number(data.income?.total_monthly).toLocaleString()}/mo` : ''

  // Investment context sections — always include, use known values
  const westSection = `
WEST APARTMENT TRACKER (Priority #1 financial goal):
- Target: $11,204,000 MXN | Delivery: Dec 2027 (22 months away)
- Funded: ~$10,213,365 projected (91.2% funded, gap ~$990,635 — under $1M 🎯)
- Direct payments made: $2,504,700 (22.4% of target)
- GBM Investment (9.5% net): $750,000 growing to ~$1.45M by delivery
- Crypto portfolio: compounding at estimated 15%/yr
- Laura's Infonavit: $350,000 (confirmed, applied at delivery)
- Current market value: $13,500,000 (+20.5% appreciation since purchase)
- Unrealized equity today: ~$4,800,700
- UPCOMING: Apartment sale closes April 2026 → ~$5.53M net inflow to GBM
- UPCOMING: BBVA + Infonavit mortgages paid off April 2026 → frees $18,925/mo
- UPCOMING: $100K lump sum payment Dec 2026`

  const retirementSection = `
RETIREMENT ASSETS (AFORE):
- Bernardo SURA AFORE: $1,050,000 | 22.3yr to 65 | Projected at 65: ~$5.4M (base 8.5%)
- Laura SURA AFORE: $560,740 | 28.7yr to 65 | Projected at 65: ~$4.7M (base 8.5%)
- Laura Infonavit subcuenta: $350,000 (earmarked for WEST, not available long-term)
- Total retirement assets: $1,960,740 (locked until 65, not available for WEST except Infonavit)
- Monthly employer AFORE contributions: ~$17,551 combined (Bernardo $12,741 + Laura $4,810)`

  const netWorthSection = `
NET WORTH SNAPSHOT:
- Crypto: ~$391,199 MXN
- Fixed Income (GBM debt fund): $750,000 MXN (growing at 9.5% net)
- Real Estate equity: ~$10,330,700 MXN (WEST unrealized $4.8M + current apt $5.53M)
- Retirement (AFORE, locked): $1,960,740 MXN
- TOTAL NET WORTH: ~$13,432,639 MXN
- Real estate is 76.9% of net worth — highly concentrated in property (intentional)`

  const upcomingEventsSection = `
UPCOMING FINANCIAL EVENTS:
- April 2026 (~6 weeks): Current apartment sale closes → $5.53M net flows to GBM
- April 2026: BBVA ($890K) + Infonavit ($780K) debts paid off from sale proceeds
- April 2026: GBM balance ~$6.28M → commission drops from 1.25% → 0.82% (saves ~$27K/yr)
- April 30, 2026: GBM capital gains declaración anual deadline (10% tax on profit)
- December 2026: $100K lump sum payment to WEST developer
- March 2027: Final $10K monthly payment to WEST
- December 2027: WEST apartment delivery — $990K gap likely financed via mortgage`

  const goalSection = data.goal_funding ? `
GOAL FUNDING GAP:
- Goals need: $${Number(data.goal_funding.total_monthly_needed).toLocaleString()}/mo
- Discretionary available: $${Number(data.goal_funding.discretionary_available).toLocaleString()}/mo
- Gap: ${data.goal_funding.fully_funded ? 'FULLY FUNDED ✅' : `$${Number(data.goal_funding.gap).toLocaleString()}/mo SHORT`}` : ''

  const prompt = `You are WOLFF, a sharp personal finance analyst for a Mexican professional with a $13.4M net worth. You analyze both daily spending AND long-term investments (real estate, crypto, GBM, AFORE). Analyze this financial data and generate actionable insights.

FULL FINANCIAL DATA:
${JSON.stringify(data, null, 2)}
${bvaSection}
${msiSection}
${goalSection}
${cryptoSection}
${westSection}
${retirementSection}
${netWorthSection}
${upcomingEventsSection}

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
- If crypto data exists: analyze portfolio performance, concentration risk, crypto as % of total assets
- Flag if any single coin is >80% of crypto portfolio (concentration risk)
- Flag if unrealized crypto loss exceeds 20% — suggest DCA or holding strategy
- Consider crypto value in overall financial health assessment
- WEST APARTMENT: Always include a "WEST Update" insight — current funding status, upcoming April sale event, projected gap at delivery
- NET WORTH: Include a "Net Worth Snapshot" insight — total, breakdown, what changed, what's coming
- UPCOMING EVENTS: Flag the April 2026 apartment sale as HIGH priority — biggest single cash event of the year ($5.53M inflow to GBM)
- RETIREMENT: Comment on AFORE trajectory if projections are on/off track vs 70% income replacement
- GBM: Mention the commission bracket drop opportunity if relevant
- TAX: If in Feb-Apr window, flag the GBM capital gains declaración anual deadline

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
