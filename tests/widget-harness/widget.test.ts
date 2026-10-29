// @vitest-environment node
// Runs the real widget script (src/widget/finance-widget.js) against the
// Scriptable mock and asserts on the produced widget tree (W17).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { createScriptableEnv, drawnTextSizes, inspectWidget, walkWidget, WIDGET_SIZES } from './scriptable-mock.js'
import * as FIXTURES from './fixtures.mjs'
import { cachedLastMonth, cachedTwoDaysAgo, dayOne, freshBrief, legacyV1, NOW_DAY_ONE, NOW_WEEKDAY, NOW_WEEKEND, overBudget, tightBudget, underBudget, weekend } from './fixtures.mjs'

const CODE = readFileSync(resolve(process.cwd(), 'src/widget/finance-widget.js'), 'utf8')
const LOADER = { API_URL: 'https://finance.autonomis.co/api/finance/widget', APP_URL: 'https://finance.autonomis.co/finance', WIDGET_TOKEN: 'phone-token-0123456789', API_KEY: '' }
const FAMILIES = Object.keys(WIDGET_SIZES)
const URL_RE = /^https:\/\/finance\.autonomis\.co\/finance/

type Options = Parameters<typeof createScriptableEnv>[0]
async function render(options: Options, loader: Record<string, unknown> = LOADER) {
  const env = createScriptableEnv({ now: NOW_WEEKDAY, ...options })
  const { widget, presented } = await env.run(CODE, loader)
  expect(widget).toBeTruthy()
  return { env, widget, presented, ...inspectWidget(widget) }
}

const CASES: Array<[string, Options]> = [
  ['over budget', { fixture: overBudget }],
  ['under budget', { fixture: underBudget }],
  ['tight', { fixture: tightBudget }],
  ['fresh brief', { fixture: freshBrief }],
  ['weekend', { fixture: weekend, now: NOW_WEEKEND }],
  ['day 1', { fixture: dayOne, now: NOW_DAY_ONE }],
  ['legacy v1 payload', { fixture: legacyV1 }],
  ['offline with cache', { fail: true, cache: overBudget }],
  ['offline, cache from 2 days ago', { fail: true, cache: cachedTwoDaysAgo }],
  ['offline, cache from last month', { fail: true, cache: cachedLastMonth }],
  ['offline, no cache', { fail: true }],
  ['401', { status: 401, fixture: { error: 'Unauthorized' } }],
  ['spanish', { fixture: overBudget, param: 'lang=es' }],
  ['goals', { fixture: overBudget, param: 'goals' }],
  ['coach', { fixture: freshBrief, param: 'coach' }],
  ['small phone', { fixture: overBudget, screen: { width: 375, height: 667 } }],
  ['no screen size', { fixture: overBudget, screen: null }],
]

describe('widget harness: every family and case', () => {
  for (const family of FAMILIES) {
    for (const [name, options] of CASES) {
      it(`${family} · ${name}`, async () => {
        const r = await render({ ...options, family })
        // (d) renders without throwing and produces content
        expect(r.texts.length + r.images.length).toBeGreaterThan(0)
        // (a) every link stays inside the app
        for (const url of r.urls) expect(url).toMatch(URL_RE)
        // (b) nothing under 11pt, even after iOS shrinks it to its minimumScaleFactor
        for (const t of r.texts) {
          const min = t.font.size * Math.min(1, t.minimumScaleFactor)
          expect(min, `"${t.text}" can shrink to ${min.toFixed(1)}pt`).toBeGreaterThanOrEqual(10.999)
        }
        for (const img of r.images) {
          for (const d of drawnTextSizes(img)) expect(d.size, `drawn "${d.text}" is ${d.size.toFixed(1)}pt`).toBeGreaterThanOrEqual(11)
        }
        // (e) lock-screen families never paint a background
        if (family.startsWith('accessory')) expect(r.backgrounds).toHaveLength(0)
        if (family === 'accessoryInline') expect(r.texts).toHaveLength(1)
        expect(r.widget.refreshAfterDate).toBeInstanceOf(Date)
      })
    }
  }
})

