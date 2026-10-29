import { describe, expect, it } from 'vitest'
import { netWorthRows, privateEquityAtCost, PE_AT_COST_NOTE } from '@/lib/net-worth-rows'

const snap = { snapshot_date: '2026-10-28', net_worth: 13_720_000, stocks_amount: 5100, real_estate_amount: 4_800_700 }

describe('netWorthRows notes', () => {
  it('flags a snapshot that still holds private equity at cost instead of calling it a live estimate', () => {
    const atCost = { ...snap, private_equity_estimate: 1_110_000 }
    expect(privateEquityAtCost(atCost)).toBe(true)
    const row = netWorthRows(atCost).find(r => r.key === 'private_equity')!
    expect(row.label).toBe('Stocks & private equity')
    expect(row.note).toBe(PE_AT_COST_NOTE)
  })

  it('keeps the live-estimate wording when the snapshot is current or the estimate is unknown', () => {
    const live = { ...snap, stocks_amount: 1_100_000, private_equity_estimate: 1_110_000 }
    expect(netWorthRows(live).find(r => r.key === 'private_equity')!.note).toBe('estimate at the live USD rate')
    expect(privateEquityAtCost(snap)).toBe(false)
  })

  it('describes real estate as value minus what is still owed', () => {
    expect(netWorthRows(snap).find(r => r.key === 'real_estate')!.note).toBe('value − remaining to developer')
  })
})
