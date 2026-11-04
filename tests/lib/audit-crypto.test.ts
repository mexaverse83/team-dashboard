import { describe, expect, it } from 'vitest'
import { summarizeAuditCrypto } from '@/lib/server/audit-crypto'

const rows = [
  { symbol: 'BTC', quantity: 0.1, avg_cost_basis_usd: 1_500_000, cost_currency: 'MXN' },
  { symbol: 'KAS', quantity: 18_000, avg_cost_basis_usd: 1, cost_currency: 'MXN' },
  { symbol: 'SOL', quantity: 2, avg_cost_basis_usd: 150, cost_currency: 'USD' },
]

describe('investments audit: crypto summary', () => {
  it('leaves an unpriced coin out of value, cost and P&L, and names it', () => {
    const s = summarizeAuditCrypto(rows, { BTC: { mxn: 1_600_000 }, SOL: { mxn: 3_000 } }, 20)
    expect(s.total_value_mxn).toBe(160_000 + 6_000)
    // BTC 150,000 MXN + SOL 2 × 150 USD × 20; KAS's 18,000 cost is NOT counted
    expect(s.total_cost_mxn).toBe(150_000 + 6_000)
    expect(s.unpriced).toEqual(['KAS'])
    expect(s.risks.large_loss).toBeNull()
    // No concentration claim over part of the coins.
    expect(s.risks.concentration).toBeNull()
  })

  it('a full price outage is not a −100% loss', () => {
    const s = summarizeAuditCrypto(rows, {}, 20)
    expect(s.total_value_mxn).toBe(0)
    expect(s.total_cost_mxn).toBe(0)
    expect(s.pnl_pct).toBe('0.0')
    expect(s.risks.large_loss).toBeNull()
    expect(s.unpriced).toEqual(['BTC', 'KAS', 'SOL'])
  })

  it('still flags a real loss and concentration when every coin is priced', () => {
    const s = summarizeAuditCrypto(rows.slice(0, 1), { BTC: { mxn: 1_000_000 } }, 20)
    expect(s.risks.large_loss).toEqual({ pnl_pct: '-33.3' })
    expect(s.risks.concentration).toEqual({ symbol: 'BTC', pct: '100.0' })
  })
})
