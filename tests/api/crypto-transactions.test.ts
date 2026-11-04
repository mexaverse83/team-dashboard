// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ holdings: [] as Row[], txs: [] as Row[], seq: 0 }))

vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/supabase-admin', () => {
  // A small in-memory PostgREST stand-in: eq filters, order, insert, update, delete.
  const table = (name: string) => (name === 'finance_crypto_holdings' ? db.holdings : db.txs)
  const builder = (name: string) => {
    const filters: Array<[string, unknown]> = []
    const orders: string[] = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Row = {}
    let single = false
    const rows = () => table(name).filter(r => filters.every(([k, v]) => r[k] === v))
    const run = () => {
      if (op === 'insert') {
        const row = { id: `tx-${++db.seq}`, created_at: `2026-11-02T00:00:${String(db.seq).padStart(2, '0')}Z`, ...payload }
        table(name).push(row)
        return { data: row, error: null }
      }
      if (op === 'update') { rows().forEach(r => Object.assign(r, payload)); return { data: null, error: null } }
      if (op === 'delete') {
        const keep = table(name).filter(r => !rows().includes(r))
        table(name).splice(0, table(name).length, ...keep)
        return { data: null, error: null }
      }
      const out = [...rows()].sort((a, b) => {
        for (const k of orders) { const c = String(a[k]).localeCompare(String(b[k])); if (c) return c }
        return 0
      })
      return { data: single ? out[0] ?? null : out, error: null }
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (p: Row) => { op = 'insert'; payload = p; return chain },
      update: (p: Row) => { op = 'update'; payload = p; return chain },
      delete: () => { op = 'delete'; return chain },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return chain },
      order: (k: string) => { orders.push(k); return chain },
      limit: () => chain,
      single: () => { single = true; return chain },
      maybeSingle: () => { single = true; return chain },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    }
    return chain
  }
  return {
    getAdminClient: () => ({ from: builder }),
    configErrorResponse: () => new Response(null, { status: 503 }),
  }
})

import { DELETE, POST } from '@/app/api/finance/crypto/transactions/route'
import { replayHolding } from '@/lib/crypto-ledger'

const req = (method: string, body: Row) => new NextRequest('http://localhost/api/finance/crypto/transactions', { method, body: JSON.stringify(body) })
const holding = () => db.holdings[0]

describe('crypto transactions keep balances entered before any transaction', () => {
  beforeEach(() => {
    db.seq = 0
    db.txs.splice(0)
    db.holdings.splice(0, db.holdings.length, { id: 'eth', symbol: 'ETH', quantity: 1.7, avg_cost_basis_usd: 40000, created_at: '2026-02-18T00:59:04Z' })
  })

  it('adds a buy on top of a plain balance instead of replacing it', async () => {
    const res = await POST(req('POST', { holding_id: 'eth', type: 'buy', quantity: 0.02, price_per_coin_mxn: 42640 }))
    expect(res.status).toBe(201)
    expect(holding().quantity).toBeCloseTo(1.72, 9)
    // cost basis blends the old balance (1.7 × 40,000) with the new buy
    expect(holding().avg_cost_basis_usd).toBeCloseTo((1.7 * 40000 + 0.02 * 42640) / 1.72, 6)
    const opening = db.txs.find(t => String(t.notes).startsWith('Opening balance'))!
    expect(opening).toMatchObject({ type: 'buy', quantity: 1.7, total_mxn: 68000, transaction_date: '2026-02-17' })
  })

  it('records the opening balance only once', async () => {
    await POST(req('POST', { holding_id: 'eth', type: 'buy', quantity: 0.02, price_per_coin_mxn: 42640 }))
    await POST(req('POST', { holding_id: 'eth', type: 'buy', quantity: 0.03, price_per_coin_mxn: 43000 }))
    expect(db.txs.filter(t => String(t.notes).startsWith('Opening balance'))).toHaveLength(1)
    expect(holding().quantity).toBeCloseTo(1.75, 9)
  })

  it('does not wipe the balance when a transaction is deleted', async () => {
    db.txs.push({ id: 'old', holding_id: 'eth', type: 'buy', quantity: 0.5, price_per_coin_mxn: 30000, total_mxn: 15000, transaction_date: '2026-03-01', created_at: '2026-03-01T00:00:00Z' })
    db.holdings[0].quantity = 2.2 // 1.7 entered by hand + 0.5 logged
    const res = await DELETE(req('DELETE', { id: 'old', holding_id: 'eth' }))
    expect(res.status).toBe(200)
    expect(holding().quantity).toBeCloseTo(1.7, 9)
  })

  it('leaves fully transaction-backed holdings untouched', async () => {
    db.holdings[0].quantity = 0.5
    db.txs.push({ id: 'old', holding_id: 'eth', type: 'buy', quantity: 0.5, price_per_coin_mxn: 30000, total_mxn: 15000, transaction_date: '2026-03-01', created_at: '2026-03-01T00:00:00Z' })
    await POST(req('POST', { holding_id: 'eth', type: 'buy', quantity: 0.1, price_per_coin_mxn: 40000 }))
    expect(db.txs).toHaveLength(2)
    expect(holding().quantity).toBeCloseTo(0.6, 9)
  })

  it('replays buys and sells into quantity and cost basis', () => {
    const r = replayHolding([
      { type: 'buy', quantity: 2, price_per_coin_mxn: 100, total_mxn: 200 },
      { type: 'sell', quantity: '1', price_per_coin_mxn: 150 },
      { type: 'buy', quantity: 1, price_per_coin_mxn: 300 },
    ])
    expect(r.qty).toBe(2)
    expect(r.totalCost).toBe(400)
  })
})

