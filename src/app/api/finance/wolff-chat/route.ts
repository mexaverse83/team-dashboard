import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'

// Ask-Wolff chat. Questions queue as status:'pending'; the home-machine
// daemon (scripts/wolff-chat-daemon.mjs) answers them through Codex on the
// ChatGPT subscription and inserts a 'wolff' row.

const COLUMNS = 'id, role, content, status, reply_to, asked_by, created_at'
const DEFAULT_LIMIT = 50
const MONITOR_PREFIX = 'wolff-monitor:'

function admin(): SupabaseClient | Response {
  try {
    return getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
}

// GET                      → newest 50 messages, ascending (perf-02)
// GET ?since=<iso>         → only messages created after <iso>, ascending
// GET ?limit=N             → newest N (1–200)
// GET ?latest_proactive=1  → { question, reply } for the newest monitor event, or null (MOB-07)
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const supabase = admin()
  if (supabase instanceof Response) return supabase
  const params = req.nextUrl.searchParams

  if (params.get('latest_proactive') === '1') {
    const { data: questions, error } = await supabase
      .from('finance_wolff_chat')
      .select(COLUMNS)
      .eq('role', 'user')
      .like('asked_by', `${MONITOR_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const question = questions?.[0]
    if (!question) return NextResponse.json({ latest_proactive: null }, { headers: { 'Cache-Control': 'no-store' } })
    const { data: replies, error: replyError } = await supabase
      .from('finance_wolff_chat')
      .select(COLUMNS)
      .eq('reply_to', question.id)
      .eq('role', 'wolff')
      .order('created_at', { ascending: false })
      .limit(1)
    if (replyError) return NextResponse.json({ error: replyError.message }, { status: 500 })
    return NextResponse.json({ latest_proactive: { question, reply: replies?.[0] ?? null } }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const since = params.get('since')
  const limit = Math.min(Math.max(parseInt(params.get('limit') || '') || DEFAULT_LIMIT, 1), 200)

  if (since) {
    if (Number.isNaN(new Date(since).getTime())) return NextResponse.json({ error: 'since must be an ISO timestamp' }, { status: 400 })
    const { data, error } = await supabase
      .from('finance_wolff_chat')
      .select(COLUMNS)
      .gt('created_at', since)
      .order('created_at', { ascending: true })
      .limit(limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ messages: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Newest N, returned oldest-first so the chat renders top-down.
  const { data, error } = await supabase
    .from('finance_wolff_chat')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: [...(data || [])].reverse() }, { headers: { 'Cache-Control': 'no-store' } })
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
  const supabase = admin()
  if (supabase instanceof Response) return supabase
  // Proactive monitor events only come from /wolff-events.
  const askedBy = body.asked_by && !body.asked_by.startsWith(MONITOR_PREFIX) ? String(body.asked_by).slice(0, 80) : null
  const { data, error } = await supabase
    .from('finance_wolff_chat')
    .insert({ role: 'user', content, status: 'pending', asked_by: askedBy })
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
