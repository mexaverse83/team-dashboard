// Builds the WOLFF insights prompt from a /api/finance/summary payload.
// Plain .mjs (no TS syntax) so it can be imported both by the Next.js route
// and by scripts/generate-insights-codex.mjs running under bare Node.

export function buildInsightsPrompt(data, west) {
  const bva = data.current_month?.budget_vs_actual || []
  const bvaSection = bva.length > 0 ? `
BUDGET VS ACTUAL (Current Month - Day ${data.current_month?.day_of_month}/${data.current_month?.days_in_month}, ${data.current_month?.month_progress_pct}% through month):
${bva.map((b) =>
  `- ${b.category}${b.is_fixed ? ' [FIXED — known scheduled charges, cannot exceed budget by design]' : ''}${b.is_non_monthly ? ` [${b.billing_cycle} billing — amount is amortized monthly]` : ''}: Spent $${Number(b.spent).toLocaleString()} / Budget $${Number(b.budget).toLocaleString()} (${b.pct_used}% used)${(b.is_non_monthly || b.is_fixed) ? '' : ` | Daily pace: $${Number(b.daily_pace).toLocaleString()}/day vs budget $${Number(b.budget_daily_pace).toLocaleString()}/day (${Number(b.pace_vs_budget_pct) > 0 ? '+' : ''}${b.pace_vs_budget_pct}%) | Projected: $${Number(b.projected_month_total).toLocaleString()}`} | Status: ${b.status === 'ok' ? '✅' : b.status === 'warning' ? '⚠️' : '🔴'}`
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

  const b = west?.behavioral
  const westSection = west && b ? `
WEST APARTMENT (real-estate purchase) — READINESS DATA:
- Target: $${Number(west.target).toLocaleString()} MXN, delivery ${west.delivery_date} (${west.months_to_delivery} months away)
- Paid so far: $${Number(west.current_status?.amount_paid).toLocaleString()} (${Math.round(west.current_status?.pct_paid || 0)}%)
- Scheduled-plan projection at delivery (base ${Math.round((west.assumptions?.investment_return || 0) * 1000) / 10}% GBM return): $${Number(west.projected_at_delivery?.total_projected).toLocaleString()} → gap $${Number(west.projected_at_delivery?.gap).toLocaleString()}
- Scenario gaps: conservative 8% → $${Number(west.scenarios?.conservative_8pct?.gap).toLocaleString()}, base → $${Number(west.scenarios?.base_9_5pct?.gap).toLocaleString()}, optimistic 11% → $${Number(west.scenarios?.optimistic_11pct?.gap).toLocaleString()}
- ACTUAL household savings behavior (from real transactions, last ${b.monthly_net_savings_history?.length || 0} full months):
${(b.monthly_net_savings_history || []).map((m) => `  · ${m.month}: income $${Number(m.income).toLocaleString()} − spent $${Number(m.expenses).toLocaleString()} = net $${Number(m.net).toLocaleString()}`).join('\n')}
- Average net savings: $${Number(b.avg_monthly_net_savings).toLocaleString()}/mo (recent 3-month: $${Number(b.recent_3mo_net_savings).toLocaleString()}/mo)
- If that average surplus flows into GBM monthly: position at delivery $${Number(b.projected_total_at_delivery).toLocaleString()}, gap $${Number(b.projected_gap_at_delivery).toLocaleString()}${b.fully_funded_month ? `, FULLY FUNDED by ${b.fully_funded_month}` : ' (not fully funded by delivery)'}
- Monthly contribution required to close the base gap by delivery: $${Number(b.required_monthly_contribution).toLocaleString()}/mo
${west.savings_plan?.months?.length ? `- MONTH-BY-MONTH SAVINGS PLAN — covers the purchase gap${west.savings_plan.furnishing_budget ? ` PLUS a $${Number(west.savings_plan.furnishing_budget).toLocaleString()} furnishing budget` : ''} (seasonally weighted by real capacity; stretch factor ${west.savings_plan.stretch_factor}× of historical capacity${west.savings_plan.flat_monthly_equivalent ? `; flat equivalent $${Number(west.savings_plan.flat_monthly_equivalent).toLocaleString()}/mo` : ''}):
${west.savings_plan.months.map((m) => `  · ${m.month}: save $${Number(m.target).toLocaleString()}${m.notes.length ? ` (${m.notes.join('; ')})` : ''}`).join('\n')}` : ''}` : ''

  // Weekly coaching context: how much controllable money is left, sliced by
  // the weeks remaining, so WOLFF can issue concrete week/weekend directives.
  const CONTROLLABLE = new Set(['Dining Out', 'Groceries', 'Entertainment', 'Shopping', 'Transport', 'Travel', 'Gifts', 'Other'])
  const weekSection = (() => {
    const cm = data.current_month
    if (!cm || !bva.length) return ''
    const nowD = new Date()
    const daysLeftMonth = Math.max(1, (cm.days_in_month || 30) - (cm.day_of_month || 1) + 1)
    const weeksLeft = Math.max(1, Math.ceil(daysLeftMonth / 7))
    const dow = nowD.getDay() // 0=Sun..6=Sat
    const daysToSunday = dow === 0 ? 0 : 7 - dow
    const fmtDay = (offset) => {
      const d = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() + offset)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    const satOffset = dow === 6 ? 0 : (6 - dow + 7) % 7
    const ctrl = bva.filter((b) => CONTROLLABLE.has(b.category) && !b.is_non_monthly)
    if (!ctrl.length) return ''
    const rows = ctrl.map((b) => {
      const remaining = Math.max(0, Number(b.budget) - Number(b.spent))
      return `  · ${b.category}: $${remaining.toLocaleString()} left of $${Number(b.budget).toLocaleString()} (spent $${Number(b.spent).toLocaleString()}) → ~$${Math.round(remaining / weeksLeft).toLocaleString()}/week`
    }).join('\n')
    const totalRemaining = ctrl.reduce((s, b) => s + Math.max(0, Number(b.budget) - Number(b.spent)), 0)
    const westMonthTarget = west?.savings_plan?.months?.find((m) => m.month === cm.month)
    return `
WEEKLY SPENDING COACH CONTEXT:
- Today is ${fmtDay(0)}; this week runs through Sunday ${fmtDay(daysToSunday)}; the coming weekend is ${fmtDay(satOffset)}–${fmtDay(satOffset + 1)}
- ${daysLeftMonth} days (${weeksLeft} week${weeksLeft > 1 ? 's' : ''}) left in the month
- Controllable budget remaining this month: $${totalRemaining.toLocaleString()} total → ~$${Math.round(totalRemaining / weeksLeft).toLocaleString()}/week across all controllable categories
${rows}
${westMonthTarget ? `- THIS MONTH'S WEST SAVINGS TARGET: $${Number(westMonthTarget.target).toLocaleString()} must be left over and moved to GBM${westMonthTarget.notes?.length ? ` (${westMonthTarget.notes.join('; ')})` : ''}` : ''}
- Expected monthly income: $${Number(data.income?.total_monthly || 0).toLocaleString()}; spent so far: $${Number(cm.total_spent || 0).toLocaleString()}`
  })()

  const mp = data.month_projection
  const projectionSection = mp ? `
MONTH-END SAVINGS PROJECTION (deterministic, computed today):
- Expected income this month: $${Number(mp.expected_income).toLocaleString()}
- Spent so far: $${Number(mp.spent_so_far).toLocaleString()} · Projected total spend: $${Number(mp.projected_spend).toLocaleString()}${mp.known_upcoming_treatment > 0 ? ` (includes $${Number(mp.known_upcoming_treatment).toLocaleString()} known upcoming treatment)` : ''}
- PROJECTED SAVINGS AT MONTH END: $${Number(mp.projected_savings).toLocaleString()} (method: ${mp.method})` : ''

  const goalSection = data.goal_funding ? `
GOAL FUNDING GAP:
- Goals need: $${Number(data.goal_funding.total_monthly_needed).toLocaleString()}/mo
- Discretionary available: $${Number(data.goal_funding.discretionary_available).toLocaleString()}/mo
- Gap: ${data.goal_funding.fully_funded ? 'FULLY FUNDED ✅' : `$${Number(data.goal_funding.gap).toLocaleString()}/mo SHORT`}` : ''

  const householdSection = `
HOUSEHOLD PRIORITY ORDER (use this order when deciding what matters):
1. Near-term liquidity and known bills/treatment payments
2. Fertility treatment until the remaining balance reaches zero
3. This month's WEST/GBM transfer and the December 2027 home-delivery gap
4. Preserve the emergency floor; do not recommend adding more when it is already above target
5. Bernardo + Laura's combined 2026 savings goals
6. Discretionary optimization, crypto, and other secondary opportunities

HOUSEHOLD HEALTH:
- Sustainable income baseline: $${Number(data.income?.total_monthly || 0).toLocaleString()}/mo (${data.income?.baseline_method || 'configured'})
- Fixed commitments: $${Number(data.cash_flow?.fixed_commitments || 0).toLocaleString()}/mo; capacity before goals: $${Number(data.cash_flow?.discretionary_available || 0).toLocaleString()}/mo
- Emergency reserve: $${Number(data.emergency_fund?.current || 0).toLocaleString()} = ${Number(data.emergency_fund?.months_covered || 0)} months of essentials (${Number(data.emergency_fund?.funded_pct || 0)}% of target)
- Fertility treatment remaining: $${Number(data.fertility_plan?.remaining_amount || 0).toLocaleString()}; next commitment $${Number(data.fertility_plan?.current_month_commitment || 0).toLocaleString()}
- Combined monetary goals: ${(data.goals?.active || []).filter((g) => Number(g.target) >= 100).map((g) => `${g.name} ${g.pct}%`).join(', ') || 'none'}`

  return `You are WOLFF, Bernardo and Laura's calm, exact household finance coach in Mexico. Your job is not to produce a report; it is to identify the smallest number of decisions that keep their family plan, WEST home, and savings goals on track. Analyze the live data and generate a concise decision brief.

FULL FINANCIAL DATA:
${JSON.stringify(data, null, 2)}
${bvaSection}
${msiSection}
${projectionSection}
${goalSection}
${cryptoSection}
${westSection}
${weekSection}
${householdSection}

CONTEXT:
- Currency is MXN (Mexican Pesos)
- MSI = Meses Sin Intereses (interest-free installments, very common in Mexico)
- Bernardo and Laura make decisions as one household; optimize for the combined plan, not isolated account performance
- Be specific with numbers, dates, and actionable steps
- Reference actual category names, merchants, and amounts from the data
- Use only the live data provided above. Do not invent net worth, WEST, tax, retirement, property, or investment facts that are not present in the data.
- Flag anomalies (e.g. electricity at 271% could be bimonthly billing — explain it)
- For each category significantly over pace, explain WHY based on transaction patterns
- Clearly distinguish actual-to-date, deterministic month-end projection, sustainable baseline, and long-term scenario. Never present one as another.
- Lead with a verdict and one action. Do not repeat the same observation under multiple categories.

Generate a JSON array of insights. Each insight must have:
- type: "alert" | "recommendation" | "win" | "forecast" | "pattern" | "saving"
- icon: emoji that fits the insight
- title: short headline (max 80 chars)
- detail: 1-2 concise sentences with the minimum numbers needed to justify the action
- priority: "high" | "medium" | "low"
- category: optional finance category name
- savings_amount: optional number — estimated MXN savings if recommendation is followed
- effort: optional "easy" | "medium" | "hard" — how hard is this to implement

Rules:
- Generate 7-9 insights total; fewer, better, and non-overlapping
- Required set: 1 WIDGET directive, 1 PROJECTION, exactly 2 WEEK, exactly 2 WEST when WEST data exists, exactly 1 HOUSEHOLD status, and at most 2 exceptional alerts/wins
- Prioritize actionable advice over observations
- Celebrate a win only when it changes or reinforces behavior; never create filler praise
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
- Include exactly 1 insight with category "HOUSEHOLD". It must state whether this month's projected savings cover the combined monthly goal pace, name the uncovered amount if any, and identify the one priority that should receive the next peso. Do not confuse normalized monthly capacity with the current-month projection.
- If MONTH-END SAVINGS PROJECTION is present: include exactly 1 insight with category "PROJECTION", type "forecast". title: the projected savings figure with direction (e.g. "On pace to save $118k this month"). detail: 1-2 sentences on WHY — which categories drive it, how it compares to this month's WEST savings target, and the single behavior that would most improve it. Use the deterministic number given; do not recompute.
- ALWAYS include exactly 1 insight with category "WIDGET": the single most decision-relevant directive for TODAY, chosen from everything in this data. type "recommendation". title = the directive itself, imperative, max 48 characters, punchy (e.g. "Cook tonight — dining pace is 2× budget", "Move $58k surplus to GBM today", "Treatment payment tomorrow — hold spending"). detail = ONE sentence with the key number that justifies it. This is shown on a phone home-screen widget — it must be the one line that most changes today's behavior.
- If WEEKLY SPENDING COACH CONTEXT is present: include exactly 2 insights with category "WEEK". These are the household's weekly money coach — be direct, personal, and specific, like a trainer, never generic:
  (1) type "recommendation", the WEEK'S ENVELOPE: exactly how much they can spend this week in total and per key category (dining, groceries, entertainment), derived from remaining budgets ÷ weeks left, tightened if the month's WEST savings target is at risk;
  (2) type "alert" or "recommendation", the WEEKEND VERDICT for the coming weekend by name (e.g. "Jul 5–6"): can they afford dinner out or not, and if not say so bluntly ("this weekend is a cook-at-home weekend — dining budget is gone") with the specific number that remains;
  Weekly amounts must be internally consistent with the remaining budgets and the WEST monthly target. If a category is already exhausted, the directive is zero-based ("$0 left — anything spent here comes out of the WEST transfer").
- If WEST APARTMENT readiness data is present: include exactly 2 insights with category "WEST" — (1) a "forecast" giving the readiness verdict: most-likely position and gap at delivery given ACTUAL savings behavior vs the scheduled plan, and whether the household is on track to pay without financing; (2) a "recommendation" anchored on the MONTH-BY-MONTH SAVINGS PLAN if present: state THIS month's and NEXT month's plan targets, whether current-month savings are tracking toward this month's target, and the single biggest lever if behind. Use the behavioral numbers, not just the scheduled plan.

CRITICAL — FIXED categories (marked [FIXED]):
- These are known scheduled charges BY DESIGN: Rent/Mortgage (rent + WEST apartment payment, day 1), Utilities (bills land early-month), Subscriptions (charges on their billing dates). High %-used early in the month is the correct, expected state; the total cannot exceed budget unless something actually changed.
- NEVER generate alerts, warnings, pace analysis, projections, or TODAY'S PRIORITY items about a fixed category at ≤100% of budget. Do not mention it at all in that state — not even reassurance like "this is normal", it wastes the reader's attention.
- The ONLY newsworthy event for a fixed category is spent EXCEEDING budget (duplicate charge or price increase) — that is a high alert.

CRITICAL — Bimonthly/non-monthly billing categories:
- Categories marked [bimonthly billing] or [quarterly billing] etc are KNOWN recurring charges
- Do NOT make them TODAY'S PRIORITY unless >200% of their cycle-adjusted budget
- Do NOT generate ACTIVE ALERTS for them unless >150% of cycle-adjusted budget
- When mentioning them, always note "This is a bimonthly charge — no action needed unless the amount is unusual"
- DEPRIORITIZE them vs monthly categories that the user can actually control (dining, groceries, transport, entertainment)
- Focus TODAY'S PRIORITY and top alerts on controllable monthly spending, not fixed billing events
- A bimonthly charge at 130-140% of cycle budget is normal variance, not an emergency

CRITICAL — SIGNAL QUALITY:
- The deterministic MONTH-END SAVINGS PROJECTION is the source of truth for this month's expected savings. Do not replace it with income minus spend-to-date.
- The sustainable income baseline is for forward planning; do not call it income already received.
- A scheduled-cash-flow forecast excludes unscheduled variable spending. Never describe its ending net as guaranteed savings.
- If the emergency fund is at or above 100%, treat it as protected infrastructure, not the next savings destination.
- Do not mention completed MSI plans; the supplied timeline contains forward commitments only.

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

// Models occasionally return a correct but overlong brief. Normalize at the
// boundary so every surface receives the same small, predictable decision set.
export function normalizeInsights(items) {
  const types = new Set(['alert', 'recommendation', 'win', 'forecast', 'pattern', 'saving'])
  const priorities = new Set(['high', 'medium', 'low'])
  const categoryLimit = { WIDGET: 1, PROJECTION: 1, HOUSEHOLD: 1, WEEK: 2, WEST: 2 }
  const categoryRank = { WIDGET: 0, HOUSEHOLD: 1, PROJECTION: 2, WEEK: 3, WEST: 4 }
  const seenTitles = new Set()
  const counts = {}

  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.title && item.detail && types.has(item.type))
    .map((item) => ({
      ...item,
      title: String(item.title).trim().slice(0, 80),
      detail: String(item.detail).trim().slice(0, 500),
      icon: String(item.icon || '💡').slice(0, 8),
      priority: priorities.has(item.priority) ? item.priority : 'medium',
      category: item.category ? String(item.category).trim().slice(0, 40) : undefined,
    }))
    .sort((a, b) => {
      const ac = (a.category || '').toUpperCase()
      const bc = (b.category || '').toUpperCase()
      return (categoryRank[ac] ?? 9) - (categoryRank[bc] ?? 9)
    })
    .filter((item) => {
      const titleKey = item.title.toLowerCase()
      if (seenTitles.has(titleKey)) return false
      seenTitles.add(titleKey)
      const category = (item.category || '').toUpperCase()
      if (categoryLimit[category] !== undefined) {
        counts[category] = (counts[category] || 0) + 1
        if (counts[category] > categoryLimit[category]) return false
      }
      return true
    })
    .slice(0, 9)
}
