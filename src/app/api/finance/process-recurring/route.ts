import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { advanceRecurringDate, dueDateInMonth, msiPendingPeriods, pickCurrentRecurringIncome, shouldPostIncomeSource } from '@/lib/recurring-dates'
import { addMonthsKey, mexicoCityDateParts, mexicoCityToday, monthEndKey } from '@/lib/dates'
import { canonicalOwner, OWNERS } from '@/lib/owners'
import { paymentMethodFromCard } from '@/lib/payment-methods'
import { configErrorResponse, getAdminClient } from '@/lib/supabase-admin'
import { recordRun, triggerFromAuth } from '@/lib/automation/runs'

/**
 * POST /api/finance/process-recurring (GET for Vercel cron / API key only)
 *
 * Posts everything that is due, on the household's Mexico City calendar:
 * 1. Subscriptions (finance_recurring) → expense transactions, with catch-up
 * 2. Income sources (finance_income_sources) → income transactions
 * 3. Recurring income (finance_recurring_income) → one row per name per month
 * 4. MSI installments → one expense per missed month, atomically with payments_made
 * 5. Budget rollover, then month close for every finished month
 *
 * Errors are split (AUTO-12): `errors` are transient (a read or write failed;
 * month close waits, HTTP 503 so schedulers retry) and `item_warnings` are
 * configuration problems that can never post (HTTP 200, close proceeds).
 * Duplicate posts are blocked by unique indexes (supabase-2026-10-recurring-idempotency.sql)
 * on top of the application-level checks.
 */

interface ItemWarning { item: string; message: string }

const MIGRATION_HINT = 'run supabase-2026-10-recurring-idempotency.sql'

// Columns/indexes added by the 2026-10 migrations. Until they're applied the
// processor still posts, without the DB-level guard, and says so once.
const OPTIONAL_COLUMNS = ['recurring_income_id', 'income_source_id', 'installment_number']

type DbError = { message?: string; code?: string } | null | undefined

/** The unique index is missing (migration pending, or skipped because duplicates exist). */
function isMissingIndex(error: DbError) {
  return !!error && (error.code === '42P10' || /no unique or exclusion constraint/i.test(error.message || ''))
}

/** One of the 2026-10 columns is missing (migration not applied). */
function isMissingColumn(error: DbError) {
  return !!error && (error.code === 'PGRST204' || error.code === '42703'
    || /schema cache|column .* does not exist/i.test(error.message || ''))
}

function inferOwner(owner: string | null | undefined, name: string): string | null {
  const canonical = canonicalOwner(owner)
  if (canonical && OWNERS.includes(canonical)) return canonical
  const lower = name.toLowerCase()
  return OWNERS.find(o => lower.includes(o.toLowerCase())) || canonical
}

