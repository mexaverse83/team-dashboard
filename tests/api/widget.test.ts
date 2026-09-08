// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/finance-review.json'
import { calculateDailyPlan } from '@/lib/daily-plan'
vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
import { GET } from '@/app/api/finance/widget/route'

afterEach(() => vi.unstubAllGlobals())
describe('phone widget financial consistency', () => {
  it('agrees with the dashboard and separates received income from expected income', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('summary') ? fixture.summary : url.includes('west-projection') ? fixture.west : fixture.insights })))
    const response = await GET(new NextRequest('http://localhost/api/finance/widget'))
    const data = await response.json()
    expect(data.net_this_month).toBe(21800)
    expect(data.safe_to_spend_day).toBe(calculateDailyPlan(fixture.summary, 18000).safe_to_spend_day)
    expect(data.projected_savings).toBe(22000)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
  it('does not return a successful zero balance after a summary outage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
    expect((await GET(new NextRequest('http://localhost/api/finance/widget'))).status).toBe(500)
  })
})