describe('widget content rules', () => {
  it('(c) shows no Mona/AI text when the brief is not from today', async () => {
    for (const family of FAMILIES) {
      const r = await render({ fixture: { ...overBudget, wolff: { top: { title: 'Sep 5–6: sí cabe una cena' } } }, family })
      expect(r.allText).not.toMatch(/Sep 5|cabe una cena|Protege/)
    }
    const large = await render({ fixture: overBudget, family: 'large' })
    expect(large.allText).toContain('Pause Other — $12k over')
  })

  it('uses a fresh brief title on the large footer', async () => {
    const r = await render({ fixture: freshBrief, family: 'large' })
    expect(r.allText).toContain('Hold Other spending through month end')
    expect(r.allText).not.toContain('Pause Other')
  })

  it('(f) a 401 shows the re-install message, even with cached numbers', async () => {
    for (const family of ['medium', 'small', 'accessoryRectangular']) {
      const r = await render({ status: 401, cache: overBudget, family })
      expect(r.allText).toContain('Re-install the widget from Family › Phone widget')
      expect(r.allText).not.toContain('$5,486')
    }
  })

  it('shows the signed hero as "Over budget" with the real period end (W3)', async () => {
    const r = await render({ fixture: overBudget, family: 'medium' })
    expect(r.allText).toContain('Over budget')
    expect(r.allText).toContain('$5,486')
    expect(r.allText).toContain('thru Sat Oct 31')
    // No "Over plan" chip: "plan" means the savings plan on home; the hero already says Over budget.
    expect(r.allText).not.toContain('Over plan')
    expect(r.allText).toContain('Wed Oct 28 · 4 days left')
    expect(r.allText).not.toMatch(/EXTRA TODAY|PROTECT THE PLAN|THROUGH SUNDAY/i)
  })

  it('names the status with a word, not colour alone', async () => {
    expect((await render({ fixture: underBudget, family: 'medium' })).allText).toContain('Within budget')
    expect((await render({ fixture: tightBudget, family: 'medium' })).allText).toContain('Tight')
  })

  it('deep-links each region (W16)', async () => {
    const r = await render({ fixture: overBudget, family: 'large' })
    expect(r.urls).toEqual(expect.arrayContaining([
      'https://finance.autonomis.co/finance',
      'https://finance.autonomis.co/finance/budgets',
      'https://finance.autonomis.co/finance/transactions',
      'https://finance.autonomis.co/finance/investments?tab=Real%20Estate',
      'https://finance.autonomis.co/finance/subscriptions',
    ]))
    expect(r.urls.some(u => u.startsWith('https://finance.autonomis.co/finance/ask?prompt='))).toBe(true)
    const small = await render({ fixture: overBudget, family: 'small' })
    expect(small.widget.url).toBe('https://finance.autonomis.co/finance/budgets')
    const smallOk = await render({ fixture: underBudget, family: 'small' })
    expect(smallOk.widget.url).toBe('https://finance.autonomis.co/finance')
    const quick = await render({ fixture: overBudget, family: 'accessoryRectangular', param: 'quickadd' })
    expect(quick.widget.url).toBe('https://finance.autonomis.co/finance/transactions?add=1')
  })

  it('serves cached numbers with an amber stamp when offline (W10)', async () => {
    const r = await render({ fail: true, cache: overBudget, family: 'medium' })
    expect(r.allText).toContain('$5,486')
    expect(r.allText).toMatch(/⚠︎ As of 9:15 AM/)
    const old = await render({ fail: true, cache: cachedTwoDaysAgo, family: 'medium' })
    expect(old.allText).toContain('⚠︎ As of Mon 9:15 AM')
    const oldRect = await render({ fail: true, cache: cachedTwoDaysAgo, family: 'accessoryRectangular' })
    expect(oldRect.allText).toContain('⚠︎ Mon 9:15 AM')
    const none = await render({ fail: true, family: 'medium' })
    expect(none.allText).toContain('Connect once to load your numbers')
  })

  it('never labels last month\'s cached numbers as this month\'s room', async () => {
    for (const family of ['small', 'medium', 'large']) {
      const r = await render({ fail: true, cache: cachedLastMonth, family })
      expect(r.allText).toContain('Last month')
      expect(r.allText).not.toContain('Left to spend')
      expect(r.allText).toContain('As of Sep 30')
    }
  })

  it('every v2 fixture\'s daily spend sums to the hero\'s spent', () => {
    for (const [name, f] of Object.entries(FIXTURES)) {
      const d = f as { v?: number; daily_spend?: number[]; variable?: { spent: number } }
      if (!d || typeof d !== 'object' || d.v !== 2) continue
      expect(d.daily_spend!.reduce((s, v) => s + v, 0), name).toBe(d.variable!.spent)
    }
  })

  it('draws the spend line from 0 on day 1 and today\'s total at x(today) (O1)', async () => {
    const spark = async (fixture: typeof overBudget, now = NOW_WEEKDAY) => {
      const r = await render({ fixture, family: 'medium', now })
      const img = r.images.map(i => i.image).find(i => i.paths.length > 10)!
      const W = img.size.width, pad = 15
      // The spend line is the path with the most points.
      const line = [...img.paths].sort((a, b) => b.length - a.length)[0].filter((op: unknown[]) => op[0] !== 'closePath')
      const xs = line.map((op: number[]) => op[1])
      return { W, pad, xs, line }
    }
    const { W, pad, xs, line } = await spark(overBudget)
    expect(xs[0]).toBeCloseTo(pad)
    expect(line[0][2]).toBeCloseTo(170 * 3 * 0 + 44 * 3 - pad) // y(0) at the bottom
    // 28 days of spend on a 31-day axis: today's total sits at x(28).
    expect(Math.max(...xs)).toBeCloseTo(pad + (28 / 31) * (W - pad * 2))
    const first = await spark(dayOne, NOW_DAY_ONE)
    expect(new Set(first.xs.map((x: number) => Math.round(x))).size).toBeGreaterThanOrEqual(2)
  })

  it('formats the period end on the device in Spanish', async () => {
    const r = await render({ fixture: overBudget, family: 'medium', param: 'lang=es' })
    expect(r.allText).not.toContain('Sat Oct 31')
    expect(r.allText).toMatch(/hasta sáb 31 oct/)
    const rect = await render({ fixture: underBudget, family: 'accessoryRectangular', param: 'lang=es' })
    expect(rect.allText).toMatch(/hasta sáb/)
  })

  it('labels the WEST ring as a percentage and the small widget "WEST · Oct"', async () => {
    const circ = await render({ fixture: overBudget, family: 'accessoryCircular' })
    expect(circ.images[0].image.texts.map((t: { text: string }) => t.text)).toContain('55%')
    const small = await render({ fixture: overBudget, family: 'small' })
    expect(small.allText).toContain('WEST · Oct')
    const se = await render({ fixture: overBudget, family: 'small', screen: { width: 375, height: 667 } })
    let sparks = 0
    walkWidget(se.widget, (n: { kind: string; image?: { paths: unknown[] } }) => { if (n.kind === 'image' && n.image!.paths.length > 10) sparks++ })
    expect(sparks).toBe(1)
  })

  it('caches the last good payload and sends the read-only token', async () => {
    const r = await render({ fixture: overBudget, family: 'medium' })
    expect(JSON.parse(r.env.files.get('/lib/mona-widget-data.json') as string).v).toBe(2)
    expect(r.env.requests[0].headers).toEqual({ 'x-widget-token': 'phone-token-0123456789' })
    expect(r.env.requests[0].timeoutInterval).toBe(10)
    const legacy = await render({ fixture: overBudget, family: 'medium' }, { ...LOADER, WIDGET_TOKEN: undefined, API_KEY: 'legacy' })
    expect(legacy.env.requests[0].headers).toEqual({ 'x-api-key': 'legacy' })
  })

  it('refreshes within 30 minutes, or just after midnight', async () => {
    const r = await render({ fixture: overBudget, family: 'medium' })
    expect(r.widget.refreshAfterDate.getTime() - new Date(NOW_WEEKDAY).getTime()).toBe(30 * 60 * 1000)
    const late = await render({ fixture: overBudget, family: 'medium', now: '2026-10-28T23:50:00-06:00' })
    expect(late.widget.refreshAfterDate.getHours()).toBe(0)
    expect(late.widget.refreshAfterDate.getMinutes()).toBe(5)
  })

  it('speaks Spanish with lang=es', async () => {
    const r = await render({ fixture: overBudget, family: 'large', param: 'lang=es' })
    expect(r.allText).toContain('Excedido')
    expect(r.allText).toContain('Pausa Other')
    expect(r.allText).not.toContain('Left to spend')
  })

  it('accepts a legacy v1 payload', async () => {
    const r = await render({ fixture: legacyV1, family: 'medium' })
    expect(r.allText).toContain('$5,486')
    expect(r.allText).not.toContain('cabe una cena')
  })

  it('previews in the app when not running in a widget', async () => {
    const r = await render({ fixture: overBudget, runsInWidget: false })
    expect(r.presented).toBe('medium')
  })
})

