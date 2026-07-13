import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// Ask-Wolff chat. Questions queue as status:'pending'; the home-machine
// daemon (scripts/wolff-chat-daemon.mjs) answers them through Codex on the
// ChatGPT subscription and inserts a 'wolff' row.

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const since = req.nextUrl.searchParams.get('since')
  let q = supabase
    .from('finance_wolff_chat')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(200)
  if (since) q = q.gt('created_at', since)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  let body: { content?: string; asked_by?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const content = (body.content || '').trim().slice(0, 1000)
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })
  const { data, error } = await supabase
    .from('finance_wolff_chat')
    .insert({ role: 'user', content, status: 'pending', asked_by: body.asked_by || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Demo clones have no answer daemon — reply instantly with a canned note
  if (process.env.NEXT_PUBLIC_DEMO_MODE === '1') {
    await supabase.from('finance_wolff_chat').insert({
      role: 'wolff',
      content: 'This is the demo — in the live app I answer with the household\'s real numbers in about 20 seconds. 🐺 Ask Bernardo & Laura to show you the real thing.',
      status: 'done',
      reply_to: data.id,
    })
    await supabase.from('finance_wolff_chat').update({ status: 'answered' }).eq('id', data.id)
  }

  return NextResponse.json({ ok: true, message: data })
}
