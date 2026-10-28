import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { buildSummary } from '@/lib/server/summary'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeFinanceRequest(req)
    if (!auth.ok) return auth.response

    const summary = await buildSummary(supabase, { months: Number(req.nextUrl.searchParams.get('months') ?? 3) })
    // no-store: the browser must never answer this from its HTTP cache — a
    // 5-minute max-age let two cards on one screen show different projected
    // savings, and made the visibility-change refetch a no-op.
    return NextResponse.json(summary, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Financial data is temporarily unavailable' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    })
  }
}
