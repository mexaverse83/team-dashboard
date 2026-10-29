import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { BABY_CHECKLIST } from '@/lib/baby-plan'
import { canonicalOwner, getOwnerName } from '@/lib/owners'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'

// Baby-plan checklist completion (OPP-04). Items live in code (baby-plan.ts);
// this table only records which are done, so an overdue item can stay visible
// ("missed window — still do it") instead of silently disappearing.

function admin(): SupabaseClient | Response {
  try {
    return getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
}

// GET → { items: [{ id, title, windowStart, windowEnd, severity, done_at, done_by }] }
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const supabase = admin()
  if (supabase instanceof Response) return supabase
  const { data, error } = await supabase.from('finance_checklist_status').select('item_id, done_at, done_by, note')
  const status = new Map((error ? [] : data || []).map(row => [String(row.item_id), row]))
  return NextResponse.json({
    items: BABY_CHECKLIST.map(item => ({
      ...item,
      done_at: status.get(item.id)?.done_at ?? null,
      done_by: status.get(item.id)?.done_by ?? null,
      note: status.get(item.id)?.note ?? null,
    })),
    ...(error ? { warning: 'finance_checklist_status unavailable — run supabase-2026-10-checklist-status.sql' } : {}),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST { item_id, done: boolean, note? } → mark an item done or not done.
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => ({})) as { item_id?: string; done?: boolean; note?: string }
  if (!body.item_id || !BABY_CHECKLIST.some(item => item.id === body.item_id)) {
    return NextResponse.json({ error: 'unknown item_id' }, { status: 400 })
  }
  const supabase = admin()
  if (supabase instanceof Response) return supabase
  const doneBy = auth.email ? canonicalOwner(getOwnerName(auth.email)) : null
  const { error } = await supabase.from('finance_checklist_status').upsert({
    item_id: body.item_id,
    done_at: body.done === false ? null : new Date().toISOString(),
    done_by: body.done === false ? null : doneBy,
    note: typeof body.note === 'string' ? body.note.slice(0, 500) : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'item_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
