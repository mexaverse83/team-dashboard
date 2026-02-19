import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

// Sonnet 4.6 pricing (per million tokens)
const PRICING: Record<string, { input: number; output: number; cache_read: number; cache_write: number }> = {
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cache_read: 0.30, cache_write: 3.75 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0, cache_read: 0.30, cache_write: 3.75 },
  'claude-opus-4-5': { input: 15.0, output: 75.0, cache_read: 1.50, cache_write: 18.75 },
  'claude-haiku-3-5': { input: 0.80, output: 4.0, cache_read: 0.08, cache_write: 1.0 },
  'gemini-2.0-flash': { input: 0.10, output: 0.40, cache_read: 0.025, cache_write: 0 },
}

function calcCost(model: string, tokens_in: number, tokens_out: number, cache_read = 0, cache_write = 0): number {
  const key = Object.keys(PRICING).find(k => model.toLowerCase().includes(k.toLowerCase().replace('claude-', '').replace('gemini-', ''))) ?? 'claude-sonnet-4-6'
  const p = PRICING[key] ?? PRICING['claude-sonnet-4-6']
  return (
    (tokens_in / 1_000_000) * p.input +
    (tokens_out / 1_000_000) * p.output +
    (cache_read / 1_000_000) * p.cache_read +
    (cache_write / 1_000_000) * p.cache_write
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { agent_name, model, tokens_in, tokens_out, cache_read = 0, cache_write = 0, session_id, notes } = body

    if (!agent_name || !model || tokens_in == null || tokens_out == null) {
      return NextResponse.json({ error: 'Missing required fields: agent_name, model, tokens_in, tokens_out' }, { status: 400 })
    }

    const cost_usd = calcCost(model, tokens_in, tokens_out, cache_read, cache_write)

    const { error } = await getSupabase()
      .from('agent_costs')
      .insert({
        agent_name,
        model,
        tokens_in,
        tokens_out,
        cache_read,
        cache_write,
        cost_usd,
        session_id: session_id ?? null,
        notes: notes ?? null,
        timestamp: new Date().toISOString(),
      })

    if (error) {
      console.error('Cost log insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, cost_usd })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
