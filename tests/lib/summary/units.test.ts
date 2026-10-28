import { describe, expect, it } from 'vitest'
import { allocatedMonthlySpend, cycleBudget, cycleWindowMonths, cycleWindowSpend, monthlyNeeded, monthsRemaining } from '@/lib/finance-utils'
import { getUnpaidTreatmentEventsForMonth, FERTILITY_TREATMENT_PLAN } from '@/lib/fertility-plan'
import { BABY_PLAN, looksLikeBabySpend } from '@/lib/baby-plan'
import { buildBudgetVsActual } from '@/lib/summary/budgets'
import { buildUpcoming, nextInstallmentDate } from '@/lib/summary/upcoming'
import type { FinanceTransaction } from '@/lib/finance-types'

const oct28 = { year: 2026, month: 10, day: 28 }

describe('goal months and monthly need (one definition everywhere)', () => {
  it('counts the current month', () => {
    expect(monthsRemaining('2026-12-31', oct28)).toBe(3)
    expect(monthsRemaining('2026-12-31', { year: 2026, month: 12, day: 15 })).toBe(1)
    expect(monthsRemaining('2026-12-31', { year: 2027, month: 1, day: 2 })).toBe(0)
  })
  it('is 0 for overdue, crypto and funded goals', () => {
    expect(monthlyNeeded({ target_amount: 755000, current_amount: 474146, target_date: '2026-12-31' }, oct28)).toBe(93618)
    expect(monthlyNeeded({ target_amount: 755000, current_amount: 474146, target_date: '2026-12-31' }, { year: 2027, month: 1, day: 2 })).toBe(0)
    expect(monthlyNeeded({ target_amount: 1, current_amount: 0.25, target_date: '2027-12-31', goal_type: 'crypto', crypto_symbol: 'BTC' }, oct28)).toBe(0)
    expect(monthlyNeeded({ target_amount: 100, current_amount: 120, target_date: '2027-12-31' }, oct28)).toBe(0)
  })
})

describe('non-monthly budget normalisation', () => {
  it('uses the calendar cycle window, across the year boundary', () => {
    expect(cycleWindowMonths('2027-01', 'bimonthly')).toEqual(['2026-12', '2027-01'])
    expect(cycleBudget(2500, 'bimonthly')).toBe(5000)
    const rows = [
      { category_id: 'elec', transaction_date: '2026-08-20', amount_mxn: 6000 },
      { category_id: 'elec', transaction_date: '2026-10-20', amount_mxn: 6067 },
    ]
    expect(cycleWindowSpend(rows, 'elec', '2026-10', 'bimonthly')).toBe(6067)
    expect(cycleWindowSpend(rows, 'elec', '2026-09', 'bimonthly')).toBe(6000)
  })
})

describe('home budgets are cash basis (parity with the Budgets page, documented)', () => {
  it('a covered annual bill counts whole on home and pro-rated on Budgets', () => {
    const insurance = { id: 'x', category_id: 'ins', type: 'expense', amount_mxn: 12000, amount: 12000, transaction_date: '2026-10-05', coverage_start: '2026-10-01', coverage_end: '2027-09-30' }
    const rows = buildBudgetVsActual({
      budgets: [{ category_id: 'ins', amount: 1000 }],
      catMap: new Map([['ins', { id: 'ins', name: 'Insurance' }]]),
      currentMonthTxs: [insurance],
      historyTxs: [],
      month: '2026-10', dayOfMonth: 28, daysInMonth: 31,
    })
    expect(rows[0]).toMatchObject({ spent: 12000, basis: 'cash', category_id: 'ins' })
    expect(allocatedMonthlySpend([insurance as unknown as FinanceTransaction], 'ins', '2026-10')).toBe(1000)
  })
})

describe('plan event settlement', () => {
  it("baby events settle on the month's cumulative spend", () => {
    const oct = BABY_PLAN.events.filter(e => e.month === '2026-10')
    const paid = [{ date: '2026-10-03', amount: 753 }, { date: '2026-10-09', amount: 750 }, { date: '2026-10-05', amount: 2800 }]
    expect(getUnpaidTreatmentEventsForMonth('2026-10', paid, oct, { matchMode: 'cumulative' })).toEqual([])
    expect(getUnpaidTreatmentEventsForMonth('2026-10', paid.slice(0, 2), oct, { matchMode: 'cumulative' })[0].amount).toBe(4000 - 1503)
    // Single-match mode (treatment milestones) can't be settled by small rows.
    expect(getUnpaidTreatmentEventsForMonth('2026-10', paid.slice(0, 2), oct)).toHaveLength(1)
  })
  it('the fertility plan is complete', () => {
    expect(FERTILITY_TREATMENT_PLAN).toMatchObject({ status: 'complete', completedMonth: '2026-07' })
  })
  it('recognises prenatal spend by keyword', () => {
    expect(looksLikeBabySpend('Eco bebe', 'Health')).toBe(true)
    expect(looksLikeBabySpend('Cita gine', 'Health')).toBe(true)
    expect(looksLikeBabySpend('Ultrasonido bby', 'Other')).toBe(true)
    expect(looksLikeBabySpend('Cita gine', 'Dining Out')).toBe(false)
    expect(looksLikeBabySpend('Soriana', 'Groceries')).toBe(false)
  })
})

describe('upcoming', () => {
  it('computes the next MSI installment from its start date, not end_date', () => {
    expect(nextInstallmentDate({ name: 'Edredon', installment_amount: 500, installment_count: 6, payments_made: 2, start_date: '2026-09-05' }, '2026-10-28')).toBe('2026-11-05')
    expect(nextInstallmentDate({ name: 'Done', installment_amount: 500, installment_count: 2, payments_made: 2, start_date: '2026-09-05' }, '2026-10-28')).toBeNull()
  })
  it('groups same-day bills and keeps the window to 14 days', () => {
    const items = buildUpcoming({
      today: '2026-10-28',
      recurring: [
        { name: 'Rent', amount: 35000, frequency: 'monthly', next_due_date: '2026-11-01' },
        { name: 'WEST', amount: 10000, frequency: 'monthly', next_due_date: '2026-11-01' },
        { name: 'Twitter', amount: 2000, frequency: 'yearly', next_due_date: '2027-01-01' },
      ],
      installments: [],
      recurringIncome: [],
      postedIncomeMerchants: [],
      babyEvents: [{ month: '2026-11', date: '2026-11-15', amount: 4000, label: 'Prenatal care' }],
      westLump: { date: '2026-12-01', amount: 90000 },
    })
    // Nov 15 (prenatal) and Dec 1 (balloon) are beyond the 14-day window.
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ date: '2026-11-01', label: 'Rent + 1 more', amount: 45000, kind: 'bill', count: 2, items: ['Rent', 'WEST'] })
  })
})
