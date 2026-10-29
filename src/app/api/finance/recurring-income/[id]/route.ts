import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'

// Service role like every other route: a missing key answers 503 'config',
// never a silent anon-key write that RLS turns into a raw PGRST116 500.
function adminOrError(): { supabase: SupabaseClient } | { response: Response } {
  try {
    return { supabase: getAdminClient() }
  } catch (err) {
    return { response: configErrorResponse(err) }
  }
}

// PUT /api/finance/recurring-income/:id — update entry
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  const admin = adminOrError()
  if ('response' in admin) return admin.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowedFields = ['name', 'amount', 'owner', 'category', 'recurrence', 'day_of_month', 'active', 'notes', 'start_date']
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if (update.amount !== undefined) update.amount = Number(update.amount)
  if (update.day_of_month !== undefined) update.day_of_month = Number(update.day_of_month)

  const { data, error } = await admin.supabase
    .from('finance_recurring_income')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

// DELETE /api/finance/recurring-income/:id — soft delete (set active=false)
// Hard delete only if ?hard=true
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  const { id } = await params
  const admin = adminOrError()
  if ('response' in admin) return admin.response

  const hard = req.nextUrl.searchParams.get('hard') === 'true'

  if (hard) {
    const { error } = await admin.supabase
      .from('finance_recurring_income')
      .delete()
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  }

  // Soft delete — deactivate only
  const { data, error } = await admin.supabase
    .from('finance_recurring_income')
    .update({ active: false })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data, deactivated: true })
}
