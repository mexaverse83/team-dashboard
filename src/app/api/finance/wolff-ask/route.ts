import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

// Synchronous Ask-Wolff for iOS Shortcuts / Siri: POST a question, the
// response blocks until the home-machine daemon answers (or 55s timeout).
// Body: {"q": "..."} or {"content": "..."}. Returns {"answer": "..."}.
export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  let body: { q?: string; content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  const content = (body.q || body.content || '').trim().slice(0, 1000)
  if (!content) return NextResponse.json({ error: 'q required' }, { status: 400 })

  const { data: question, error } = await supabase
    .from('finance_wolff_chat')
    .insert({ role: 'user', content, status: 'pending', asked_by: 'shortcut' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Long-poll for the daemon's reply
  const deadline = Date.now() + 55000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2500))
    const { data: reply } = await supabase
      .from('finance_wolff_chat')
      .select('content')
      .eq('reply_to', question.id)
      .eq('role', 'wolff')
      .limit(1)
      .maybeSingle()
    if (reply?.content) {
      return NextResponse.json({ answer: reply.content }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const { data: q2 } = await supabase
      .from('finance_wolff_chat')
      .select('status')
      .eq('id', question.id)
      .single()
    if (q2?.status === 'failed') {
      return NextResponse.json({ answer: 'Wolff hit a snag answering that one — try again in a minute.' })
    }
  }
  return NextResponse.json({
    answer: 'Wolff is still thinking (or the home machine is offline) — your question is saved, check the app chat in a minute.',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
