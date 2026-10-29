import { NextRequest, NextResponse } from 'next/server'
import { authorizeWidgetRequest } from '@/lib/widget-auth'
import { ConfigError, getAdminClientInfo, withDegradedHeader } from '@/lib/supabase-admin'
import { buildSummary } from '@/lib/server/summary'
import { getWestProjection } from '@/lib/server/west'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { mexicoCityDateParts, nextMonthStartKey } from '@/lib/dates'
import { buildWidgetPayload, type WidgetInsightsCache, type WidgetTransaction } from '@/lib/widget/payload'

// Glanceable numbers for the Scriptable phone widget (payload v2, plus the
// v1 fields for one release). Built in-process from the same builders as the
// dashboard: no HTTP self-fetch and no key forwarding (W13).

export async function GET(req: NextRequest) {
  const auth = await authorizeWidgetRequest(req)
  if (!auth.ok) return auth.response

  let supabase, degraded
  try {
    ({ client: supabase, degraded } = getAdminClientInfo())
  } catch (err) {
    if (err instanceof ConfigError) return NextResponse.json({ error: 'widget data unavailable', reason: 'config' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    throw err
  }

  const now = new Date()
  const mx = mexicoCityDateParts(now)
  const month = `${mx.year}-${String(mx.month).padStart(2, '0')}`

  const [summary, west, insights, transactions, categories] = await Promise.all([
    buildSummary(supabase, { months: 1, now }).catch(() => null),
    getWestProjection(supabase, { now }).catch(() => null),
    Promise.resolve(supabase.from('finance_insights_cache').select('*').order('generated_at', { ascending: false }).limit(1).maybeSingle())
      .then(({ data }): WidgetInsightsCache | null => data ? {
        generated_at: data.generated_at ?? null,
        period_month: data.period_month ?? null,
        insights: Array.isArray(data.insights_json) ? data.insights_json : [],
      } : null)
      .catch(() => null),
    fetchAllRows<WidgetTransaction>((from, to) => supabase.from('finance_transactions')
      .select('id,transaction_date,amount,amount_mxn,category_id,tags')
      .eq('type', 'expense').gte('transaction_date', `${month}-01`).lt('transaction_date', nextMonthStartKey(month))
      .order('id').range(from, to), 1000, 20000, true).catch(() => null),
    Promise.resolve(supabase.from('finance_categories').select('id,name'))
      .then(({ data }) => new Map<string, string>((data || []).map((c: { id: string; name: string }) => [c.id, c.name])))
      .catch(() => new Map<string, string>()),
  ])
  if (!summary) return NextResponse.json({ error: 'summary unavailable' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })

  const payload = buildWidgetPayload({ summary, west, insights, transactions, categoryNames: categories, now })
  return withDegradedHeader(NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } }), degraded)
}
