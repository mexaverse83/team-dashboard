import { describe, expect, it, vi } from 'vitest'
import { dispatchFinanceEvent, FINANCE_EVENTS, onFinanceEvent } from '@/lib/finance-events'

describe('finance events', () => {
  it('uses the contract names', () => {
    expect(FINANCE_EVENTS).toEqual({ quickAdd: 'finance:quick-add', dataChanged: 'finance:data-changed', refresh: 'finance:refresh' })
  })

  it('dispatches CustomEvents with detail and unsubscribes', () => {
    const handler = vi.fn()
    const off = onFinanceEvent(FINANCE_EVENTS.quickAdd, handler)
    dispatchFinanceEvent(FINANCE_EVENTS.quickAdd, { merchant: 'Heb', amount: 250 })
    expect(handler).toHaveBeenCalledWith({ merchant: 'Heb', amount: 250 })
    off()
    dispatchFinanceEvent(FINANCE_EVENTS.quickAdd, {})
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
