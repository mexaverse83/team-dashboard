import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

// Glanceable numbers for home-screen widgets (Scriptable on iOS).
// Everything derives from the summary + west-projection endpoints so the
// widget always agrees with the dashboard.

const CONTROLLABLE = new Set(['Dining Out', 'Groceries', 'Entertainment', 'Shopping', 'Transport', 'Travel', 'Gifts', 'Other'])

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const authKey = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const baseUrl = req.nextUrl.origin

  const [summary, west] = await Promise.all([
    fetch(`${baseUrl}/api/finance/summary?months=1`, { headers: { 'x-api-key': authKey } })
      .then(r => (r.ok ? r.json() : null)).catch(() => null),
    fetch(`${baseUrl}/api/finance/investments/west-projection`, { headers: { 'x-api-key': authKey } })
      .then(r => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!summary) return NextResponse.json({ error: 'summary unavailable' }, { status: 500 })

  const cm = summary.current_month || {}
  const income = summary.cash_flow?.monthly_income || 0
  const spent = cm.total_spent || 0
  const bva: Array<{ category: string; budget: number; spent: number; is_non_monthly: boolean }> = cm.budget_vs_actual || []
  const daysLeft = Math.max(1, (cm.days_in_month || 30) - (cm.day_of_month || 1) + 1)
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7))

  // Same formula as the Safe-to-Spend card
  const reserved = bva.reduce((s, b) => s + Math.max(0, (b.budget || 0) - (b.spent || 0)), 0)
  const goalNeed = summary.goal_funding?.total_monthly_needed || 0
  const freeMonth = income - spent - reserved - goalNeed
  const safePerDay = freeMonth > 0 ? Math.floor(freeMonth / daysLeft) : 0

  // Same envelope as the weekly coach
  const ctrl = bva.filter(b => CONTROLLABLE.has(b.category) && !b.is_non_monthly)
  const ctrlRemaining = ctrl.reduce((s, b) => s + Math.max(0, (b.budget || 0) - (b.spent || 0)), 0)
  const weekEnvelope = Math.round(ctrlRemaining / weeksLeft)

  const monthKey = cm.month
  const planMonth = west?.savings_plan?.months?.find((m: { month: string }) => m.month === monthKey)

  return NextResponse.json({
    updated_at: new Date().toISOString(),
    month: monthKey,
    day: cm.day_of_month,
    days_in_month: cm.days_in_month,
    safe_to_spend_day: safePerDay,
    over_committed_by: freeMonth < 0 ? Math.abs(Math.round(freeMonth)) : 0,
    week_envelope: weekEnvelope,
    net_this_month: Math.round(income - spent),
    west: west ? {
      month_target: planMonth?.target ?? null,
      funded_pct: Math.round(((west.projected_at_delivery?.total_projected || 0) / (west.target || 1)) * 1000) / 10,
      months_to_delivery: west.months_to_delivery,
    } : null,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
