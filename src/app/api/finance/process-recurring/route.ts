import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const FREQ_DAYS: Record<string, number> = {
  weekly: 7, biweekly: 14, monthly: 30, quarterly: 90, yearly: 365,
}

/**
 * POST /api/finance/process-recurring
 *
 * Processes all due recurring items and creates transactions:
 * 1. Subscriptions (finance_recurring) → expense transactions
 * 2. Income sources (finance_income_sources) → income transactions
 * 3. MSI installments (finance_installments) → expense transactions + increment payments_made
 *
 * Call daily via cron or WOLFF agent. Idempotent — won't double-post for same period.
 */
export async function POST(req: NextRequest) {
  // Auth
  const key = req.headers.get('x-api-key')
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || key !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const results = { subscriptions: 0, income: 0, installments: 0, skipped: 0, errors: [] as string[] }

  // ── 1. SUBSCRIPTIONS ──────────────────────────────────────────────
  const { data: subs } = await supabase
    .from('finance_recurring')
    .select('*')
    .eq('is_active', true)

  for (const sub of subs || []) {
    if (!sub.next_due_date || sub.next_due_date > today) {
      results.skipped++
      continue
    }

    // Check if transaction already exists for this recurring + date (idempotent)
    const { data: existing } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('recurring_id', sub.id)
      .eq('transaction_date', sub.next_due_date)
      .limit(1)

    if (existing && existing.length > 0) {
      results.skipped++
    } else {
      // Create transaction
      const { error } = await supabase.from('finance_transactions').insert({
        type: 'expense',
        amount: sub.amount,
        currency: sub.currency || 'MXN',
        amount_mxn: sub.amount,
        category_id: sub.category_id,
        merchant: sub.merchant || sub.name,
        description: `Auto: ${sub.name} (recurring)`,
        transaction_date: sub.next_due_date,
        is_recurring: true,
        recurring_id: sub.id,
        tags: ['auto-recurring'],
        owner: sub.owner,
      })
      if (error) {
        results.errors.push(`Sub ${sub.name}: ${error.message}`)
      } else {
        results.subscriptions++
      }
    }

    // Advance next_due_date
    const nextDate = advanceDate(sub.next_due_date, sub.frequency)
    await supabase.from('finance_recurring').update({ next_due_date: nextDate }).eq('id', sub.id)
  }

  // ── 2. INCOME SOURCES ─────────────────────────────────────────────
  const { data: incomes } = await supabase
    .from('finance_income_sources')
    .select('*')
    .eq('is_active', true)

  // Find "Income" category
  const { data: incomeCats } = await supabase
    .from('finance_categories')
    .select('id')
    .eq('type', 'income')
    .limit(1)
  const incomeCatId = incomeCats?.[0]?.id || null

  for (const inc of incomes || []) {
    // Check if income already posted this month
    const monthStr = today.slice(0, 7)
    const { data: existing } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('type', 'income')
      .eq('merchant', inc.name)
      .gte('transaction_date', `${monthStr}-01`)
      .lte('transaction_date', `${monthStr}-31`)
      .limit(1)

    if (existing && existing.length > 0) {
      results.skipped++
      continue
    }

    // Only post if frequency matches current timing
    if (!shouldPostIncome(inc.frequency, now)) {
      results.skipped++
      continue
    }

    const { error } = await supabase.from('finance_transactions').insert({
      type: 'income',
      amount: inc.amount,
      currency: inc.currency || 'MXN',
      amount_mxn: inc.amount,
      category_id: incomeCatId,
      merchant: inc.name,
      description: `Auto: ${inc.name} (${inc.type})`,
      transaction_date: today,
      is_recurring: true,
      tags: ['auto-income'],
      owner: null, // Income is shared by default
    })
    if (error) {
      results.errors.push(`Income ${inc.name}: ${error.message}`)
    } else {
      results.income++
    }
  }

  // ── 3. MSI INSTALLMENTS ───────────────────────────────────────────
  const { data: installments } = await supabase
    .from('finance_installments')
    .select('*')
    .eq('is_active', true)

  for (const msi of installments || []) {
    if (msi.payments_made >= msi.installment_count) {
      // Mark complete
      await supabase.from('finance_installments').update({ is_active: false }).eq('id', msi.id)
      results.skipped++
      continue
    }

    // Check if payment already posted this month
    const monthStr = today.slice(0, 7)
    const { data: existing } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('merchant', `MSI: ${msi.name}`)
      .gte('transaction_date', `${monthStr}-01`)
      .lte('transaction_date', `${monthStr}-31`)
      .limit(1)

    if (existing && existing.length > 0) {
      results.skipped++
      continue
    }

    // Post monthly installment payment
    const { error } = await supabase.from('finance_transactions').insert({
      type: 'expense',
      amount: msi.installment_amount,
      currency: 'MXN',
      amount_mxn: msi.installment_amount,
      category_id: msi.category_id,
      merchant: `MSI: ${msi.name}`,
      description: `Auto: ${msi.name} (${msi.payments_made + 1}/${msi.installment_count}) - ${msi.merchant || ''}`,
      transaction_date: today,
      is_recurring: true,
      tags: ['auto-msi'],
      owner: msi.owner,
    })
    if (error) {
      results.errors.push(`MSI ${msi.name}: ${error.message}`)
    } else {
      // Increment payments_made
      await supabase.from('finance_installments')
        .update({ payments_made: msi.payments_made + 1 })
        .eq('id', msi.id)
      results.installments++
    }
  }

  return NextResponse.json({
    processed_at: now.toISOString(),
    results,
    total_created: results.subscriptions + results.income + results.installments,
  })
}

function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  switch (frequency) {
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'biweekly': d.setDate(d.getDate() + 14); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
  }
  return d.toISOString().slice(0, 10)
}

function shouldPostIncome(frequency: string, now: Date): boolean {
  const day = now.getDate()
  switch (frequency) {
    case 'monthly': return day >= 1 && day <= 5 // Post in first 5 days of month
    case 'biweekly': return day <= 3 || (day >= 14 && day <= 17) // 1st and 15th windows
    case 'weekly': return true // Always eligible
    case 'quarterly': return (now.getMonth() % 3 === 0) && day <= 5
    case 'yearly': return now.getMonth() === 0 && day <= 5
    default: return day <= 5
  }
}

// Also support GET for status check
export async function GET(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer.includes(req.nextUrl.host)
  if (!isSameOrigin && (!key || key !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)

  const [{ count: subsCount }, { count: incomeCount }, { count: msiCount }] = await Promise.all([
    supabase.from('finance_recurring').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('finance_income_sources').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('finance_installments').select('*', { count: 'exact', head: true }).eq('is_active', true),
  ])

  // Check last auto-transaction
  const { data: lastAuto } = await supabase
    .from('finance_transactions')
    .select('transaction_date, description')
    .contains('tags', ['auto-recurring'])
    .order('created_at', { ascending: false })
    .limit(1)

  return NextResponse.json({
    status: 'ready',
    today,
    active_subscriptions: subsCount || 0,
    active_income_sources: incomeCount || 0,
    active_installments: msiCount || 0,
    last_auto_transaction: lastAuto?.[0] || null,
  })
}
