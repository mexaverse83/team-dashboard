import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { canonicalOwner, getOwnerName, OWNERS } from '@/lib/owners'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'

function admin(): SupabaseClient | Response {
  try {
    return getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
}

// Stores a browser push subscription, tagged with its owner so reminders can
// target Bernardo's or Laura's phone. The signed-in session decides the owner;
// a body `owner` is only used when there is no session email (API key, dev).
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

  const fromSession = auth.email ? canonicalOwner(getOwnerName(auth.email)) : null
  const fromBody = canonicalOwner(body.owner)
  const owner = [fromSession, fromBody].find(o => o && OWNERS.includes(o)) ?? null

  const supabase = admin()
  if (supabase instanceof Response) return supabase
  const { error } = await supabase
    .from('finance_push_subscriptions')
    .upsert({ endpoint: sub.endpoint, subscription: sub, owner }, { onConflict: 'endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, owner })
}

// GET ?endpoint=… → whether the server still has this device (lets the toggle self-heal).
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  const supabase = admin()
  if (supabase instanceof Response) return supabase
  const { data, error } = await supabase.from('finance_push_subscriptions').select('owner').eq('endpoint', endpoint).limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscribed: Boolean(data?.length), owner: data?.[0]?.owner ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 })
  const supabase = admin()
  if (supabase instanceof Response) return supabase
  const { error } = await supabase.from('finance_push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
