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
async function processRecurring(req: NextRequest) {
  // Auth: x-api-key OR Vercel cron secret
  const key = req.headers.get('x-api-key')
  const authHeader = req.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  const isApiKey = key && key === expected
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isApiKey && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const results = { subscriptions: 0, income: 0, installments: 0, debt_payments: 0, skipped: 0, errors: [] as string[] }

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

        // ── DEBT SYNC: if subscription is linked to a debt, update balance ──
        if (sub.debt_id) {
          try {
            const { data: debt } = await supabase
              .from('finance_debts')
              .select('*')
              .eq('id', sub.debt_id)
              .single()

            if (debt && debt.balance > 0) {
              const monthlyRate = (debt.interest_rate || 0) / 100 / 12
              const interestPortion = Math.round(debt.balance * monthlyRate * 100) / 100
              const principalPortion = Math.round((sub.amount - interestPortion) * 100) / 100
              const newBalance = Math.max(0, Math.round((debt.balance - principalPortion) * 100) / 100)

              // Log the payment split
              await supabase.from('finance_debt_payments').insert({
                debt_id: sub.debt_id,
                payment_date: sub.next_due_date,
                amount: sub.amount,
                principal_portion: principalPortion,
                interest_portion: interestPortion,
                remaining_balance: newBalance,
              })

              // Update debt balance
              await supabase.from('finance_debts')
                .update({ balance: newBalance })
                .eq('id', sub.debt_id)

              // Auto-deactivate debt if paid off
              if (newBalance <= 0) {
                await supabase.from('finance_debts')
                  .update({ is_active: false })
                  .eq('id', sub.debt_id)
              }

              results.debt_payments++
            }
          } catch (e) {
            results.errors.push(`Debt sync ${sub.name}: ${(e as Error).message}`)
          }
        }
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
    debt_payments_processed: results.debt_payments,
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
  const month = now.getMonth() // 0-indexed
  switch (frequency) {
    case 'monthly': return true // Post every month (idempotency prevents dupes)
    case 'biweekly': return true // Always eligible
    case 'weekly': return true
    case 'quarterly': return month % 3 === 0
    case 'yearly': return month === 0
    default: return true
  }
}

// Vercel cron calls GET — wire both methods to the processor
export async function GET(req: NextRequest) {
  return processRecurring(req)
}

export async function POST(req: NextRequest) {
  return processRecurring(req)
}
