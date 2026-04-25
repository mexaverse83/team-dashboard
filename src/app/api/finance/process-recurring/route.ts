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
  // Auth: x-api-key OR Vercel cron secret OR Vercel-Cron header OR same-origin (logged-in user)
  const key = req.headers.get('x-api-key')
  const authHeader = req.headers.get('authorization') || ''
  const isVercelCron = req.headers.get('x-vercel-cron') === '1'
  const cronSecret = process.env.CRON_SECRET
  const expected = process.env.FINANCE_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  const isApiKey = key && expected && key === expected
  const isCronSecret = cronSecret && authHeader === `Bearer ${cronSecret}`
  // x-vercel-cron header is sent by Vercel's scheduler — accept when CRON_SECRET not configured
  const isCronHeader = isVercelCron && !cronSecret
  // Allow same-origin POST from the dashboard UI (manual "Process Due" button)
  const referer = req.headers.get('referer') || ''
  const isSameOrigin = referer && req.nextUrl.host && new URL(referer).host === req.nextUrl.host

  if (!isApiKey && !isCronSecret && !isCronHeader && !isSameOrigin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const monthStr = today.slice(0, 7)
  const monthStart = `${monthStr}-01`
  const lastDay = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate()
  const monthEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`
  const results = { subscriptions: 0, income: 0, installments: 0, debt_payments: 0, budget_rollovers: 0, skipped: 0, errors: [] as string[] }

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

    // Catch-up loop: process ALL missed periods (not just one) so that
    // subscriptions don't fall behind if the cron missed a day or more.
    let dueDate = sub.next_due_date
    const MAX_CATCHUP = 12 // safety cap to prevent runaway loops

    for (let i = 0; i < MAX_CATCHUP && dueDate <= today; i++) {
      // Check if transaction already exists for this recurring + date (idempotent)
      const { data: existing } = await supabase
        .from('finance_transactions')
        .select('id')
        .eq('recurring_id', sub.id)
        .eq('transaction_date', dueDate)
        .limit(1)

      if (existing && existing.length > 0) {
        // Transaction already exists for this date — skip to next period
        dueDate = advanceDate(dueDate, sub.frequency)
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
        owner: sub.owner,
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
      dueDate = advanceDate(dueDate, sub.frequency)
    }

    // Persist the final next_due_date (after all catch-up periods processed)
    if (dueDate !== sub.next_due_date) {
      await supabase.from('finance_recurring').update({ next_due_date: dueDate }).eq('id', sub.id)
    }
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
    const { data: existing } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('type', 'income')
      .eq('merchant', inc.name)
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd)
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

  // ── 3. RECURRING INCOME (finance_recurring_income) ───────────────
  // Fetch ALL active recurring income — not filtered by day_of_month — so that
  // catch-up works when the cron fires late or on a different day than expected.
  const { data: recurringIncomes } = await supabase
    .from('finance_recurring_income')
    .select('*')
    .eq('active', true)

  for (const ri of recurringIncomes || []) {
    // Only process monthly for now (bimonthly/annual need custom cadence logic)
    if (ri.recurrence !== 'monthly') {
      results.skipped++
      continue
    }

    // Duplicate guard: skip if already registered this month
    const { data: existing } = await supabase
      .from('finance_transactions')
      .select('id')
      .eq('source', 'recurring_income')
      .eq('merchant', ri.name)
      .gte('transaction_date', monthStart)
      .lte('transaction_date', monthEnd)
      .limit(1)

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
      owner: ri.owner,
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

  const { data: installments } = await supabase
    .from('finance_installments')
    .select('*')
    .eq('is_active', true)
    .lte('start_date', today)  // only installments that have started

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
      owner: msi.owner,
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
    const { data: existingBudgets } = await supabase
      .from('finance_budgets')
      .select('id')
      .eq('month', currentMonthStr)
      .limit(1)

    if (!existingBudgets || existingBudgets.length === 0) {
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

  // ── 6. MONTHLY SAVINGS SNAPSHOT + GOAL ADVANCE ──────────────────
  // Catch-up: process any previous month that's missing a savings snapshot.
  // Idempotent via upsert on (month, owner).
  // Boss directive: advance goals by ACTUAL per-person net savings, not
  // planned monthly_contribution. If someone falls behind, the goal shows it.
  {
    // Find the last month that has a snapshot
    const { data: latestSnap } = await supabase
      .from('finance_monthly_savings')
      .select('month')
      .eq('owner', 'total')
      .order('month', { ascending: false })
      .limit(1)

    // Start from the month after the last snapshot (or 3 months back if none)
    const lastSnapMonth = latestSnap?.[0]?.month
      ? new Date(latestSnap[0].month + 'T00:00:00Z')
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))

    // Process each missing month up to (but not including) the current month
    const processMonth = new Date(Date.UTC(lastSnapMonth.getUTCFullYear(), lastSnapMonth.getUTCMonth() + 1, 1))
    const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

    while (processMonth < currentMonthStart) {
      const pmStart = processMonth.toISOString().slice(0, 10)
      const pmEnd = new Date(Date.UTC(processMonth.getUTCFullYear(), processMonth.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)

      // Fetch all transactions for this month
      const { data: pmTxns } = await supabase
        .from('finance_transactions')
        .select('type, amount_mxn, owner')
        .gte('transaction_date', pmStart)
        .lte('transaction_date', pmEnd)

      const txns = (pmTxns || []) as { type: string; amount_mxn: number; owner: string | null }[]

      // Per-owner pass
      for (const ownerName of ['bernardo', 'laura']) {
        const ownerTxns = txns.filter(t => t.owner?.toLowerCase() === ownerName)
        const grossIncome = ownerTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_mxn, 0)
        const totalExpenses = ownerTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_mxn, 0)
        const actualNetSavings = grossIncome - totalExpenses

        // Fetch this owner's active savings goals
        const { data: ownerGoals } = await supabase
          .from('finance_goals')
          .select('id, current_amount, target_amount, monthly_contribution')
          .eq('is_completed', false)
          .eq('goal_type', 'savings')
          .ilike('owner', ownerName)

        const plannedContribution = (ownerGoals || []).reduce((s, g) => s + g.monthly_contribution, 0)

        // Upsert per-owner snapshot
        const { error: snapErr } = await supabase
          .from('finance_monthly_savings')
          .upsert(
            { month: pmStart, owner: ownerName, gross_income: grossIncome, total_expenses: totalExpenses, planned_contribution: plannedContribution },
            { onConflict: 'month,owner' }
          )
        if (snapErr) results.errors.push(`Savings snapshot (${ownerName}) ${pmStart}: ${snapErr.message}`)

        // Advance each savings goal by ACTUAL net savings
        for (const goal of ownerGoals || []) {
          const newAmount = Math.min(goal.current_amount + actualNetSavings, goal.target_amount)
          const isCompleted = newAmount >= goal.target_amount
          const { error: goalErr } = await supabase
            .from('finance_goals')
            .update({
              current_amount: newAmount,
              is_completed: isCompleted,
              last_contribution_date: today,
              last_contribution_amount: Math.round(actualNetSavings * 100) / 100,
              updated_at: new Date().toISOString(),
            })
            .eq('id', goal.id)
          if (goalErr) results.errors.push(`Goal advance ${goal.id}: ${goalErr.message}`)
        }
      }

      // Upsert combined 'total' row
      const totalIncome = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_mxn, 0)
      const totalExpenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_mxn, 0)
      const { data: allGoals } = await supabase
        .from('finance_goals').select('monthly_contribution').eq('is_completed', false).eq('goal_type', 'savings')
      const totalPlanned = (allGoals || []).reduce((s, g) => s + g.monthly_contribution, 0)
      await supabase.from('finance_monthly_savings').upsert(
        { month: pmStart, owner: 'total', gross_income: totalIncome, total_expenses: totalExpenses, planned_contribution: totalPlanned },
        { onConflict: 'month,owner' }
      )

      // Advance to next month
      processMonth.setUTCMonth(processMonth.getUTCMonth() + 1)
    }
  }

  return NextResponse.json({
    processed_at: now.toISOString(),
    results,
    total_created: results.subscriptions + results.income + results.installments,
    debt_payments_processed: results.debt_payments,
    budget_rollovers: results.budget_rollovers,
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
