// @vitest-environment node
// The daily push must only ever send from the scheduler or an API-key POST:
// a signed-in GET (the app) previews, a session POST is refused, and a send
// that reaches nobody gives its dedupe key back.
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  auth: { ok: true, method: 'user' } as Record<string, unknown>,
  sendPush: vi.fn(),
  hasPushAudience: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  recordRun: vi.fn(),
}))
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => m.auth }))
vi.mock('@/lib/supabase-admin', () => ({ getAdminClient: () => ({}), configErrorResponse: () => new Response(null, { status: 503 }) }))
vi.mock('@/lib/automation/live-brief', () => ({
  loadLiveBrief: async () => ({ brief: {} }),
  latestCachedBrief: async () => null,
  freshLlmDirective: () => null,
  dailyPushMessage: () => ({ title: 'On plan', body: 'b', url: '/finance' }),
}))
vi.mock('@/lib/automation/push', () => ({ sendPush: m.sendPush, hasPushAudience: m.hasPushAudience }))
vi.mock('@/lib/automation/runs', () => ({
  claimDedupeKey: m.claim, releaseDedupeKey: m.release, recordRun: m.recordRun, triggerFromAuth: () => 'test',
}))
import { GET, POST } from '@/app/api/finance/push/daily/route'

const url = 'http://localhost/api/finance/push/daily'
beforeEach(() => {
  m.auth = { ok: true, method: 'user' }
  m.sendPush.mockReset().mockResolvedValue({ sent: 2, failed: 0, targeted: 2 })
  m.hasPushAudience.mockReset().mockResolvedValue(true)
  m.claim.mockReset().mockResolvedValue('claimed')
  m.release.mockReset().mockResolvedValue(undefined)
  m.recordRun.mockReset().mockResolvedValue(undefined)
})

describe('push/daily send guards', () => {
  it('a session GET previews and never sends', async () => {
    const body = await (await GET(new NextRequest(url))).json()
    expect(body.preview).toBe(true)
    expect(m.sendPush).not.toHaveBeenCalled()
    expect(m.claim).not.toHaveBeenCalled()
  })
  it('a session POST is refused', async () => {
    const res = await POST(new NextRequest(url, { method: 'POST' }))
    expect(res.status).toBe(403)
    expect(m.sendPush).not.toHaveBeenCalled()
  })
  it('the cron GET sends once', async () => {
    m.auth = { ok: true, method: 'cron' }
    const body = await (await GET(new NextRequest(url))).json()
    expect(m.sendPush).toHaveBeenCalledTimes(1)
    expect(body.sent).toBe(2)
    expect(m.claim).toHaveBeenCalledWith(expect.anything(), 'push-daily', expect.stringMatching(/^push-daily:\d{4}-\d{2}-\d{2}$/))
  })
  it('skips when today is already claimed', async () => {
    m.auth = { ok: true, method: 'api-key' }
    m.claim.mockResolvedValue('duplicate')
    const body = await (await POST(new NextRequest(url, { method: 'POST' }))).json()
    expect(body.skipped).toBe('already-sent')
    expect(m.sendPush).not.toHaveBeenCalled()
  })
  it('gives the key back when nothing was delivered', async () => {
    m.auth = { ok: true, method: 'cron' }
    m.sendPush.mockResolvedValue({ sent: 0, failed: 2, targeted: 2 })
    await GET(new NextRequest(url))
    expect(m.release).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^push-daily:/))
  })
  it('does not claim or send without an audience', async () => {
    m.auth = { ok: true, method: 'cron' }
    m.hasPushAudience.mockResolvedValue(false)
    const body = await (await GET(new NextRequest(url))).json()
    expect(body.skipped).toBe('no-audience')
    expect(m.claim).not.toHaveBeenCalled()
    expect(m.sendPush).not.toHaveBeenCalled()
  })
})
