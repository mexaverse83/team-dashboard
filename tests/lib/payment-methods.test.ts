import { describe, it, expect } from 'vitest'
import { bbvaCycleFor, bbvaCycleToPay, shiftCycle, summarizeCycle, getPaymentMethod } from '@/lib/payment-methods'

describe('bbvaCycleFor', () => {
  it('puts purchases through the 9th on that month\'s statement, due the 29th', () => {
    expect(bbvaCycleFor('2026-09-05')).toEqual({ start: '2026-08-10', cut: '2026-09-09', due: '2026-09-29' })
    expect(bbvaCycleFor('2026-09-09').cut).toBe('2026-09-09')
  })

  it('rolls purchases after the cut to next month', () => {
    expect(bbvaCycleFor('2026-09-10')).toEqual({ start: '2026-09-10', cut: '2026-10-09', due: '2026-10-29' })
  })

  it('crosses year boundaries', () => {
    expect(bbvaCycleFor('2026-12-20')).toEqual({ start: '2026-12-10', cut: '2027-01-09', due: '2027-01-29' })
    expect(bbvaCycleFor('2027-01-03').start).toBe('2026-12-10')
    expect(shiftCycle(bbvaCycleFor('2027-01-03'), -1).cut).toBe('2026-12-09')
  })
})

describe('bbvaCycleToPay', () => {
  it('shows the closed statement until its due date', () => {
    expect(bbvaCycleToPay('2026-09-25').due).toBe('2026-09-29')
    expect(bbvaCycleToPay('2026-09-29').due).toBe('2026-09-29')
  })

  it('switches to the open cycle after the due date', () => {
    expect(bbvaCycleToPay('2026-09-30').due).toBe('2026-10-29')
    expect(bbvaCycleToPay('2026-10-05').due).toBe('2026-10-29')
  })
})

describe('summarizeCycle', () => {
  const cycle = bbvaCycleFor('2026-09-01')
  it('totals BBVA charges per owner, nets refunds, ignores other methods and dates', () => {
    const summary = summarizeCycle([
      { type: 'expense', amount_mxn: 1000, transaction_date: '2026-08-10', owner: 'Bernardo', payment_method: 'bbva_infinite' },
      { type: 'expense', amount_mxn: 500, transaction_date: '2026-09-09', owner: 'laura', payment_method: 'bbva_infinite' },
      { type: 'income', amount_mxn: 200, transaction_date: '2026-09-01', owner: 'Laura', payment_method: 'bbva_infinite' },
      { type: 'expense', amount_mxn: 999, transaction_date: '2026-09-01', owner: 'Laura', payment_method: 'amex' },
      { type: 'expense', amount_mxn: 999, transaction_date: '2026-09-10', owner: 'Laura', payment_method: 'bbva_infinite' },
    ], cycle)
    expect(summary.byOwner).toEqual([{ owner: 'Bernardo', amount: 1000 }, { owner: 'Laura', amount: 300 }])
    expect(summary.total).toBe(1300)
    expect(summary.count).toBe(3)
  })
})

describe('getPaymentMethod', () => {
  it('looks up labels and tolerates unknown values', () => {
    expect(getPaymentMethod('amex')?.label).toBe('American Express')
    expect(getPaymentMethod(null)).toBeNull()
  })
})