describe('Finance.js loader', () => {
  async function loaderResponse(env: Record<string, string | undefined>, query = 'slot=1') {
    const saved = { ...process.env }
    Object.assign(process.env, env)
    try {
      vi.resetModules()
      vi.doMock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
      const { GET } = await import('@/app/api/finance/widget-script/route')
      return await GET(new NextRequest(`https://finance.autonomis.co/api/finance/widget-script?${query}`))
    } finally {
      process.env = saved
    }
  }
  const loaderSource = async (env: Record<string, string | undefined>, query?: string) => (await loaderResponse(env, query)).text()

  it('embeds the per-phone read token, never FINANCE_API_KEY', async () => {
    const src = await loaderSource({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1,bbbbbbbbbbbbbbbb2', FINANCE_API_KEY: 'full-power-key' })
    expect(src).toContain('const WIDGET_TOKEN = "bbbbbbbbbbbbbbbb2"')
    expect(src).not.toContain('full-power-key')
    expect(() => new Function(`return (async () => {\n${src}\n})`)).not.toThrow()
  })

  it('fails closed while WIDGET_READ_TOKENS is unset, never embedding FINANCE_API_KEY', async () => {
    const res = await loaderResponse({ WIDGET_READ_TOKENS: '', FINANCE_API_KEY: 'legacy-key', WIDGET_ALLOW_LEGACY_KEY: '' })
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('legacy-key')
    const check = await loaderResponse({ WIDGET_READ_TOKENS: '', WIDGET_ALLOW_LEGACY_KEY: '' }, 'slot=0&check=1')
    expect(await check.json()).toMatchObject({ ready: false })
  })

  it('never hands Laura\u2019s slot Bernardo\u2019s token when only one is set', async () => {
    const res = await loaderResponse({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1', WIDGET_ALLOW_LEGACY_KEY: '' }, 'slot=1')
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('aaaaaaaaaaaaaaaa1')
    const check = await loaderResponse({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1', WIDGET_ALLOW_LEGACY_KEY: '' }, 'slot=1&check=1')
    expect(await check.json()).toMatchObject({ ready: false, message: expect.stringContaining('second WIDGET_READ_TOKENS entry') })
  })

  it('embeds the legacy key only with the explicit WIDGET_ALLOW_LEGACY_KEY opt-in', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const src = await loaderSource({ WIDGET_READ_TOKENS: '', FINANCE_API_KEY: 'legacy-key', WIDGET_ALLOW_LEGACY_KEY: '1' })
    expect(src).toContain('const API_KEY = "legacy-key"')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('caches the widget code and revalidates with the ETag at most every 6h', async () => {
    const src = await loaderSource({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1' }, 'slot=0')
    const files = new Map<string, string>()
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    const respond = ({ url, headers }: { url: string; headers: Record<string, string> }) => {
      calls.push({ url, headers })
      if (url.endsWith('/widget-code')) {
        return headers['If-None-Match'] === '"v1"' ? { status: 304, body: '' } : { status: 200, body: CODE, headers: { etag: '"v1"' } }
      }
      return { status: 200, body: JSON.stringify(overBudget) }
    }
    const run = async (now: string) => {
      calls.length = 0
      const env = createScriptableEnv({ family: 'medium', now, files, respond })
      return { ...(await env.run(src)), calls: [...calls] }
    }

    const first = await run('2026-10-28T09:00:00-06:00')
    expect(first.calls.map(c => c.url)).toEqual(['https://finance.autonomis.co/api/finance/widget-code', 'https://finance.autonomis.co/api/finance/widget'])
    expect(first.calls[0].headers['x-widget-token']).toBe('aaaaaaaaaaaaaaaa1')
    expect(inspectWidget(first.widget).allText).toContain('$5,486')

    const soon = await run('2026-10-28T12:00:00-06:00')
    expect(soon.calls.map(c => c.url)).toEqual(['https://finance.autonomis.co/api/finance/widget'])

    const later = await run('2026-10-28T15:30:00-06:00')
    expect(later.calls[0].headers['If-None-Match']).toBe('"v1"')
    expect(inspectWidget(later.widget).allText).toContain('$5,486')
  })

  it('shows the re-install notice when the token is revoked before any code is cached', async () => {
    const src = await loaderSource({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1' }, 'slot=0')
    const env = createScriptableEnv({ family: 'small', respond: () => ({ status: 401, body: '{"error":"Unauthorized"}' }) })
    const { widget } = await env.run(src)
    expect(inspectWidget(widget).allText).toContain('Re-install the widget')
  })
})
