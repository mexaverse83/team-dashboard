import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { ConfigError, configErrorResponse, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'

/**
 * GET /api/finance/monthly-savings?months=6&owner=all
 *
 * Monthly savings snapshots, read with the service role (the anon key can't
 * see finance_monthly_savings, so the browser must come through here).
 * owner param: 'bernardo' | 'laura' | 'total' | 'all' (default)
 * 'all' returns all rows; client pivots for charts.
 */
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const requested = parseInt(req.nextUrl.searchParams.get('months') || '6', 10)
  const months = Math.min(Math.max(Number.isFinite(requested) ? requested : 6, 1), 24)
  const owner = (req.nextUrl.searchParams.get('owner') || 'all').toLowerCase()

  let client, degraded
  try {
    ({ client, degraded } = getAdminClientInfo())
  } catch (e) {
    if (e instanceof ConfigError) return configErrorResponse(e)
    throw e
  }

  let query = client
    .from('finance_monthly_savings')
    .select('month, owner, gross_income, total_expenses, net_savings, savings_rate, planned_contribution, variance, notes')
    .order('month', { ascending: false })

  if (owner !== 'all') {
    query = query.eq('owner', owner).limit(months)
  } else {
    // For 'all', fetch last N months × 3 owners
    query = query.limit(months * 3)
  }

  const { data, error } = await query

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ data: [], chart: [] }) // table not yet created
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []).reverse() // chronological

  // Pivoted chart data: [{ month, bernardo, laura, total, planned }]
  const monthMap: Record<string, Record<string, number>> = {}
  for (const row of rows) {
    const m = row.month
    if (!monthMap[m]) monthMap[m] = {}
    monthMap[m][row.owner] = Math.round(row.net_savings)
    monthMap[m][`${row.owner}_planned`] = row.planned_contribution
    monthMap[m][`${row.owner}_variance`] = Math.round(row.variance)
    monthMap[m][`${row.owner}_savings_rate`] = row.savings_rate
    monthMap[m][`${row.owner}_gross`] = row.gross_income
    monthMap[m][`${row.owner}_expenses`] = row.total_expenses
  }
  const chart = Object.entries(monthMap).map(([month, vals]) => ({
    month,
    label: new Date(`${String(month).slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    ...vals,
  }))

  return withDegradedHeader(NextResponse.json({ data: rows, chart }, { headers: { 'Cache-Control': 'private, no-store' } }), degraded)
}
