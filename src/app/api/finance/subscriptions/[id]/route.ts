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
  const origin = req.headers.get('origin') || ''
  const host = req.nextUrl.host
  const isSameOrigin = (referer && referer.includes(host)) || (origin && origin.includes(host))
  return isSameOrigin || (!!key && key === expected)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = getSupabase()

  // Unlink transactions first (nullify FK, keep transaction history)
  await supabase
    .from('finance_transactions')
    .update({ recurring_id: null })
    .eq('recurring_id', id)

  const { error } = await supabase
    .from('finance_recurring')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
