import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// Stores a browser push subscription so the daily brief can be pushed to it.
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  let body: { subscription?: { endpoint?: string }; owner?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const sub = body.subscription
  if (!sub?.endpoint) return NextResponse.json({ error: 'subscription.endpoint required' }, { status: 400 })

  const { error } = await supabase
    .from('finance_push_subscriptions')
    .upsert({ endpoint: sub.endpoint, subscription: sub, owner: body.owner || null }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  const { error } = await supabase.from('finance_push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
