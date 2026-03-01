import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes(req.nextUrl.host)
  return isSameOrigin || (!!key && key === expected)
}

/**
 * GET /api/finance/monthly-savings?months=6&owner=all
 *
 * Returns monthly savings snapshots.
 * owner param: 'bernardo' | 'laura' | 'total' | 'all' (default)
 * 'all' returns all rows; client pivots for charts.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const months = Math.min(parseInt(req.nextUrl.searchParams.get('months') || '6', 10), 24)
  const owner = req.nextUrl.searchParams.get('owner') || 'all'

  // Fetch distinct months first to enforce limit
  let query = getSupabase()
    .from('finance_monthly_savings')
    .select('month, owner, gross_income, total_expenses, net_savings, savings_rate, planned_contribution, variance, notes')
    .order('month', { ascending: false })

  if (owner !== 'all') {
    query = query.eq('owner', owner)
    query = query.limit(months)
  } else {
    // For 'all', fetch last N months × 3 owners
    query = query.limit(months * 3)
  }

  const { data, error } = await query

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ data: [] }) // table not yet created
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data || []).reverse() // chronological

  // Build pivoted chart data: [{ month, bernardo, laura, total, planned }]
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
    label: new Date(month).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
    ...vals,
  }))

  return NextResponse.json({ data: rows, chart })
}
