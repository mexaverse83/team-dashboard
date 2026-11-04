// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  holdings: [] as Row[],
  txs: [] as Row[],
  seq: 0,
  /** Simulate a database that hasn't run supabase-2026-11-crypto-any-coin.sql. */
  migrated: true,
  log: [] as Array<{ table: string; op: string; filters: Array<[string, string, unknown]> }>,
}))

vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/crypto-prices', () => ({ fetchCryptoPrices: vi.fn(async () => ({ BTC: { usd: 100_000, mxn: 1_800_000, change24h: 0 } })) }))
vi.mock('@/lib/supabase-admin', () => {
  const BUILTIN = ['BTC', 'ETH', 'SOL', 'KAS', 'LIT', 'AERO', 'HYPE']
  const table = (name: string) => (name === 'finance_crypto_holdings' ? db.holdings : db.txs)
  const builder = (name: string) => {
    const filters: Array<[string, string, unknown]> = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Row = {}
    let single = false
    const match = (r: Row) => filters.every(([kind, k, v]) => kind === 'eq' ? r[k] === v : (v as unknown[]).includes(r[k]))
    const run = () => {
      if (op !== 'select') db.log.push({ table: name, op, filters: [...filters] })
      if (op === 'insert') {
        if (!db.migrated && name === 'finance_crypto_holdings') {
          if ('coingecko_id' in payload) return { data: null, error: { code: 'PGRST204', message: "Could not find the 'coingecko_id' column of 'finance_crypto_holdings' in the schema cache" } }
          if (!BUILTIN.includes(String(payload.symbol))) return { data: null, error: { code: '23514', message: 'violates check constraint "finance_crypto_holdings_symbol_check"' } }
        }
        const row = { id: `h-${++db.seq}`, ...payload }
        table(name).push(row)
        return { data: row, error: null }
      }
      if (op === 'update') { table(name).filter(match).forEach(r => Object.assign(r, payload)); return { data: table(name).find(match) ?? null, error: null } }
      if (op === 'delete') {
        const keep = table(name).filter(r => !match(r))
        table(name).splice(0, table(name).length, ...keep)
        return { data: null, error: null }
      }
      const out = table(name).filter(match)
      return { data: single ? out[0] ?? null : out, error: null }
    }
    const chain: Record<string, unknown> = {
      select: () => chain,
      insert: (p: Row) => { op = 'insert'; payload = p; return chain },
      update: (p: Row) => { op = 'update'; payload = p; return chain },
      delete: () => { op = 'delete'; return chain },
      eq: (k: string, v: unknown) => { filters.push(['eq', k, v]); return chain },
      in: (k: string, v: unknown[]) => { filters.push(['in', k, v]); return chain },
      order: () => chain,
      single: () => { single = true; return chain },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    }
    return chain
  }
  const client = { from: builder }
  return {
    getAdminClient: () => client,
    getAdminClientInfo: () => ({ client, degraded: false }),
    withDegradedHeader: (res: Response) => res,
    ConfigError: class extends Error {},
    configErrorResponse: () => new Response(null, { status: 503 }),
  }
})

import { DELETE, GET, POST } from '@/app/api/finance/crypto/route'
import { fetchCryptoPrices } from '@/lib/crypto-prices'

const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/finance/crypto', { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

beforeEach(() => {
  db.holdings = []; db.txs = []; db.seq = 0; db.migrated = true; db.log = []
  vi.mocked(fetchCryptoPrices).mockClear()
})

