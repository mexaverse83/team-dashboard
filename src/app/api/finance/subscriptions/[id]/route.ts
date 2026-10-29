import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'

// Service role in production; a missing key answers 503 instead of RLS-empty data.
function getSupabase() {
  return getAdminClient()
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  try {
    getSupabase()
  } catch (err) {
    return configErrorResponse(err)
  }
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
