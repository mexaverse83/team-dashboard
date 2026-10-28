// Server-side Supabase access for API routes (CH-07, F18).
//
// Production: the service-role key is REQUIRED. A missing key throws
// ConfigError (routes answer 503) instead of silently falling back to the
// anon key, where RLS returns empty arrays that look like real zeros.
// Development: anon is allowed only with NEXT_PUBLIC_AUTH_BYPASS=1, and the
// client is flagged `degraded` so responses can say "partial data".
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export const DEGRADED_HEADER = 'x-finance-data-degraded'

export interface AdminClientInfo {
  client: SupabaseClient
  /** True when running on the anon key (dev bypass only): reads may be RLS-filtered. */
  degraded: boolean
}

const cache = new Map<string, SupabaseClient>()

function clientFor(url: string, key: string): SupabaseClient {
  const cacheKey = `${url}|${key}`
  let client = cache.get(cacheKey)
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    cache.set(cacheKey, client)
  }
  return client
}

export function getAdminClientInfo(env: NodeJS.ProcessEnv = process.env): AdminClientInfo {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new ConfigError('NEXT_PUBLIC_SUPABASE_URL is not set')
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (serviceKey) return { client: clientFor(url, serviceKey), degraded: false }

  if (env.NODE_ENV === 'production') {
    throw new ConfigError('SUPABASE_SERVICE_ROLE_KEY is not set; refusing to serve RLS-filtered data in production')
  }
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (env.NEXT_PUBLIC_AUTH_BYPASS === '1' && anonKey) {
    return { client: clientFor(url, anonKey), degraded: true }
  }
  throw new ConfigError('SUPABASE_SERVICE_ROLE_KEY is not set (dev may use the anon key only with NEXT_PUBLIC_AUTH_BYPASS=1)')
}

/** The service-role client, or (dev bypass only) a degraded anon client. Throws ConfigError otherwise. */
export function getAdminClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  return getAdminClientInfo(env).client
}

/** Whether getAdminClient() would currently hand out a degraded (anon) client. */
export function isAdminClientDegraded(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    return getAdminClientInfo(env).degraded
  } catch {
    return false
  }
}

/** Tags a response `x-finance-data-degraded: 1` when the data came from the anon fallback. */
export function withDegradedHeader<T extends Response>(res: T, degraded: boolean = isAdminClientDegraded()): T {
  if (degraded) res.headers.set(DEGRADED_HEADER, '1')
  return res
}

/** Standard 503 for a ConfigError; rethrows anything else. */
export function configErrorResponse(err: unknown): Response {
  if (err instanceof ConfigError) {
    return Response.json({ error: 'Financial data is temporarily unavailable', reason: 'config' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
  throw err
}
