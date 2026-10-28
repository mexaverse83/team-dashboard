// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const session = vi.hoisted(() => ({ email: null as string | null }))
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: async () => ({ auth: { getUser: async () => ({ data: { user: session.email ? { email: session.email } : null } }) } }),
}))
import { authorizeFinanceRequest, safeEqual } from '@/lib/finance-api-auth'
import { POST as migratePOST } from '@/app/api/finance/migrate/route'

const req = (headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/finance/net-worth', { headers })

beforeEach(() => {
  session.email = null
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_AUTH_BYPASS', '')
  vi.stubEnv('FINANCE_API_KEY', 'finance-key')
  vi.stubEnv('CRON_SECRET', 'cron-secret')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key')
})
afterEach(() => vi.unstubAllEnvs())

describe('authorizeFinanceRequest', () => {
  it('rejects a spoofed x-vercel-cron header', async () => {
    const result = await authorizeFinanceRequest(req({ 'x-vercel-cron': '1' }), { allowCron: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(401)
  })
  it('treats the CRON_SECRET bearer as cron, only where cron is allowed', async () => {
    expect(await authorizeFinanceRequest(req({ authorization: 'Bearer cron-secret' }), { allowCron: true })).toEqual({ ok: true, method: 'cron' })
    expect((await authorizeFinanceRequest(req({ authorization: 'Bearer cron-secret' }))).ok).toBe(false)
    expect((await authorizeFinanceRequest(req({ authorization: 'Bearer wrong' }), { allowCron: true })).ok).toBe(false)
  })
  it('never treats an unset CRON_SECRET as a match', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await authorizeFinanceRequest(req({ authorization: 'Bearer ' }), { allowCron: true })).ok).toBe(false)
  })
  it('accepts FINANCE_API_KEY as api-key, never as cron', async () => {
    expect(await authorizeFinanceRequest(req({ 'x-api-key': 'finance-key' }), { allowCron: true })).toEqual({ ok: true, method: 'api-key' })
    expect((await authorizeFinanceRequest(req({ 'x-api-key': 'finance-key-x' }))).ok).toBe(false)
  })
  it('accepts the service-role key as an API key only while the transition flag allows it', async () => {
    expect((await authorizeFinanceRequest(req({ 'x-api-key': 'service-key' }))).ok).toBe(true)
    vi.stubEnv('FINANCE_ALLOW_SERVICE_KEY_AS_API_KEY', '0')
    expect((await authorizeFinanceRequest(req({ 'x-api-key': 'service-key' }))).ok).toBe(false)
  })
  it('accepts an allow-listed session and reports its email', async () => {
    session.email = 'lcampomtz89@gmail.com'
    expect(await authorizeFinanceRequest(req())).toEqual({ ok: true, method: 'user', email: 'lcampomtz89@gmail.com' })
    session.email = 'stranger@example.com'
    expect((await authorizeFinanceRequest(req())).ok).toBe(false)
  })
})

describe('migrate route', () => {
  const call = (body: unknown, headers: Record<string, string> = {}) => migratePOST(new NextRequest('http://localhost/api/finance/migrate', {
    method: 'POST', body: JSON.stringify(body), headers: { 'x-api-key': 'finance-key', 'x-migration-secret': 'm-secret', ...headers },
  }))
  beforeEach(() => vi.stubEnv('MIGRATION_SECRET', 'm-secret'))
  it('is off unless ENABLE_MIGRATE_ROUTE=1', async () => {
    expect((await call({ migration: 'recurring-income' })).status).toBe(404)
  })
  it('refuses raw SQL and a wrong secret even when enabled', async () => {
    vi.stubEnv('ENABLE_MIGRATE_ROUTE', '1')
    expect((await call({ sql: 'drop table finance_transactions' })).status).toBe(400)
    expect((await call({ migration: 'recurring-income' }, { 'x-migration-secret': 'nope' })).status).toBe(401)
    expect((await call({ migration: 'recurring-income' }, { 'x-api-key': 'nope' })).status).toBe(401)
    expect((await call({ migration: 'constructor' })).status).toBe(400)
  })
})

describe('safeEqual', () => {
  it('compares in constant time and rejects empties and length mismatches', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('abc', 'abcd')).toBe(false)
    expect(safeEqual('', '')).toBe(false)
    expect(safeEqual(null, 'abc')).toBe(false)
  })
})
