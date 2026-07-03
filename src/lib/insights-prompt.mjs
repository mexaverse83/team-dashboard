// Builds the WOLFF insights prompt from a /api/finance/summary payload.
// Plain .mjs (no TS syntax) so it can be imported both by the Next.js route
// and by scripts/generate-insights-codex.mjs running under bare Node.

export function buildInsightsPrompt(data) {
  const bva = data.current_month?.budget_vs_actual || []
  const bvaSection = bva.length > 0 ? `
BUDGET VS ACTUAL (Current Month - Day ${data.current_month?.day_of_month}/${data.current_month?.days_in_month}, ${data.current_month?.month_progress_pct}% through month):
${bva.map((b) =>
  `- ${b.category}${b.is_non_monthly ? ` [${b.billing_cycle} billing — amount is amortized monthly]` : ''}: Spent $${Number(b.spent).toLocaleString()} / Budget $${Number(b.budget).toLocaleString()} (${b.pct_used}% used)${b.is_non_monthly ? ' (amortized)' : ` | Daily pace: $${Number(b.daily_pace).toLocaleString()}/day vs budget $${Number(b.budget_daily_pace).toLocaleString()}/day (${Number(b.pace_vs_budget_pct) > 0 ? '+' : ''}${b.pace_vs_budget_pct}%) | Projected: $${Number(b.projected_month_total).toLocaleString()}`} | Status: ${b.status === 'ok' ? '✅' : b.status === 'warning' ? '⚠️' : '🔴'}`
).join('\n')}` : ''

  const msiSection = (data.msi_timeline || []).length > 0 ? `
MSI PAYOFF TIMELINE:
${(data.msi_timeline).map((m) =>
  `- ${m.name} (${m.merchant}): $${Number(m.monthly_payment).toLocaleString()}/mo × ${m.payments_remaining} remaining → ends ${m.end_date} → frees $${Number(m.monthly_payment).toLocaleString()}/mo`
).join('\n')}` : ''

  const cryptoSection = data.crypto ? `
CRYPTO PORTFOLIO:
- Total Value: $${Number(data.crypto.total_value_mxn).toLocaleString()} MXN ($${Number(data.crypto.total_value_usd).toLocaleString()} USD)
- Cost Basis: $${Number(data.crypto.total_cost_mxn).toLocaleString()} MXN
- P&L: ${data.crypto.pnl_mxn >= 0 ? '+' : ''}$${Number(data.crypto.pnl_mxn).toLocaleString()} MXN (${data.crypto.pnl_pct}%)
- Holdings: ${(data.crypto.holdings).map((h) => `${h.symbol}: ${h.qty} (${h.allocation_pct}% of crypto)`).join(', ')}
${data.crypto.risks?.concentration ? `- ⚠️ CONCENTRATION RISK: ${data.crypto.risks.concentration.symbol} is ${data.crypto.risks.concentration.pct}% of crypto portfolio` : ''}
${data.crypto.risks?.large_loss ? `- ⚠️ LARGE UNREALIZED LOSS: ${data.crypto.risks.large_loss.pnl_pct}% unrealized loss` : ''}
- Crypto as % of total finances: consider vs monthly income of $${Number(data.income?.total_monthly).toLocaleString()}/mo` : ''

  const goalSection = data.goal_funding ? `
GOAL FUNDING GAP:
- Goals need: $${Number(data.goal_funding.total_monthly_needed).toLocaleString()}/mo
- Discretionary available: $${Number(data.goal_funding.discretionary_available).toLocaleString()}/mo
- Gap: ${data.goal_funding.fully_funded ? 'FULLY FUNDED ✅' : `$${Number(data.goal_funding.gap).toLocaleString()}/mo SHORT`}` : ''

  return `You are WOLFF, a sharp personal finance analyst for a Mexican household. You analyze daily spending, cash flow, goals, debt, subscriptions, investments, crypto, and long-term financial risk. Analyze this financial data and generate actionable insights.

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
}

// Extracts the insights array from a raw model response — tolerates markdown
// fences or prose around the JSON.
export function parseInsightsResponse(text) {
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []
    try {
      const parsed = JSON.parse(match[0])
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}
