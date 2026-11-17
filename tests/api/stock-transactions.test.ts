// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({ holdings: [] as Row[], txs: [] as Row[], seq: 0, missingTable: false }))

vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/stock-prices', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/stock-prices')>()),
  fetchUsdMxn: async () => ({ rate: 18.5, source: 'yahoo' }),
}))
vi.mock('@/lib/supabase-admin', () => {
  // A small in-memory PostgREST stand-in: eq/in filters, order, insert, update, delete.
  const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.finance_stock_transactions' in the schema cache" }
  const table = (name: string) => (name === 'finance_stock_holdings' ? db.holdings : db.txs)
  const builder = (name: string) => {
    const filters: Array<(r: Row) => boolean> = []
    const orders: string[] = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Row = {}
    let single = false
    const rows = () => table(name).filter(r => filters.every(f => f(r)))
    const run = () => {
      if (name === 'finance_stock_transactions' && db.missingTable) return { data: null, error: MISSING }
      if (op === 'insert') {
        const row = { id: `tx-${++db.seq}`, created_at: `2026-11-17T00:00:${String(db.seq).padStart(2, '0')}Z`, ...payload }
        table(name).push(row)
        return { data: row, error: null }
      }
      if (op === 'update') { rows().forEach(r => Object.assign(r, payload)); return { data: rows()[0] ?? null, error: null } }
      if (op === 'delete') {
        const gone = rows()
        const keep = table(name).filter(r => !gone.includes(r))
        table(name).splice(0, table(name).length, ...keep)
        return { data: null, error: null }
      }
      const out = [...rows()].sort((a, b) => {
        for (const k of orders) { const c = String(a[k]).localeCompare(String(b[k])); if (c) return c }
        return 0
      })
      const joined = name === 'finance_stock_transactions'
        ? out.map(t => ({ ...t, finance_stock_holdings: db.holdings.find(h => h.id === t.holding_id) }))
        : out
      return { data: single ? joined[0] ?? null : joined, error: null }
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (p: Row) => { op = 'insert'; payload = p; return chain },
      update: (p: Row) => { op = 'update'; payload = p; return chain },
      delete: () => { op = 'delete'; return chain },
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return chain },
      in: (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return chain },
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

import { DELETE, GET, POST } from '@/app/api/finance/investments/stocks/transactions/route'

const req = (method: string, body?: Row) => new NextRequest('http://localhost/api/finance/investments/stocks/transactions', { method, ...(body ? { body: JSON.stringify(body) } : {}) })
const holding = (id = 'nvda') => db.holdings.find(h => h.id === id)!
const GBM_BUY = { holding_id: 'nvda', type: 'buy', shares: 0.34692423, price: 153.81, price_currency: 'USD', commission: 0.13, transaction_date: '2026-11-17', broker: 'GBM' }

beforeEach(() => {
  db.seq = 0
  db.missingTable = false
  db.txs.splice(0)
  db.holdings.splice(0, db.holdings.length,
    { id: 'nvda', ticker: 'NVDA', asset_type: 'stock', currency: 'USD', shares: 0, avg_cost_basis: null, owner: 'Bernardo', created_at: '2026-11-17T18:00:00Z' },
    { id: 'pe', ticker: 'NXM', asset_type: 'private_equity', currency: 'USD', shares: 10000, avg_cost_basis: 0.5, current_price_usd: 2, owner: 'bernardo' },
  )
})

describe('stock transactions', () => {
  it('logs the GBM NVDA buy: 8-decimal shares, commission in the cost, the day’s rate kept', async () => {
    const res = await POST(req('POST', GBM_BUY))
    expect(res.status).toBe(201)
    const paid = 0.34692423 * 153.81 + 0.13
    expect(db.txs[0]).toMatchObject({ type: 'buy', shares: 0.34692423, price: 153.81, commission: 0.13, fx_usd_mxn: 18.5, broker: 'GBM' })
    expect(Number(db.txs[0].total)).toBeCloseTo(paid, 9)
    expect(holding().shares).toBe(0.34692423)
    expect(Number(holding().avg_cost_basis)).toBeCloseTo(paid / 0.34692423, 9)
    // Nothing else was written: no opening lot for an empty holding.
    expect(db.txs).toHaveLength(1)
  })

  it('records a hand-entered balance as an opening lot before the first buy', async () => {
    Object.assign(holding(), { shares: 1, avg_cost_basis: 140 })
    await POST(req('POST', GBM_BUY))
    const opening = db.txs.find(t => String(t.notes).startsWith('Opening balance'))!
    expect(opening).toMatchObject({ type: 'buy', shares: 1, total: 140, price_currency: 'USD', transaction_date: '2026-11-17' })
    expect(holding().shares).toBeCloseTo(1.34692423, 8)
    expect(Number(holding().avg_cost_basis)).toBeCloseTo((140 + 0.34692423 * 153.81 + 0.13) / 1.34692423, 9)
    await POST(req('POST', { ...GBM_BUY, shares: 1, commission: 0 }))
    expect(db.txs.filter(t => String(t.notes).startsWith('Opening balance'))).toHaveLength(1)
  })

  it('asks for the cost of a balance entered without one before a buy (409), then uses it', async () => {
    Object.assign(holding(), { shares: 2, avg_cost_basis: null })
    const res = await POST(req('POST', GBM_BUY))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'opening_cost_required', shares: 2 })
    expect(db.txs).toHaveLength(0)

    const ok = await POST(req('POST', { ...GBM_BUY, opening_cost_per_share: 120 }))
    expect(ok.status).toBe(201)
    expect(Number(holding().avg_cost_basis)).toBeCloseTo((240 + 0.34692423 * 153.81 + 0.13) / 2.34692423, 9)
  })

  it('a sell keeps the average cost and refuses more shares than held', async () => {
    await POST(req('POST', { ...GBM_BUY, shares: 2, price: 100, commission: 0 }))
    const tooMany = await POST(req('POST', { holding_id: 'nvda', type: 'sell', shares: 2.5, price: 120 }))
    expect(tooMany.status).toBe(400)
    const res = await POST(req('POST', { holding_id: 'nvda', type: 'sell', shares: 0.5, price: 120, commission: 0.2 }))
    expect(res.status).toBe(201)
    expect(holding().shares).toBe(1.5)
    expect(Number(holding().avg_cost_basis)).toBeCloseTo(100, 9)
    expect(Number(db.txs.at(-1)!.total)).toBeCloseTo(59.8, 9)
  })

  it('deleting a transaction recalculates the holding', async () => {
    await POST(req('POST', GBM_BUY))
    await POST(req('POST', { ...GBM_BUY, shares: 1, price: 150, commission: 0 }))
    const first = db.txs[0]
    const res = await DELETE(req('DELETE', { id: first.id as string, holding_id: 'nvda' }))
    expect(res.status).toBe(200)
    expect(holding().shares).toBe(1)
    expect(Number(holding().avg_cost_basis)).toBeCloseTo(150, 9)
  })

  it('never touches private equity', async () => {
    const res = await POST(req('POST', { ...GBM_BUY, holding_id: 'pe' }))
    expect(res.status).toBe(409)
    expect(db.txs).toHaveLength(0)
    expect(holding('pe')).toMatchObject({ shares: 10000, avg_cost_basis: 0.5 })
    expect((await DELETE(req('DELETE', { id: 'x', holding_id: 'pe' }))).status).toBe(409)
  })

  it('validates the body', async () => {
    expect((await POST(req('POST', { ...GBM_BUY, type: 'gift' }))).status).toBe(400)
    expect((await POST(req('POST', { ...GBM_BUY, shares: -1 }))).status).toBe(400)
    expect((await POST(req('POST', { ...GBM_BUY, price_currency: 'EUR' }))).status).toBe(400)
    expect((await POST(req('POST', { ...GBM_BUY, transaction_date: '17/11/2026' }))).status).toBe(400)
    expect((await POST(req('POST', { ...GBM_BUY, holding_id: 'nope' }))).status).toBe(404)
  })

  it('lists transactions with their ticker and owner', async () => {
    await POST(req('POST', GBM_BUY))
    const body = await (await GET(req('GET'))).json()
    expect(body.migration_pending).toBe(false)
    expect(body.transactions[0]).toMatchObject({ ticker: 'NVDA', owner: 'Bernardo', type: 'buy' })
    expect(body.transactions[0].finance_stock_holdings).toBeUndefined()
  })
})

describe('before supabase-2026-11-stock-transactions.sql is applied', () => {
  beforeEach(() => { db.missingTable = true })

  it('answers 409 "database update pending" to a buy and leaves the holding alone', async () => {
    const res = await POST(req('POST', GBM_BUY))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('migration_pending')
    expect(body.error).toMatch(/Database update pending/)
    expect(holding()).toMatchObject({ shares: 0, avg_cost_basis: null })
  })

  it('GET says the ledger is pending instead of failing', async () => {
    const res = await GET(req('GET'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ transactions: [], migration_pending: true })
  })
})
