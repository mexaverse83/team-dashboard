import { describe, expect, it } from 'vitest'
import { getUnpaidTreatmentEventsForMonth, type TreatmentEvent } from '@/lib/fertility-plan'

const event = (over: Partial<TreatmentEvent> = {}): TreatmentEvent => ({
  date: '2026-07-22',
  month: '2026-07',
  amount: 12000,
  minAmount: 12000,
  maxAmount: 12000,
  label: 'Final treatment payment (1 of 2)',
  ...over,
})

describe('getUnpaidTreatmentEventsForMonth', () => {
  it('keeps a milestone due today in the forecast until it posts', () => {
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [], [event()])
    expect(unpaid).toHaveLength(1)
    expect(unpaid[0].amount).toBe(12000)
  })

  it('keeps an overdue unpaid milestone — the money still leaves this month', () => {
    // As of e.g. July 25 with nothing posted, the event must not vanish.
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [
      { date: '2026-07-24', amount: 1800 },
    ], [event()])
    expect(unpaid).toHaveLength(1)
  })

  it('drops a milestone once a matching payment posts on the due date', () => {
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [
      { date: '2026-07-22', amount: 12000 },
    ], [event()])
    expect(unpaid).toHaveLength(0)
  })

  it('matches a payment posted a few days early', () => {
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [
      { date: '2026-07-15', amount: 12000 },
    ], [event()])
    expect(unpaid).toHaveLength(0)
  })

  it('ignores payments more than 10 days before the due date', () => {
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [
      { date: '2026-07-01', amount: 12000 },
    ], [event()])
    expect(unpaid).toHaveLength(1)
  })

  it('matches when the posted amount drifts above plan (June 50k posted as 84.5k)', () => {
    const june = event({ date: '2026-06-15', month: '2026-06', amount: 50000 })
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-06', [
      { date: '2026-06-06', amount: 84500 },
    ], [june])
    expect(unpaid).toHaveLength(0)
  })

  it('does not let routine tagged spend (meds, monitoring) settle a milestone', () => {
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [
      { date: '2026-07-16', amount: 1800 },
      { date: '2026-07-16', amount: 993 },
      { date: '2026-07-22', amount: 5680 },
    ], [event()])
    expect(unpaid).toHaveLength(1)
  })

  it('does not match a payment posted after the event month ends', () => {
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [
      { date: '2026-08-15', amount: 13672 },
    ], [event()])
    expect(unpaid).toHaveLength(1)
  })

  it('lets one transaction settle only one event', () => {
    const a = event({ date: '2026-07-10', amount: 10000, label: 'a' })
    const b = event({ date: '2026-07-20', amount: 10000, label: 'b' })
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [
      { date: '2026-07-12', amount: 10000 },
    ], [a, b])
    expect(unpaid).toHaveLength(1)
  })

  it('only considers events belonging to the requested month', () => {
    const may = event({ date: '2026-05-15', month: '2026-05', amount: 92000 })
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [], [may, event()])
    expect(unpaid).toHaveLength(1)
    expect(unpaid[0].month).toBe('2026-07')
  })

  it('handles an early window that crosses into the previous month', () => {
    const early = event({ date: '2026-07-05', month: '2026-07' })
    const unpaid = getUnpaidTreatmentEventsForMonth('2026-07', [
      { date: '2026-06-28', amount: 12000 },
    ], [early])
    expect(unpaid).toHaveLength(0)
  })
})
