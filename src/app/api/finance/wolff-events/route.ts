import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { assessUnexpectedTransaction } from '@/lib/wolff-events'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
)

interface TransactionEventBody {
  event_id?: string
  kind?: 'created' | 'updated' | 'imported'
  type?: 'expense' | 'income'
  amount_mxn?: number
  category_id?: string | null
  category_name?: string | null
  merchant?: string | null
  transaction_date?: string | null
  is_recurring?: boolean
  import_count?: number
  import_total?: number
}

export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  let body: TransactionEventBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  if (body.type === 'income') return NextResponse.json({ queued: false, reason: 'income' })

  const eventId = String(body.event_id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
  const askedBy = `wolff-monitor:${eventId}`
  const { data: duplicate } = await supabase.from('finance_wolff_chat').select('id').eq('asked_by', askedBy).limit(1)
  if (duplicate?.length) return NextResponse.json({ queued: false, reason: 'duplicate' })

  if (body.kind === 'imported') {
    const total = Math.max(0, Number(body.import_total) || 0)
    const count = Math.max(0, Number(body.import_count) || 0)
    if (total < 5_000 || count === 0) return NextResponse.json({ queued: false, reason: 'routine import' })

    const content = `AUTOMATIC TRANSACTION EVENT: ${count} newly imported expenses total ${Math.round(total).toLocaleString()} MXN. Review the live plan now. State whether this changes today's safe spending, the current calendar-week envelope, July treatment liquidity, WEST funding, or combined goal pace. If it creates pressure, propose one realistic trade-off; if the plan absorbs it, say so clearly. This was detected automatically—be proactive and human.`
    const { error } = await supabase.from('finance_wolff_chat').insert({ role: 'user', content, status: 'pending', asked_by: askedBy })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ queued: true, severity: 'attention' })
  }

  const amount = Math.max(0, Number(body.amount_mxn) || 0)
  if (!amount) return NextResponse.json({ queued: false, reason: 'no expense amount' })

  const month = (body.transaction_date || new Date().toISOString().slice(0, 10)).slice(0, 7)
  const monthStart = `${month}-01`
  const monthEnd = `${month}-31`
  const [categoryResult, budgetResult, monthResult, recentResult, merchantResult] = await Promise.all([
    body.category_id
      ? supabase.from('finance_categories').select('name').eq('id', body.category_id).limit(1)
      : Promise.resolve({ data: [] }),
    body.category_id
      ? supabase.from('finance_budgets').select('amount,month').eq('category_id', body.category_id).lte('month', monthEnd).order('month', { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
    body.category_id
      ? supabase.from('finance_transactions').select('amount_mxn').eq('type', 'expense').eq('category_id', body.category_id).gte('transaction_date', monthStart).lte('transaction_date', monthEnd)
      : Promise.resolve({ data: [] }),
    body.category_id
      ? supabase.from('finance_transactions').select('amount_mxn').eq('type', 'expense').eq('category_id', body.category_id).order('transaction_date', { ascending: false }).limit(24)
      : Promise.resolve({ data: [] }),
    body.merchant
      ? supabase.from('finance_transactions').select('id').ilike('merchant', body.merchant).limit(2)
      : Promise.resolve({ data: [] }),
  ])

  const categoryName = body.category_name || categoryResult.data?.[0]?.name || 'Uncategorized'
  const categoryBudget = Number(budgetResult.data?.[0]?.amount) || 0
  const categoryMonthSpend = (monthResult.data || []).reduce((sum, tx) => sum + (Number(tx.amount_mxn) || 0), 0)
  const recentAmounts = (recentResult.data || []).map(tx => Number(tx.amount_mxn) || 0)
  const merchantSeenBefore = body.merchant ? (merchantResult.data?.length || 0) > 1 : undefined
  const assessment = assessUnexpectedTransaction({
    amount,
    isRecurring: body.is_recurring,
    merchant: body.merchant,
    categoryName,
    categoryMonthSpend,
    categoryBudget,
    recentCategoryAmounts: recentAmounts,
    merchantSeenBefore,
  })

  if (!assessment.unexpected) return NextResponse.json({ queued: false, reason: 'within normal pattern' })

  const content = `AUTOMATIC TRANSACTION EVENT: A new ${Math.round(amount).toLocaleString()} MXN expense at ${body.merchant || 'an unnamed merchant'} was recorded in ${categoryName} on ${body.transaction_date || 'today'}. It was flagged because: ${assessment.reasons.join('; ')}. The category is now at ${Math.round(categoryMonthSpend).toLocaleString()} MXN against a ${Math.round(categoryBudget).toLocaleString()} MXN budget. Review the live household plan and explain the real impact on today's safe spending, this calendar week, treatment liquidity, WEST, and combined goals. Give one practical adjustment—such as a dining, shopping, or entertainment trade-off—only if needed. This is an automatic proactive alert, so lead with a calm verdict and speak like a trusted personal financial assistant.`
  const { error } = await supabase.from('finance_wolff_chat').insert({ role: 'user', content, status: 'pending', asked_by: askedBy })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ queued: true, severity: assessment.severity, reasons: assessment.reasons })
}
