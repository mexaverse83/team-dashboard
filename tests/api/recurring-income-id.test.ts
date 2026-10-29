// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ configured: true, updates: [] as unknown[] }))

vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
vi.mock('@/lib/supabase-admin', () => {
  class ConfigError extends Error {}
  return {
    ConfigError,
    getAdminClient: () => {
      if (!state.configured) throw new ConfigError('SUPABASE_SERVICE_ROLE_KEY missing')
      const chain: Record<string, unknown> = {}
      chain.update = (u: unknown) => { state.updates.push(u); return chain }
      chain.eq = () => chain
      chain.select = () => chain
      chain.single = async () => ({ data: { id: 'r1', active: false }, error: null })
      return { from: () => chain }
    },
    configErrorResponse: (err: unknown) => {
      if (err instanceof ConfigError) return Response.json({ error: 'Financial data is temporarily unavailable', reason: 'config' }, { status: 503 })
      throw err
    },
  }
})

import { DELETE, PUT } from '@/app/api/finance/recurring-income/[id]/route'

const params = { params: Promise.resolve({ id: 'r1' }) }
const req = (method: string, body?: unknown) => new NextRequest('http://localhost/api/finance/recurring-income/r1', { method, body: body ? JSON.stringify(body) : undefined })

beforeEach(() => { state.configured = true; state.updates = [] })

describe('/api/finance/recurring-income/[id]', () => {
  it('answers 503 config without the service key instead of writing with the anon key', async () => {
    state.configured = false
    const put = await PUT(req('PUT', { amount: 1 }), params)
    expect(put.status).toBe(503)
    expect(await put.json()).toMatchObject({ reason: 'config' })
    expect((await DELETE(req('DELETE'), params)).status).toBe(503)
    expect(state.updates).toEqual([])
  })

  it('updates through the admin client', async () => {
    const res = await PUT(req('PUT', { amount: '18500', bogus: 1 }), params)
    expect(res.status).toBe(200)
    expect(state.updates).toEqual([{ amount: 18500 }])
    const del = await DELETE(req('DELETE'), params)
    expect(await del.json()).toMatchObject({ deactivated: true })
  })
})
