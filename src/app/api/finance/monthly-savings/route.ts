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

// GET /api/finance/monthly-savings?months=6
// Returns monthly savings snapshots, most recent first
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const months = Math.min(parseInt(req.nextUrl.searchParams.get('months') || '6', 10), 24)

  const { data, error } = await getSupabase()
    .from('finance_monthly_savings')
    .select('month, gross_income, total_expenses, net_savings, savings_rate, notes')
    .order('month', { ascending: false })
    .limit(months)

  if (error) {
    // Table may not exist yet — return empty gracefully
    if (error.code === '42P01') return NextResponse.json({ data: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: (data || []).reverse() }) // chronological for chart
}
