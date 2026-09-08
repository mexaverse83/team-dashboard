import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { advanceRecurringDate } from '@/lib/recurring-dates'
import { mexicoCityDateParts } from '@/lib/insights-prompt.mjs'
import { canonicalOwner } from '@/lib/owners'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

/**
 * POST /api/finance/process-recurring
 *
 * Processes all due recurring items and creates transactions:
 * 1. Subscriptions (finance_recurring) → expense transactions
 * 2. Income sources (finance_income_sources) → income transactions
 * 3. MSI installments (finance_installments) → expense transactions + increment payments_made
 *
 * Call daily via cron or MONA agent. Run one processor at a time; subscription
 * duplicate checks are application-level. Month-close is atomic in PostgreSQL.
 */
async function processRecurring(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response

  const instant = new Date()
  const mx = mexicoCityDateParts(instant)
  const now = new Date(Date.UTC(mx.year, mx.month - 1, mx.day, 12))
  const today = now.toISOString().slice(0, 10)
  const monthStr = today.slice(0, 7)
  const monthStart = `${monthStr}-01`
  const lastDay = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate()
  const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`
  const results = { subscriptions: 0, income: 0, installments: 0, debt_payments: 0, budget_rollovers: 0, skipped: 0, errors: [] as string[] }

  // ── 1. SUBSCRIPTIONS ──────────────────────────────────────────────
  const { data: subs, error: subsError } = await supabase
    .from('finance_recurring')
    .select('*')
    .eq('is_active', true)

  if (subsError) results.errors.push(`Subscriptions fetch: ${subsError.message}`)

  for (const sub of subs || []) {
    if (!['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(sub.frequency)) {
      results.errors.push(`Sub ${sub.name}: unsupported recurrence`)
      continue
    }
    if (sub.currency && sub.currency !== 'MXN') {
      results.errors.push(`Sub ${sub.name}: foreign-currency posting requires an explicit MXN conversion`)
      continue
    }
    if (!sub.next_due_date || sub.next_due_date > today) {
      results.skipped++
      continue
    }

    // Catch-up loop: process ALL missed periods (not just one) so that
    // subscriptions don't fall behind if the cron missed a day or more.
    let dueDate = sub.next_due_date
    const MAX_CATCHUP = 12 // safety cap to prevent runaway loops

    for (let i = 0; i < MAX_CATCHUP && dueDate <= today; i++) {
      // Check if transaction already exists for this recurring + date (idempotent)
      const { data: existing, error: duplicateError } = await supabase
        .from('finance_transactions')
        .select('id')
        .eq('recurring_id', sub.id)
        .eq('transaction_date', dueDate)
        .limit(1)

      if (duplicateError) {
        results.errors.push(`Sub duplicate check ${sub.name}: ${duplicateError.message}`)
        break
      }
      if (existing && existing.length > 0) {
        // Transaction already exists for this date — skip to next period
        dueDate = advanceRecurringDate(dueDate, sub.frequency, Number(sub.next_due_date.slice(8, 10)))
        continue
      }

      // Price-change detection: compare against the most recent prior recurring tx
      const flags: string[] = []
      const { data: lastTxs } = await supabase
        .from('finance_transactions')
        .select('amount, transaction_date')
        .eq('recurring_id', sub.id)
        .order('transaction_date', { ascending: false })
        .limit(1)
      const lastTx = lastTxs?.[0]
      if (lastTx && Math.abs(lastTx.amount - sub.amount) / Math.max(lastTx.amount, 1) > 0.05) {
        flags.push('price_changed')
      }

      // Create transaction
      const { error } = await supabase.from('finance_transactions').insert({
        type: 'expense',
        amount: sub.amount,
        currency: sub.currency || 'MXN',
        amount_mxn: sub.amount,
        category_id: sub.category_id,
        merchant: sub.merchant || sub.name,
        description: flags.includes('price_changed') && lastTx
          ? `Auto: ${sub.name} (price changed from $${lastTx.amount} → $${sub.amount})`
          : `Auto: ${sub.name} (recurring)`,
        transaction_date: dueDate,
        is_recurring: true,
        recurring_id: sub.id,
        tags: ['auto-recurring'],
        flags: flags.length > 0 ? flags : null,
        owner: canonicalOwner(sub.owner),
      })
      if (error) {
        // Do NOT advance date on failure — allow retry on next cron run
        results.errors.push(`Sub ${sub.name}: ${error.message}`)
        break
      }

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
              payment_date: dueDate,
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

      // Advance to next period for the loop
      dueDate = advanceRecurringDate(dueDate, sub.frequency, Number(sub.next_due_date.slice(8, 10)))
    }

    // Persist the final next_due_date (after all catch-up periods processed)
    if (dueDate !== sub.next_due_date) {
      await supabase.from('finance_recurring').update({ next_due_date: dueDate }).eq('id', sub.id)
    }
  }

  // ── 2. INCOME SOURCES ─────────────────────────────────────────────
  const { data: incomes, error: incomesError } = await supabase
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

  if (incomesError) results.errors.push(`Income fetch: ${incomesError.message}`)
  for (const inc of incomes || []) {
    if (inc.currency && inc.currency !== 'MXN') {
      results.errors.push(`Income ${inc.name}: foreign-currency posting requires an explicit MXN conversion`)
      continue
    }
    // Check if income already posted this month
    const { data: existing, error: duplicateError } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('type', 'income')
      .eq('merchant', inc.name)
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd)
      .limit(1)

    if (duplicateError) {
      results.errors.push(`Income duplicate check: ${duplicateError.message}`)
      continue
    }
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

  // ── 3. RECURRING INCOME (finance_recurring_income) ───────────────
  // Fetch ALL active recurring income — not filtered by day_of_month — so that
  // catch-up works when the cron fires late or on a different day than expected.
  const { data: recurringIncomes, error: recurringIncomeErr } = await supabase
    .from('finance_recurring_income')
    .select('*')
    .eq('active', true)

  // Surface a fetch failure instead of silently posting $0 income and still
  // returning success — a swallowed error here is exactly how month-start
  // payroll goes missing with no trace.
  if (recurringIncomeErr) {
    results.errors.push(`RecurringIncome fetch: ${recurringIncomeErr.message}`)
  }

  for (const ri of recurringIncomes || []) {
    // Only process monthly for now (bimonthly/annual need custom cadence logic)
    if (ri.recurrence !== 'monthly') {
      results.skipped++
      continue
    }

    // Skip if start_date hasn't arrived yet
    if (ri.start_date && ri.start_date > today) {
      results.skipped++
      continue
    }

    // Duplicate guard: skip if already registered this month
    const { data: existing, error: duplicateError } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('source', 'recurring_income')
      .eq('merchant', ri.name)
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd)
      .limit(1)

    if (duplicateError) {
      results.errors.push(`Income duplicate check: ${duplicateError.message}`)
      continue
    }
    if (existing && existing.length > 0) {
      results.skipped++
      continue
    }

    const { error } = await supabase.from('finance_transactions').insert({
      type: 'income',
      amount: ri.amount,
      currency: 'MXN',
      amount_mxn: ri.amount,
      category_id: incomeCatId,
      merchant: ri.name,
      description: `Auto: ${ri.name} (${ri.category})`,
      transaction_date: today,
      is_recurring: true,
      tags: ['auto-income', 'recurring-income'],
      source: 'recurring_income',
      owner: canonicalOwner(ri.owner),
    })
    if (error) {
      results.errors.push(`RecurringIncome ${ri.name}: ${error.message}`)
    } else {
      results.income++
    }
  }

  // ── 4. MSI INSTALLMENTS ───────────────────────────────────────────
  // Fully automated: inserts one expense transaction per installment per month
  // until all payments are made. Idempotent via installment_id dupe guard.

  const { data: installments, error: installmentError } = await supabase
    .from('finance_installments')
    .select('*')
    .eq('is_active', true)
    .lte('start_date', today)  // only installments that have started

  if (installmentError) results.errors.push(`Installments fetch: ${installmentError.message}`)
  for (const msi of installments || []) {
    // Complete check: mark inactive and skip
    if (msi.payments_made >= msi.installment_count) {
      await supabase.from('finance_installments').update({ is_active: false }).eq('id', msi.id)
      results.skipped++
      continue
    }

    // Dupe guard: check by installment_id first, fallback to merchant name
    const dupeQuery = msi.id
      ? supabase.from('finance_transactions').select('id').eq('installment_id', msi.id)
          .gte('transaction_date', monthStart).lte('transaction_date', monthEnd).limit(1)
      : supabase.from('finance_transactions').select('id').eq('merchant', `MSI: ${msi.name}`)
          .gte('transaction_date', monthStart).lte('transaction_date', monthEnd).limit(1)

    const { data: existing, error: dupeErr } = await dupeQuery
    if (dupeErr) {
      // If dupe check fails, skip to be safe — never insert when we can't verify
      results.errors.push(`MSI dupe check ${msi.name}: ${dupeErr.message}`)
      continue
    }
    if (existing && existing.length > 0) {
      results.skipped++
      continue
    }

    const paymentNum = msi.payments_made + 1
    const { error } = await supabase.from('finance_transactions').insert({
      type: 'expense',
      amount: msi.installment_amount,
      currency: 'MXN',
      amount_mxn: msi.installment_amount,
      category_id: msi.category_id,
      merchant: `MSI: ${msi.name}`,
      description: `Auto-MSI: ${msi.name} (${paymentNum}/${msi.installment_count})${msi.merchant ? ` — ${msi.merchant}` : ''}`,
      transaction_date: today,
      is_recurring: true,
      tags: ['auto-msi'],
      owner: canonicalOwner(msi.owner),
      installment_id: msi.id,   // requires finance-installments-sync migration
    })

    if (error) {
      // If installment_id column doesn't exist yet (migration pending), log but don't block
      const msg = error.message.includes('installment_id')
        ? `MSI ${msi.name}: installment_id column missing — run finance-installments-sync migration`
        : `MSI ${msi.name}: ${error.message}`
      results.errors.push(msg)
    } else {
      await supabase.from('finance_installments')
        .update({ payments_made: paymentNum })
        .eq('id', msi.id)
      results.installments++
    }
  }

  // ── 5. BUDGET ROLLOVER ──────────────────────────────────────────
  // If current month has no budgets yet, copy all rows from previous month.
  // Idempotent: skips entirely if any budget row already exists for this month.
  // Runs any day (not just 1st) so catch-up works when cron misses the 1st.
  {
    const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
    const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
    const prevMonthStr = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}-01`

    // Check if current month already has budgets
    const { data: existingBudgets, error: budgetCheckError } = await supabase
      .from('finance_budgets')
      .select('id')
      .eq('month', currentMonthStr)
      .limit(1)

    if (budgetCheckError) results.errors.push(`Budget rollover check: ${budgetCheckError.message}`)
    if (!budgetCheckError && (!existingBudgets || existingBudgets.length === 0)) {
      // Fetch previous month's budgets
      const { data: prevBudgets, error: prevErr } = await supabase
        .from('finance_budgets')
        .select('category_id, amount, owner')
        .eq('month', prevMonthStr)

      if (prevErr) {
        results.errors.push(`Budget rollover fetch: ${prevErr.message}`)
      } else if (prevBudgets && prevBudgets.length > 0) {
        const newRows = prevBudgets.map(b => ({
          category_id: b.category_id,
          amount: b.amount,
          owner: b.owner ?? null,
          month: currentMonthStr,
        }))

        const { error: insertErr } = await supabase
          .from('finance_budgets')
          .insert(newRows)

        if (insertErr) {
          results.errors.push(`Budget rollover insert: ${insertErr.message}`)
        } else {
          results.budget_rollovers = newRows.length
        }
      }
    }
  }

  // Close each missing month in one database transaction. Missing migration
  // or any write failure leaves that month retryable, with no partial credit.
  if (results.errors.length > 0) {
    results.errors.push('Month close deferred until recurring processing succeeds')
  } else {
    const { data: latestSnap, error: latestSnapError } = await supabase
      .from('finance_monthly_savings').select('month').eq('owner', 'total')
      .order('month', { ascending: false }).limit(1)
    if (latestSnapError) {
      results.errors.push(`Savings cursor: ${latestSnapError.message}`)
    } else {
      const cursor = latestSnap?.[0]?.month
        ? new Date(`${latestSnap[0].month}T12:00:00Z`)
        : new Date(Date.UTC(mx.year, mx.month - 5, 1, 12))
      cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      const currentMonth = new Date(Date.UTC(mx.year, mx.month - 1, 1, 12))
      while (cursor < currentMonth) {
        const month = cursor.toISOString().slice(0, 10)
        const { error } = await supabase.rpc('finance_close_month', { p_month: month })
        if (error) {
          results.errors.push(`Month close ${month}: ${error.message}. Requires supabase-finance-atomic-month-close.sql`)
          break
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + 1)
      }
    }

  }

  return NextResponse.json({
    processed_at: instant.toISOString(),
    results,
    total_created: results.subscriptions + results.income + results.installments,
    debt_payments_processed: results.debt_payments,
    budget_rollovers: results.budget_rollovers,
    ok: results.errors.length === 0,
  }, { status: results.errors.length ? 503 : 200, headers: { 'Cache-Control': 'no-store' } })
}

function shouldPostIncome(frequency: string, now: Date): boolean {
  const month = now.getUTCMonth() // 0-indexed
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
