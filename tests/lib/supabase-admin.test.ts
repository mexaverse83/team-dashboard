import { describe, expect, it, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((url: string, key: string) => ({ url, key })),
}))

import { ConfigError, configErrorResponse, DEGRADED_HEADER, getAdminClient, getAdminClientInfo, isAdminClientDegraded, withDegradedHeader } from '@/lib/supabase-admin'

const base = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' }
const env = (extra: Record<string, string>) => ({ ...base, ...extra }) as unknown as NodeJS.ProcessEnv

describe('getAdminClient', () => {
  it('uses the service role key when present', () => {
    const info = getAdminClientInfo(env({ NODE_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'service' }))
    expect(info.degraded).toBe(false)
    expect((info.client as unknown as { key: string }).key).toBe('service')
  })

  it('throws ConfigError in production without the service key (no anon fallback)', () => {
    expect(() => getAdminClient(env({ NODE_ENV: 'production', NEXT_PUBLIC_AUTH_BYPASS: '1' }))).toThrow(ConfigError)
  })

  it('dev falls back to anon only with the auth bypass, flagged degraded', () => {
    const info = getAdminClientInfo(env({ NODE_ENV: 'development', NEXT_PUBLIC_AUTH_BYPASS: '1' }))
    expect(info.degraded).toBe(true)
    expect((info.client as unknown as { key: string }).key).toBe('anon')
    expect(isAdminClientDegraded(env({ NODE_ENV: 'development', NEXT_PUBLIC_AUTH_BYPASS: '1' }))).toBe(true)
    expect(() => getAdminClient(env({ NODE_ENV: 'development' }))).toThrow(ConfigError)
  })

  it('reuses one client per key', () => {
    const e = env({ NODE_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'service' })
    expect(getAdminClient(e)).toBe(getAdminClient(e))
  })

  it('throws when the URL is missing', () => {
    expect(() => getAdminClient({ SUPABASE_SERVICE_ROLE_KEY: 's' } as unknown as NodeJS.ProcessEnv)).toThrow(ConfigError)
  })
})

describe('response helpers', () => {
  it('tags degraded responses', () => {
    expect(withDegradedHeader(new Response('{}'), true).headers.get(DEGRADED_HEADER)).toBe('1')
    expect(withDegradedHeader(new Response('{}'), false).headers.get(DEGRADED_HEADER)).toBeNull()
  })

  it('maps ConfigError to a 503 and rethrows anything else', async () => {
    const res = configErrorResponse(new ConfigError('missing'))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: 'config' })
    expect(() => configErrorResponse(new Error('boom'))).toThrow('boom')
  })
})
