import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

function isAuthorized(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes(req.nextUrl.host)
  return isSameOrigin || (!!key && key === expected)
}

// PUT /api/finance/recurring-income/:id — update entry
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowedFields = ['name', 'amount', 'owner', 'category', 'recurrence', 'day_of_month', 'active', 'notes']
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if (update.amount !== undefined) update.amount = Number(update.amount)
  if (update.day_of_month !== undefined) update.day_of_month = Number(update.day_of_month)

  const { data, error } = await getSupabase()
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
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const hard = req.nextUrl.searchParams.get('hard') === 'true'

  if (hard) {
    const { error } = await getSupabase()
      .from('finance_recurring_income')
      .delete()
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  }

  // Soft delete — deactivate only
  const { data, error } = await getSupabase()
    .from('finance_recurring_income')
    .update({ active: false })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data, deactivated: true })
}