describe('a balance entered without a cost never becomes a zero-cost lot', () => {
  beforeEach(() => {
    db.seq = 0
    db.txs.splice(0)
    db.holdings.splice(0, db.holdings.length, { id: 'kas', symbol: 'KAS', quantity: 1000, avg_cost_basis_usd: null, created_at: '2026-11-01T18:00:00Z' })
  })

  it('refuses a buy until the held balance has a cost, and changes nothing', async () => {
    const res = await POST(req('POST', { holding_id: 'kas', type: 'buy', quantity: 500, price_per_coin_mxn: 2 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toMatchObject({ code: 'opening_cost_required', quantity: 1000 })
    expect(body.error).toMatch(/1000 KAS/)
    expect(db.txs).toHaveLength(0)
    expect(holding()).toMatchObject({ quantity: 1000, avg_cost_basis_usd: null })
  })

  it('prices the held balance with the cost given, so P/L has no phantom gain', async () => {
    const res = await POST(req('POST', { holding_id: 'kas', type: 'buy', quantity: 500, price_per_coin_mxn: 2, opening_cost_per_coin_mxn: 1.5 }))
    expect(res.status).toBe(201)
    expect(holding().quantity).toBe(1500)
    // 1000 × 1.5 + 500 × 2 = 2,500 over 1,500 coins, not 1,000 / 1,500 = 0.667
    expect(holding().avg_cost_basis_usd).toBeCloseTo(2500 / 1500, 9)
    expect(db.txs.find(t => String(t.notes).startsWith('Opening balance'))).toMatchObject({ quantity: 1000, total_mxn: 1500 })
  })

  it('rejects a non-positive opening cost', async () => {
    const res = await POST(req('POST', { holding_id: 'kas', type: 'buy', quantity: 500, price_per_coin_mxn: 2, opening_cost_per_coin_mxn: 0 }))
    expect(res.status).toBe(400)
    expect(db.txs).toHaveLength(0)
  })

  it('lets a sell go through and keeps the coin without a cost basis', async () => {
    const res = await POST(req('POST', { holding_id: 'kas', type: 'sell', quantity: 200, price_per_coin_mxn: 2 }))
    expect(res.status).toBe(201)
    expect(holding().quantity).toBe(800)
    expect(holding().avg_cost_basis_usd).toBe(0)
  })

  it('a later buy still asks for the cost, then prices the zero-cost opening lot a sell recorded', async () => {
    await POST(req('POST', { holding_id: 'kas', type: 'sell', quantity: 200, price_per_coin_mxn: 2 }))
    const refused = await POST(req('POST', { holding_id: 'kas', type: 'buy', quantity: 500, price_per_coin_mxn: 2 }))
    expect(refused.status).toBe(409)
    expect(holding().quantity).toBe(800)

    const res = await POST(req('POST', { holding_id: 'kas', type: 'buy', quantity: 500, price_per_coin_mxn: 2, opening_cost_per_coin_mxn: 1 }))
    expect(res.status).toBe(201)
    expect(db.txs.filter(t => String(t.notes).startsWith('Opening balance'))).toHaveLength(1)
    // 1000 @ 1, sell 200 → 800 @ 1 = 800; + 500 @ 2 = 1,000 → 1,800 over 1,300
    expect(holding().quantity).toBe(1300)
    expect(holding().avg_cost_basis_usd).toBeCloseTo(1800 / 1300, 9)
  })

  it('ignores an opening cost on a holding that already has a basis', async () => {
    db.holdings[0].avg_cost_basis_usd = 3
    const res = await POST(req('POST', { holding_id: 'kas', type: 'buy', quantity: 500, price_per_coin_mxn: 2, opening_cost_per_coin_mxn: 99 }))
    expect(res.status).toBe(201)
    expect(holding().avg_cost_basis_usd).toBeCloseTo((3000 + 1000) / 1500, 9)
  })
})
