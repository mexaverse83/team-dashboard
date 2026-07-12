import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { remainingCalendarWeekEnvelope } from '@/lib/insights-prompt.mjs'

// Glanceable numbers for home-screen widgets (Scriptable on iOS).
// Everything derives from the summary + west-projection endpoints so the
// widget always agrees with the dashboard.

const CONTROLLABLE = new Set(['Dining Out', 'Groceries', 'Entertainment', 'Shopping', 'Transport', 'Travel', 'Gifts', 'Other'])

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const authKey = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const baseUrl = req.nextUrl.origin

  const [summary, west, insightsRes] = await Promise.all([
    fetch(`${baseUrl}/api/finance/summary?months=1`, { headers: { 'x-api-key': authKey } })
      .then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${baseUrl}/api/finance/investments/west-projection`, { headers: { 'x-api-key': authKey } })
      .then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${baseUrl}/api/finance/insights`, { headers: { 'x-api-key': authKey } })
      .then(r => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!summary) return NextResponse.json({ error: 'summary unavailable' }, { status: 500 })

  type Insight = { type: string; icon: string; title: string; detail: string; priority: string; category?: string }
  const insights: Insight[] = insightsRes?.insights || []
  const trim = (i: Insight | undefined, len = 140) => i
    ? { icon: i.icon, title: i.title, detail: (i.detail || '').slice(0, len) }
    : null
  const nonWeek = insights.filter(i => !['WEEK', 'WIDGET'].includes((i.category || '').toUpperCase()))
  const rawDirective = insights.find(i => (i.category || '').toUpperCase() === 'WIDGET')
  const topInsight = trim(
    insights.find(i => (i.category || '').toUpperCase() === 'HOUSEHOLD')
    || rawDirective
    || nonWeek.find(i => i.priority === 'high')
    || nonWeek[0]
  )
  const weekItems = insights.filter(i => (i.category || '').toUpperCase() === 'WEEK')
  const weekendVerdict = trim(weekItems.find(i => i.type === 'alert') || weekItems[1] || weekItems[0])
  const directive = trim(rawDirective, 110)

  const cm = summary.current_month || {}
  const income = summary.cash_flow?.monthly_income || 0
  const spent = cm.total_spent || 0
  const bva: Array<{ category: string; budget: number; spent: number; is_non_monthly: boolean }> = cm.budget_vs_actual || []
  const daysLeft = Math.max(1, (cm.days_in_month || 30) - (cm.day_of_month || 1) + 1)
  const mexicoWeekday = (() => {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      weekday: 'short',
    }).format(new Date())
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)
  })()

  // Same formula as the Safe-to-Spend card
  const reserved = bva.reduce((s, b) => s + Math.max(0, (b.budget || 0) - (b.spent || 0)), 0)
  const goalNeed = summary.goal_funding?.total_monthly_needed || 0
  const projectedSavings = summary.month_projection?.projected_savings || 0
  const goalGap = Math.max(0, goalNeed - projectedSavings)
  const goalCoverage = goalNeed > 0 ? Math.max(0, Math.round((projectedSavings / goalNeed) * 100)) : 100
  const freeMonth = income - spent - reserved - goalNeed
  const safePerDay = freeMonth > 0 ? Math.floor(freeMonth / daysLeft) : 0

  // Spread the remaining controllable budgets over the remaining month, then
  // include only today through Sunday. Sunday is a one-day envelope.
  const ctrl = bva.filter(b => CONTROLLABLE.has(b.category) && !b.is_non_monthly)
  const ctrlRemaining = ctrl.reduce((s, b) => s + Math.max(0, (b.budget || 0) - (b.spent || 0)), 0)
  const calendarEnvelope = remainingCalendarWeekEnvelope(ctrlRemaining, daysLeft, mexicoWeekday)

  const monthKey = cm.month
  const planMonth = west?.savings_plan?.months?.find((m: { month: string }) => m.month === monthKey)

  return NextResponse.json({
    updated_at: new Date().toISOString(),
    month: monthKey,
    day: cm.day_of_month,
    days_in_month: cm.days_in_month,
    safe_to_spend_day: safePerDay,
    over_committed_by: freeMonth < 0 ? Math.abs(Math.round(freeMonth)) : 0,
    controllable_per_day: calendarEnvelope.dailyEnvelope,
    week_envelope: calendarEnvelope.weekEnvelope,
    days_left_in_week: calendarEnvelope.daysThroughSunday,
    week_envelope_basis: 'remaining planned category spending from today through Sunday',
    net_this_month: Math.round(income - spent),
    projected_savings: Math.round(projectedSavings),
    goal_coverage_pct: goalCoverage,
    goal_gap: Math.round(goalGap),
    emergency_months: summary.emergency_fund?.months_covered || 0,
    west: west ? {
      month_target: planMonth?.target ?? null,
      funded_pct: Math.round(((west.projected_at_delivery?.total_projected || 0) / (west.target || 1)) * 1000) / 10,
      months_to_delivery: west.months_to_delivery,
    } : null,
    wolff: {
      top: topInsight,
      weekend: weekendVerdict,
      directive,
    },
    west_month: planMonth ? {
      target: planMonth.target,
      // Deterministic month-end savings is the same source of truth shown in
      // the dashboard; income minus spend-to-date overstates progress early.
      surplus_so_far: Math.round(projectedSavings),
      projected_savings: Math.round(projectedSavings),
      gap: Math.max(0, Math.round(planMonth.target - projectedSavings)),
      pct: planMonth.target > 0 ? Math.min(999, Math.max(0, Math.round((projectedSavings / planMonth.target) * 100))) : null,
    } : null,
    budget_pace: ctrl
      .map(b => ({
        name: b.category,
        spent: Math.round(b.spent || 0),
        budget: Math.round(b.budget || 0),
        pct: b.budget > 0 ? Math.round(((b.spent || 0) / b.budget) * 100) : 0,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 4),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
