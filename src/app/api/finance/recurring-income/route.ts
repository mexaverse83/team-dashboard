import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

// GET /api/finance/recurring-income — list all (active first, then inactive)
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const { data, error } = await getSupabase()
    .from('finance_recurring_income')
    .select('*')
    .order('active', { ascending: false })
    .order('amount', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST /api/finance/recurring-income — create new entry
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, amount, owner, category, recurrence, day_of_month, active, notes } = body

  if (!name || amount === undefined || !owner || !category || !recurrence || !day_of_month) {
    return NextResponse.json({ error: 'Missing required fields: name, amount, owner, category, recurrence, day_of_month' }, { status: 400 })
  }

  const { data, error } = await getSupabase()
    .from('finance_recurring_income')
    .insert({
      name,
      amount: Number(amount),
      owner,
      category,
      recurrence,
      day_of_month: Number(day_of_month),
      active: active !== false,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