describe('POST /api/finance/crypto — any coin', () => {
  it('adds a non-built-in coin with its CoinGecko id and name', async () => {
    const res = await POST(req('POST', { symbol: 'pepe', name: 'Pepe', coingecko_id: 'pepe', owner: 'laura', quantity: 1_000_000, avg_cost_basis_usd: 0.0002 }))
    expect(res.status).toBe(201)
    expect(db.holdings).toEqual([expect.objectContaining({ symbol: 'PEPE', name: 'Pepe', coingecko_id: 'pepe', owner: 'Laura', quantity: 1_000_000, avg_cost_basis_usd: 0.0002, cost_currency: 'MXN' })])
  })

  it('fills in the id and name of a built-in coin', async () => {
    await POST(req('POST', { symbol: 'SOL', quantity: 0, owner: 'Bernardo' }))
    expect(db.holdings[0]).toMatchObject({ symbol: 'SOL', name: 'Solana', coingecko_id: 'solana' })
  })

  it.each([
    [{ symbol: 'NOPE', quantity: 0 }, /coin search/],
    [{ symbol: 'BAD TICKER!', coingecko_id: 'x', quantity: 0 }, /Invalid symbol/],
    [{ symbol: 'DOGE', coingecko_id: '../../etc', quantity: 0 }, /Invalid coin id/],
    [{ symbol: 'DOGE', coingecko_id: 'dogecoin', quantity: -1 }, /Invalid quantity/],
    [{ symbol: 'DOGE', coingecko_id: 'dogecoin' }, /Invalid quantity/],
    [{ symbol: 'DOGE', coingecko_id: 'dogecoin', quantity: 1, cost_currency: 'EUR' }, /Invalid cost currency/],
    [{ symbol: 'DOGE', coingecko_id: 'dogecoin', quantity: 1, avg_cost_basis_usd: 'lots' }, /Invalid cost basis/],
  ])('rejects %o', async (body, message) => {
    const res = await POST(req('POST', body))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(message)
    expect(db.holdings).toHaveLength(0)
  })

  it('refuses a second coin under a ticker already held, with a clear message', async () => {
    db.holdings.push({ id: 'lit-1', symbol: 'LIT', name: 'Lighter', owner: 'Bernardo', quantity: 5, coingecko_id: 'lighter' })
    const res = await POST(req('POST', { symbol: 'LIT', name: 'Litentry', coingecko_id: 'litentry', owner: 'Laura', quantity: 0 }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ticker_taken')
    expect(body.error).toMatch(/already hold Lighter under the ticker LIT/)
    expect(db.holdings).toHaveLength(1)
  })

  it('lets the other owner add the same coin', async () => {
    db.holdings.push({ id: 'p-1', symbol: 'PEPE', name: 'Pepe', owner: 'Bernardo', quantity: 5, coingecko_id: 'pepe' })
    const res = await POST(req('POST', { symbol: 'PEPE', name: 'Pepe', coingecko_id: 'pepe', owner: 'Laura', quantity: 0 }))
    expect(res.status).toBe(201)
  })

  it('treats a pre-migration row (no coingecko_id) as its built-in coin when checking the ticker', async () => {
    db.holdings.push({ id: 'lit-1', symbol: 'LIT', name: 'Lighter', owner: 'Bernardo', quantity: 5 })
    expect((await POST(req('POST', { symbol: 'LIT', coingecko_id: 'litentry', quantity: 0 }))).status).toBe(409)
    expect((await POST(req('POST', { symbol: 'LIT', coingecko_id: 'lighter', owner: 'Laura', quantity: 0 }))).status).toBe(201)
  })

  describe('before the any-coin migration is applied', () => {
    beforeEach(() => { db.migrated = false })

    it('still adds a built-in coin (retries without coingecko_id)', async () => {
      const res = await POST(req('POST', { symbol: 'BTC', quantity: 0, owner: 'laura' }))
      expect(res.status).toBe(201)
      expect(db.holdings).toEqual([expect.objectContaining({ symbol: 'BTC', name: 'Bitcoin', owner: 'Laura' })])
      expect('coingecko_id' in db.holdings[0]).toBe(false)
    })

    it('refuses any other coin with "database update pending"', async () => {
      const res = await POST(req('POST', { symbol: 'DOGE', name: 'Dogecoin', coingecko_id: 'dogecoin', quantity: 1 }))
      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.code).toBe('migration_pending')
      expect(body.error).toMatch(/Database update pending/)
      expect(db.holdings).toHaveLength(0)
    })

    it('refuses a built-in ticker that means another coin', async () => {
      const res = await POST(req('POST', { symbol: 'LIT', coingecko_id: 'litentry', quantity: 0 }))
      expect(res.status).toBe(409)
      expect((await res.json()).code).toBe('migration_pending')
    })
  })

  it('edits never change which coin a holding is', async () => {
    db.holdings.push({ id: 'h1', symbol: 'BTC', name: 'Bitcoin', owner: 'Bernardo', quantity: 1, coingecko_id: 'bitcoin' })
    const res = await POST(req('POST', { id: 'h1', symbol: 'ETH', notes: 'cold', coingecko_id: 'ethereum' }))
    expect(res.status).toBe(200)
    expect(db.holdings[0]).toMatchObject({ symbol: 'BTC', coingecko_id: 'bitcoin', notes: 'cold', quantity: 1 })
  })
})

describe('GET /api/finance/crypto', () => {
  it('prices the built-in coins plus every held coin by its own id', async () => {
    db.holdings.push({ id: 'p', symbol: 'PEPE', owner: 'Laura', quantity: 1, coingecko_id: 'pepe' })
    const res = await GET(new NextRequest('http://localhost/api/finance/crypto'))
    expect(res.status).toBe(200)
    const [coins] = vi.mocked(fetchCryptoPrices).mock.calls[0]
    expect(coins).toEqual(expect.arrayContaining(['BTC', 'HYPE', expect.objectContaining({ symbol: 'PEPE', coingecko_id: 'pepe' })]))
  })
})

describe('DELETE /api/finance/crypto', () => {
  beforeEach(() => {
    db.holdings.push(
      { id: 'sol-b', symbol: 'SOL', owner: 'Bernardo', quantity: 1.71 },
      { id: 'sol-l', symbol: 'SOL', owner: 'laura', quantity: 0.36 },
      { id: 'btc-b', symbol: 'BTC', owner: 'Bernardo', quantity: 0.1 },
    )
    db.txs.push(
      { id: 't1', holding_id: 'sol-b' }, { id: 't2', holding_id: 'sol-l' }, { id: 't3', holding_id: 'btc-b' },
    )
  })

  it("removes one owner's holding and only its transactions", async () => {
    const res = await DELETE(req('DELETE', { id: 'sol-l' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, deleted: 1 })
    expect(db.holdings.map(h => h.id)).toEqual(['sol-b', 'btc-b'])
    expect(db.txs.map(t => t.id)).toEqual(['t1', 't3'])
    // Transactions go first, then the holding.
    expect(db.log.map(l => l.table)).toEqual(['crypto_transactions', 'finance_crypto_holdings'])
  })

  it('removes a whole coin for both owners by ids', async () => {
    await DELETE(req('DELETE', { ids: ['sol-b', 'sol-l'] }))
    expect(db.holdings.map(h => h.id)).toEqual(['btc-b'])
    expect(db.txs.map(t => t.id)).toEqual(['t3'])
  })

  it('removes a whole coin by ticker, optionally only one owner (any casing)', async () => {
    await DELETE(req('DELETE', { symbol: 'sol', owner: 'Laura' }))
    expect(db.holdings.map(h => h.id)).toEqual(['sol-b', 'btc-b'])
    await DELETE(req('DELETE', { symbol: 'SOL' }))
    expect(db.holdings.map(h => h.id)).toEqual(['btc-b'])
    expect(db.txs.map(t => t.id)).toEqual(['t3'])
  })

  it('answers 404 when the ticker is not held, and 400 without a target', async () => {
    expect((await DELETE(req('DELETE', { symbol: 'DOGE' }))).status).toBe(404)
    expect((await DELETE(req('DELETE', {}))).status).toBe(400)
    expect((await DELETE(req('DELETE', { ids: [] }))).status).toBe(400)
    expect((await DELETE(req('DELETE', { ids: [1, 2] }))).status).toBe(400)
    expect(db.holdings).toHaveLength(3)
  })
})
