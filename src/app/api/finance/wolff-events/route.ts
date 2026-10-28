import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { assessUnexpectedTransaction } from '@/lib/wolff-events'
import { isValidDateKey, mexicoCityToday, nextMonthStartKey } from '@/lib/dates'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { recordRun } from '@/lib/automation/runs'

interface TransactionEventBody {
  event_id?: string
  /** The transaction's own id — the stable dedupe key for created/updated events. */
  transaction_id?: string
  /** Imported transaction ids; their hash is the dedupe key for an import. */
  import_ids?: string[]
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

// What Mona should weigh for any surprise expense now that the fertility plan
// is complete: near-term liquidity for the baby plan and this month's WEST transfer.
const PLAN_CONTEXT = "today's safe spending, the current calendar-week envelope, baby-plan liquidity (prenatal and birth costs), this month's WEST/GBM transfer, or combined goal pace"

function eventIdFor(body: TransactionEventBody): string {
  if (body.kind === 'imported' && Array.isArray(body.import_ids) && body.import_ids.length) {
    const digest = createHash('sha256').update([...body.import_ids].map(String).sort().join(',')).digest('hex').slice(0, 32)
    return `import-${digest}`
  }
  return String(body.event_id || body.transaction_id || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)
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

  let supabase: SupabaseClient
  try {
    supabase = getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }
  const startedAt = new Date()
  const unavailable = async (message: string) => {
    await recordRun(supabase, { job: 'wolff-events', trigger: 'event', started_at: startedAt, status: 'error', error: message })
    return NextResponse.json({ error: 'Financial data is temporarily unavailable', detail: message }, { status: 503 })
  }
  const queue = async (content: string, askedBy: string) => {
    const { error } = await supabase.from('finance_wolff_chat').insert({ role: 'user', content, status: 'pending', asked_by: askedBy })
    if (error) {
      await recordRun(supabase, { job: 'wolff-events', trigger: 'event', started_at: startedAt, status: 'error', error: error.message })
      return error.message
    }
    await recordRun(supabase, { job: 'wolff-events', trigger: 'event', started_at: startedAt, status: 'ok', created_count: 1, details: { asked_by: askedBy } })
    return null
  }

  const askedBy = `wolff-monitor:${eventIdFor(body)}`
  const { data: duplicate, error: duplicateError } = await supabase.from('finance_wolff_chat').select('id').eq('asked_by', askedBy).limit(1)
  if (duplicateError) return unavailable(`duplicate check: ${duplicateError.message}`)
  if (duplicate?.length) return NextResponse.json({ queued: false, reason: 'duplicate' })

  if (body.kind === 'imported') {
    const total = Math.max(0, Number(body.import_total) || 0)
    const count = Math.max(0, Number(body.import_count) || 0)
    if (total < 5_000 || count === 0) return NextResponse.json({ queued: false, reason: 'routine import' })

    const content = `AUTOMATIC TRANSACTION EVENT: ${count} newly imported expenses total ${Math.round(total).toLocaleString()} MXN. Review the live plan now. State whether this changes ${PLAN_CONTEXT}. If it creates pressure, propose one realistic trade-off; if the plan absorbs it, say so clearly. This was detected automatically—be proactive and human.`
    const error = await queue(content, askedBy)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ queued: true, severity: 'attention' })
  }

  const amount = Math.max(0, Number(body.amount_mxn) || 0)
  if (!amount) return NextResponse.json({ queued: false, reason: 'no expense amount' })

  // Month bounds on the household calendar; `.lt(next month start)` is valid
  // for every month length (no `-31` dates that Postgres rejects).
  const date = body.transaction_date && isValidDateKey(body.transaction_date.slice(0, 10))
    ? body.transaction_date.slice(0, 10)
    : mexicoCityToday()
  const month = date.slice(0, 7)
  const monthStart = `${month}-01`
  const nextMonthStart = nextMonthStartKey(month)
  const empty = Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null })
  const [categoryResult, budgetResult, monthResult, recentResult, merchantResult] = await Promise.all([
    body.category_id
      ? supabase.from('finance_categories').select('name').eq('id', body.category_id).limit(1)
      : empty,
    body.category_id
      ? supabase.from('finance_budgets').select('amount,month').eq('category_id', body.category_id).lt('month', nextMonthStart).order('month', { ascending: false }).limit(1)
      : empty,
    body.category_id
      ? supabase.from('finance_transactions').select('amount_mxn').eq('type', 'expense').eq('category_id', body.category_id).gte('transaction_date', monthStart).lt('transaction_date', nextMonthStart)
      : empty,
    body.category_id
      ? supabase.from('finance_transactions').select('amount_mxn').eq('type', 'expense').eq('category_id', body.category_id).order('transaction_date', { ascending: false }).limit(24)
      : empty,
    body.merchant
      ? supabase.from('finance_transactions').select('id').ilike('merchant', body.merchant).limit(2)
      : empty,
  ])
  // A failed lookup reads as "no budget" and would raise a false alarm.
  const lookupError = [categoryResult, budgetResult, monthResult, recentResult, merchantResult].find(r => r.error)?.error
  if (lookupError) return unavailable(`lookup: ${lookupError.message}`)

  const categoryName = body.category_name || (categoryResult.data?.[0]?.name as string | undefined) || 'Uncategorized'
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

  const content = `AUTOMATIC TRANSACTION EVENT: A new ${Math.round(amount).toLocaleString()} MXN expense at ${body.merchant || 'an unnamed merchant'} was recorded in ${categoryName} on ${body.transaction_date || 'today'}. It was flagged because: ${assessment.reasons.join('; ')}. The category is now at ${Math.round(categoryMonthSpend).toLocaleString()} MXN against a ${Math.round(categoryBudget).toLocaleString()} MXN budget. Review the live household plan and explain the real impact on ${PLAN_CONTEXT}. Give one practical adjustment—such as a dining, shopping, or entertainment trade-off—only if needed. This is an automatic proactive alert, so lead with a calm verdict and speak like a trusted personal financial assistant.`
  const error = await queue(content, askedBy)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ queued: true, severity: assessment.severity, reasons: assessment.reasons })
}
