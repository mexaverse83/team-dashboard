import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { learnRulesFromHistory } from '@/lib/finance-rules'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// GET: list all rules
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const { data, error } = await supabase
    .from('finance_rules')
    .select('*')
    .order('priority', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data || [] })
}

// POST: create a rule (or run "learn from history" with action=learn)
export async function POST(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({}))
  const action = body.action

  // ── Learn rules from transaction history ────────────────────────────────
  if (action === 'learn') {
    const minOccurrences = body.min_occurrences ?? 3
    const confidenceThreshold = body.confidence_threshold ?? 0.8

    // Fetch all expense transactions (limit to last 12 months for performance)
    const since = new Date()
    since.setMonth(since.getMonth() - 12)
    const { data: txs, error: txErr } = await supabase
      .from('finance_transactions')
      .select('merchant, category_id, amount_mxn, type, transaction_date')
      .gte('transaction_date', since.toISOString().slice(0, 10))
      .eq('type', 'expense')

    if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

    const proposals = learnRulesFromHistory(txs || [], { minOccurrences, confidenceThreshold })

    if (body.dry_run) {
      // Enrich with category names
      const { data: cats } = await supabase.from('finance_categories').select('id, name, icon, color')
      const catMap = new Map((cats || []).map(c => [c.id, c]))
      return NextResponse.json({
        proposals: proposals.map(p => ({
          ...p,
          category: catMap.get(p.category_id) ? { name: catMap.get(p.category_id)!.name, icon: catMap.get(p.category_id)!.icon } : null,
        })),
      })
    }

    // Persist proposals as rules — skip ones that already exist
    const { data: existing } = await supabase
      .from('finance_rules')
      .select('merchant_pattern')
    const existingPatterns = new Set((existing || []).map(r => r.merchant_pattern.toLowerCase()))

    const toInsert = proposals
      .filter(p => !existingPatterns.has(p.merchant_pattern.toLowerCase()))
      .map(p => ({
        merchant_pattern: p.merchant_pattern,
        match_mode: 'contains' as const,
        category_id: p.category_id,
        priority: 100,
        is_active: true,
        learned: true,
        notes: `Learned from ${p.occurrences} transactions (${Math.round(p.confidence * 100)}% confidence)`,
      }))

    if (toInsert.length === 0) {
      return NextResponse.json({ created: 0, skipped: proposals.length, message: 'No new rules — all already exist' })
    }

    const { data: inserted, error: insErr } = await supabase
      .from('finance_rules')
      .insert(toInsert)
      .select()

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    return NextResponse.json({
      created: inserted?.length || 0,
      skipped: proposals.length - (inserted?.length || 0),
      proposals,
    })
  }

  // ── Manual rule creation ───────────────────────────────────────────────
  const requiredFields = ['merchant_pattern', 'category_id']
  for (const f of requiredFields) {
    if (!body[f]) return NextResponse.json({ error: `Missing field: ${f}` }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('finance_rules')
    .insert({
      merchant_pattern: body.merchant_pattern,
      match_mode: body.match_mode || 'contains',
      amount_min: body.amount_min ?? null,
      amount_max: body.amount_max ?? null,
      owner: body.owner ?? null,
      category_id: body.category_id,
      tags: body.tags || [],
      priority: body.priority ?? 100,
      is_active: body.is_active ?? true,
      learned: false,
      notes: body.notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}

// PATCH: update a rule
export async function PATCH(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { id, ...updates } = body
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('finance_rules')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rule: data })
}

// DELETE: remove a rule
export async function DELETE(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('finance_rules')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
