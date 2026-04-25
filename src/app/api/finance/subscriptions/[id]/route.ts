import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
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
