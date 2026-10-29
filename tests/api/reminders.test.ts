// @vitest-environment node
// Reminders send only from the scheduler or an API-key POST; each reminder is
// claimed once and its key is given back when nothing was delivered.
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
vi.mock('@/lib/supabase-admin', () => {
  // Generically chainable: every builder method returns the chain; awaiting resolves empty.
  const chain: Record<string, unknown> = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
      return () => chain
    },
  })
  return { getAdminClient: () => ({ from: () => chain }), configErrorResponse: () => new Response(null, { status: 503 }) }
})
vi.mock('@/lib/automation/live-brief', () => ({
  loadLiveBrief: async () => { throw new Error('no summary in tests') },
  financeLocale: () => 'en',
}))
vi.mock('@/lib/automation/reminders', () => ({
  buildReminders: () => [{ key: 'card-due:2026-10-29', kind: 'card-due', owner: null, title: 'Card due', body: 'b', url: '/finance' }],
}))
vi.mock('@/lib/automation/push', () => ({ sendPush: m.sendPush, hasPushAudience: m.hasPushAudience }))
vi.mock('@/lib/automation/runs', () => ({
  claimDedupeKey: m.claim, releaseDedupeKey: m.release, recordRun: m.recordRun, triggerFromAuth: () => 'test',
}))
import { GET, POST } from '@/app/api/finance/reminders/route'

const url = 'http://localhost/api/finance/reminders'
beforeEach(() => {
  m.auth = { ok: true, method: 'user' }
  m.sendPush.mockReset().mockResolvedValue({ sent: 1, failed: 0, targeted: 1 })
  m.hasPushAudience.mockReset().mockResolvedValue(true)
  m.claim.mockReset().mockResolvedValue('claimed')
  m.release.mockReset().mockResolvedValue(undefined)
  m.recordRun.mockReset().mockResolvedValue(undefined)
})

describe('reminders send guards', () => {
  it('a session GET lists reminders without sending', async () => {
    const body = await (await GET(new NextRequest(url))).json()
    expect(body.sent).toBe(false)
    expect(body.reminders).toHaveLength(1)
    expect(m.sendPush).not.toHaveBeenCalled()
    expect(m.claim).not.toHaveBeenCalled()
  })
  it('a session POST is refused', async () => {
    expect((await POST(new NextRequest(url, { method: 'POST' }))).status).toBe(403)
    expect(m.sendPush).not.toHaveBeenCalled()
  })
  it('the cron GET claims and sends each reminder once', async () => {
    m.auth = { ok: true, method: 'cron' }
    const body = await (await GET(new NextRequest(url))).json()
    expect(m.claim).toHaveBeenCalledWith(expect.anything(), 'reminders', 'reminder:card-due:2026-10-29', expect.anything())
    expect(m.sendPush).toHaveBeenCalledTimes(1)
    expect(body.sent).toBe(1)
  })
  it('skips a reminder already claimed', async () => {
    m.auth = { ok: true, method: 'api-key' }
    m.claim.mockResolvedValue('duplicate')
    const body = await (await POST(new NextRequest(url, { method: 'POST' }))).json()
    expect(m.sendPush).not.toHaveBeenCalled()
    expect(body.outcomes).toEqual([{ key: 'card-due:2026-10-29', status: 'duplicate' }])
  })
  it('gives the key back when no device received it', async () => {
    m.auth = { ok: true, method: 'cron' }
    m.sendPush.mockResolvedValue({ sent: 0, failed: 1, targeted: 1 })
    await GET(new NextRequest(url))
    expect(m.release).toHaveBeenCalledWith(expect.anything(), 'reminder:card-due:2026-10-29')
  })
})