async function processRecurring(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req, { allowCron: true })
  if (!auth.ok) return auth.response
  // A GET that writes is only for schedulers; a browser must POST.
  if (req.method === 'GET' && auth.method === 'user') {
    return NextResponse.json({ error: 'Use POST to run the processor' }, { status: 405 })
  }

  let supabase: SupabaseClient
  try {
    supabase = getAdminClient()
  } catch (err) {
    return configErrorResponse(err)
  }

  const instant = new Date()
  const mx = mexicoCityDateParts(instant)
  const today = mexicoCityToday(instant)
  const monthStr = today.slice(0, 7)
  const monthStart = `${monthStr}-01`
  const monthEnd = monthEndKey(monthStr)
  const results = {
    subscriptions: 0, income: 0, installments: 0, debt_payments: 0, budget_rollovers: 0, skipped: 0,
    duplicates_ignored: 0, subscriptions_ended: 0,
    errors: [] as string[],
    item_warnings: [] as ItemWarning[],
    closed_months: [] as Array<{ month: string; savings?: Record<string, unknown> | null }>,
  }
  const warn = (item: string, message: string) => results.item_warnings.push({ item, message })
  const schemaWarned = new Set<string>()
  const schemaWarning = (kind: 'index' | 'column') => {
    if (schemaWarned.has(kind)) return
    schemaWarned.add(kind)
    warn('database', kind === 'column'
      ? `New id columns missing — posted without them; ${MIGRATION_HINT}`
      : `Duplicate guards not installed (an index is missing, or was skipped because duplicates exist) — ${MIGRATION_HINT}`)
  }
  // Months that got a new row this run, to flag ones that were already closed.
  const postedMonths = new Map<string, number>()
  const notePosted = (date: unknown) => {
    const month = String(date).slice(0, 7)
    postedMonths.set(month, (postedMonths.get(month) ?? 0) + 1)
  }

  /**
   * Insert one generated transaction. With the unique index in place a
   * concurrent duplicate is ignored ('duplicate'). Without the index the row
   * is inserted as is; only a missing column strips the new id columns.
   */
  async function postTransaction(row: Record<string, unknown>, conflict: string | null): Promise<'inserted' | 'duplicate' | { error: string }> {
    const result = await insertTransaction(row, conflict)
    if (result === 'inserted') notePosted(row.transaction_date)
    return result
  }

  async function insertTransaction(row: Record<string, unknown>, conflict: string | null): Promise<'inserted' | 'duplicate' | { error: string }> {
    if (conflict) {
      const { data, error } = await supabase.from('finance_transactions')
        .upsert(row, { onConflict: conflict, ignoreDuplicates: true })
        .select('id')
      if (!error) return Array.isArray(data) && data.length === 0 ? 'duplicate' : 'inserted'
      if (isMissingIndex(error)) schemaWarning('index')
      else if (!isMissingColumn(error)) return { error: error.message }
    }
    const { error } = await supabase.from('finance_transactions').insert(row)
    if (!error) return 'inserted'
    if (!isMissingColumn(error)) return { error: error.message }
    schemaWarning('column')
    const legacy = Object.fromEntries(Object.entries(row).filter(([k]) => !OPTIONAL_COLUMNS.includes(k)))
    const { error: legacyError } = await supabase.from('finance_transactions').insert(legacy)
    return legacyError ? { error: legacyError.message } : 'inserted'
  }

  // ── 1. SUBSCRIPTIONS ──────────────────────────────────────────────
  const { data: subs, error: subsError } = await supabase
    .from('finance_recurring')
    .select('*')
    .eq('is_active', true)

  if (subsError) results.errors.push(`Subscriptions fetch: ${subsError.message}`)

  for (const sub of subs || []) {
    if (!['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(sub.frequency)) {
      warn(`Subscription ${sub.name}`, `unsupported recurrence "${sub.frequency}"`)
      continue
    }
    if (sub.currency && sub.currency !== 'MXN') {
      warn(`Subscription ${sub.name}`, 'foreign-currency posting requires an explicit MXN conversion')
      continue
    }
    if (!sub.next_due_date || sub.next_due_date > today) {
      results.skipped++
      continue
    }

    // Catch-up loop: post every missed period, not just one.
    let dueDate = sub.next_due_date
    const MAX_CATCHUP = 12
    let ended = false

    for (let i = 0; i < MAX_CATCHUP && dueDate <= today; i++) {
      if (sub.end_date && dueDate > String(sub.end_date).slice(0, 10)) {
        ended = true
        break
      }
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

      const posted = await postTransaction({
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
        payment_method: sub.payment_method ?? null,
      }, 'recurring_id,transaction_date')
      if (typeof posted === 'object') {
        // Do NOT advance the date on failure — the next run retries.
        results.errors.push(`Sub ${sub.name}: ${posted.error}`)
        break
      }
      if (posted === 'duplicate') {
        results.duplicates_ignored++
        dueDate = advanceRecurringDate(dueDate, sub.frequency, Number(sub.next_due_date.slice(8, 10)))
        continue
      }

      results.subscriptions++

      // ── DEBT SYNC: if subscription is linked to a debt, update balance ──
      if (sub.debt_id) {
        try {
          // supabase-js returns errors instead of throwing: check each one, or a
          // failed write would count as a payment and the run would read 'ok'.
          const { data: debt, error: debtReadError } = await supabase
            .from('finance_debts')
            .select('*')
            .eq('id', sub.debt_id)
            .single()
          if (debtReadError) throw new Error(`read: ${debtReadError.message}`)

          if (debt && debt.balance > 0) {
            const monthlyRate = (debt.interest_rate || 0) / 100 / 12
            const interestPortion = Math.round(debt.balance * monthlyRate * 100) / 100
            const principalPortion = Math.round((sub.amount - interestPortion) * 100) / 100
            const newBalance = Math.max(0, Math.round((debt.balance - principalPortion) * 100) / 100)

            const { error: paymentError } = await supabase.from('finance_debt_payments').insert({
              debt_id: sub.debt_id,
              payment_date: dueDate,
              amount: sub.amount,
              principal_portion: principalPortion,
              interest_portion: interestPortion,
              remaining_balance: newBalance,
            })
            if (paymentError) throw new Error(`payment insert: ${paymentError.message} — balance not reduced; record the payment on the Debt page`)
            const { error: balanceError } = await supabase.from('finance_debts')
              .update({ balance: newBalance, ...(newBalance <= 0 ? { is_active: false } : {}) })
              .eq('id', sub.debt_id)
            if (balanceError) throw new Error(`balance update: ${balanceError.message} — payment logged but balance still ${debt.balance}; set it to ${newBalance} on the Debt page`)

            results.debt_payments++
          }
        } catch (e) {
          results.errors.push(`Debt sync ${sub.name}: ${(e as Error).message}`)
        }
      }

      dueDate = advanceRecurringDate(dueDate, sub.frequency, Number(sub.next_due_date.slice(8, 10)))
    }

    if (sub.end_date && dueDate > String(sub.end_date).slice(0, 10)) ended = true
    const update: Record<string, unknown> = {}
    if (dueDate !== sub.next_due_date) update.next_due_date = dueDate
    if (ended) update.is_active = false
    if (Object.keys(update).length) {
      const { error } = await supabase.from('finance_recurring').update(update).eq('id', sub.id)
      if (error) results.errors.push(`Sub ${sub.name} advance: ${error.message}`)
      else if (ended) results.subscriptions_ended++
    }
  }

  // Income category, shared by both income sections.
  const { data: incomeCats } = await supabase
    .from('finance_categories')
    .select('id')
    .eq('type', 'income')
    .limit(1)
  const incomeCatId = incomeCats?.[0]?.id || null

  // ── 2. INCOME SOURCES ─────────────────────────────────────────────
  const { data: incomes, error: incomesError } = await supabase
    .from('finance_income_sources')
    .select('*')
    .eq('is_active', true)

  if (incomesError) results.errors.push(`Income fetch: ${incomesError.message}`)
  for (const inc of incomes || []) {
    if (inc.currency && inc.currency !== 'MXN') {
      warn(`Income ${inc.name}`, 'foreign-currency posting requires an explicit MXN conversion')
      continue
    }
    if (!shouldPostIncomeSource(inc.frequency, mx.month, inc.pay_month)) {
      results.skipped++
      continue
    }
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

    const owner = inferOwner(inc.owner, inc.name)
    if (!owner || !OWNERS.includes(owner)) warn(`Income ${inc.name}`, 'owner is not set — posted without an owner')
    const posted = await postTransaction({
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
      owner: owner && OWNERS.includes(owner) ? owner : null,
      income_source_id: inc.id,
    }, 'income_source_id,transaction_date')
    if (typeof posted === 'object') results.errors.push(`Income ${inc.name}: ${posted.error}`)
    else if (posted === 'duplicate') results.duplicates_ignored++
    else results.income++
  }

  // ── 3. RECURRING INCOME (finance_recurring_income) ───────────────
  const { data: recurringIncomes, error: recurringIncomeErr } = await supabase
    .from('finance_recurring_income')
    .select('*')
    .eq('active', true)

  // A swallowed fetch error is exactly how month-start payroll goes missing.
  if (recurringIncomeErr) results.errors.push(`RecurringIncome fetch: ${recurringIncomeErr.message}`)

  const monthlyIncome = (recurringIncomes || []).filter(ri => {
    if (ri.recurrence === 'monthly') return true
    warn(`Recurring income ${ri.name}`, `recurrence "${ri.recurrence}" is not posted automatically`)
    return false
  })
  for (const ri of pickCurrentRecurringIncome(monthlyIncome, today)) {
    const payDate = dueDateInMonth(monthStr, Number(ri.day_of_month) || 1)
    if (payDate > today || (ri.end_date && String(ri.end_date).slice(0, 10) < payDate)) {
      results.skipped++
      continue
    }

    // One post per name per month — legacy rows have no recurring_income_id.
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

    const posted = await postTransaction({
      type: 'income',
      amount: ri.amount,
      currency: 'MXN',
      amount_mxn: ri.amount,
      category_id: incomeCatId,
      merchant: ri.name,
      description: `Auto: ${ri.name} (${ri.category})`,
      transaction_date: payDate,
      is_recurring: true,
      tags: ['auto-income', 'recurring-income'],
      source: 'recurring_income',
      owner: canonicalOwner(ri.owner),
      recurring_income_id: ri.id,
    }, 'recurring_income_id,transaction_date')
    if (typeof posted === 'object') results.errors.push(`RecurringIncome ${ri.name}: ${posted.error}`)
    else if (posted === 'duplicate') results.duplicates_ignored++
    else results.income++
  }

  // ── 4. MSI INSTALLMENTS ───────────────────────────────────────────
  // One expense per month from start through this month (catch-up), each
  // posted with its payments_made increment in one database transaction.
  const { data: installments, error: installmentError } = await supabase
    .from('finance_installments')
    .select('*')
    .eq('is_active', true)
    .lte('start_date', today)

  if (installmentError) results.errors.push(`Installments fetch: ${installmentError.message}`)
  let msiRpcAvailable = true
  for (const msi of installments || []) {
    if (msi.payments_made >= msi.installment_count) {
      await supabase.from('finance_installments').update({ is_active: false }).eq('id', msi.id)
      results.skipped++
      continue
    }

    const periods = msiPendingPeriods(msi, today)
    if (periods.length === 0) {
      results.skipped++
      continue
    }

    for (const period of periods) {
      const row = {
        type: 'expense',
        amount: msi.installment_amount,
        currency: 'MXN',
        amount_mxn: msi.installment_amount,
        category_id: msi.category_id,
        merchant: `MSI: ${msi.name}`,
        description: `Auto-MSI: ${msi.name} (${period.number}/${msi.installment_count})${msi.merchant ? ` — ${msi.merchant}` : ''}`,
        transaction_date: period.date,
        is_recurring: true,
        tags: ['auto-msi'],
        owner: canonicalOwner(msi.owner),
        payment_method: paymentMethodFromCard(msi.credit_card),
        installment_id: msi.id,
        installment_number: period.number,
      }

      if (msiRpcAvailable) {
        const { data, error } = await supabase.rpc('finance_post_msi_payment', { p_installment_id: msi.id, p_number: period.number, p_tx: row })
        if (!error) {
          if (data) {
            results.installments++
            notePosted(period.date)
          } else results.duplicates_ignored++
          continue
        }
        if (!/finance_post_msi_payment|PGRST202|42883|could not find the function/i.test(`${error.code} ${error.message}`)) {
          results.errors.push(`MSI ${msi.name} (${period.number}): ${error.message}`)
          break
        }
        msiRpcAvailable = false
        warn('database', 'MSI posts are not atomic yet — run supabase-2026-10-msi-atomic.sql')
      }

      // Fallback without the RPC: payment-number dupe guard (legacy rows carry
      // "(n/N)" in the description), insert, then advance payments_made.
      const { data: existing, error: dupeErr } = await supabase.from('finance_transactions').select('id')
        .eq('installment_id', msi.id)
        .ilike('description', `%(${period.number}/${msi.installment_count})%`).limit(1)
      if (dupeErr) {
        results.errors.push(`MSI dupe check ${msi.name}: ${dupeErr.message}`)
        break
      }
      if (!existing || existing.length === 0) {
        const posted = await postTransaction(row, 'installment_id,installment_number')
        if (typeof posted === 'object') {
          results.errors.push(posted.error.includes('installment_id')
            ? `MSI ${msi.name}: installment_id column missing — run finance-installments-sync migration`
            : `MSI ${msi.name}: ${posted.error}`)
          break
        }
        if (posted === 'inserted') results.installments++
        else results.duplicates_ignored++
      } else {
        results.duplicates_ignored++
      }
      const { error: advanceErr } = await supabase.from('finance_installments')
        .update({ payments_made: period.number, ...(period.number >= msi.installment_count ? { is_active: false } : {}) })
        .eq('id', msi.id)
      if (advanceErr) {
        results.errors.push(`MSI ${msi.name} advance: ${advanceErr.message}`)
        break
      }
    }
  }

  // ── 5. BUDGET ROLLOVER ──────────────────────────────────────────
  // If the current month has no budgets yet, copy last month's rows.
  {
    const currentMonthStr = monthStart
    const prevMonthStr = `${addMonthsKey(monthStr, -1)}-01`

    const { data: existingBudgets, error: budgetCheckError } = await supabase
      .from('finance_budgets')
      .select('id')
      .eq('month', currentMonthStr)
      .limit(1)

    if (budgetCheckError) results.errors.push(`Budget rollover check: ${budgetCheckError.message}`)
    if (!budgetCheckError && (!existingBudgets || existingBudgets.length === 0)) {
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
        const { error: insertErr } = await supabase.from('finance_budgets').insert(newRows)
        if (insertErr) results.errors.push(`Budget rollover insert: ${insertErr.message}`)
        else results.budget_rollovers = newRows.length
      }
    }
  }

  // ── 6. MONTH CLOSE ──────────────────────────────────────────────
  // Each finished month closes in one database transaction. Any transient
  // failure above leaves it for the next run, so a missing salary never
  // freezes wrong savings; config warnings don't block.
  const { data: latestSnap, error: latestSnapError } = await supabase
    .from('finance_monthly_savings').select('month').eq('owner', 'total')
    .order('month', { ascending: false }).limit(1)
  // finance_close_month never rewrites a saved month, so a catch-up post into
  // one leaves its snapshot stale — say so instead of staying silent.
  const closedThrough = latestSnap?.[0]?.month ? String(latestSnap[0].month).slice(0, 7) : null
  if (closedThrough) {
    for (const [month, count] of [...postedMonths].sort()) {
      if (month > closedThrough) continue
      warn(`Month ${month}`, `${count} catch-up post${count === 1 ? '' : 's'} landed after the month was closed — its saved savings totals are now out of date`)
    }
  }
  if (results.errors.length > 0) {
    results.errors.push('Month close deferred until recurring processing succeeds')
  } else {
    if (latestSnapError) {
      results.errors.push(`Savings cursor: ${latestSnapError.message}`)
    } else {
      let cursor = latestSnap?.[0]?.month
        ? addMonthsKey(String(latestSnap[0].month).slice(0, 7), 1)
        : addMonthsKey(monthStr, -3)
      while (cursor < monthStr) {
        const month = `${cursor}-01`
        const { error } = await supabase.rpc('finance_close_month', { p_month: month })
        if (error) {
          results.errors.push(`Month close ${month}: ${error.message}. Requires supabase-finance-atomic-month-close.sql`)
          break
        }
        const { data: saved } = await supabase.from('finance_monthly_savings')
          .select('*').eq('month', month).eq('owner', 'total').limit(1)
        results.closed_months.push({ month, savings: saved?.[0] ?? null })
        cursor = addMonthsKey(cursor, 1)
      }
    }
  }

  const totalCreated = results.subscriptions + results.income + results.installments
  const ok = results.errors.length === 0
  await recordRun(supabase, {
    job: 'process-recurring',
    trigger: triggerFromAuth(auth.method, req),
    started_at: instant,
    status: !ok ? 'error' : results.item_warnings.length ? 'warning' : 'ok',
    created_count: totalCreated,
    error: ok ? (results.item_warnings.length ? `${results.item_warnings.length} item warning(s)` : null) : results.errors.slice(0, 5).join(' | '),
    details: {
      today,
      subscriptions: results.subscriptions,
      income: results.income,
      installments: results.installments,
      duplicates_ignored: results.duplicates_ignored,
      warnings: results.item_warnings.map(w => `${w.item}: ${w.message}`),
      errors: results.errors,
      closed_months: results.closed_months.map(c => c.month),
    },
  })

  return NextResponse.json({
    processed_at: instant.toISOString(),
    today,
    results,
    item_warnings: results.item_warnings,
    closed_months: results.closed_months,
    total_created: totalCreated,
    debt_payments_processed: results.debt_payments,
    budget_rollovers: results.budget_rollovers,
    ok,
  }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}

// Vercel cron calls GET (Bearer CRON_SECRET) — wire both methods to the processor
export async function GET(req: NextRequest) {
  return processRecurring(req)
}

export async function POST(req: NextRequest) {
  return processRecurring(req)
}
