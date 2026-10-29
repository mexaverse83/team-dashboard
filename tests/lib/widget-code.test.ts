// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
import { GET } from '@/app/api/finance/widget-code/route'

const source = readFileSync(resolve(process.cwd(), 'src/widget/finance-widget.js'), 'utf8')

describe('widget-code route', () => {
  it('serves the widget script raw, with an ETag', async () => {
    const res = await GET(new NextRequest('https://finance.autonomis.co/api/finance/widget-code'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/javascript')
    expect(await res.text()).toBe(source)
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{16}"$/)
  })

  it('answers 304 when the phone already has this version', async () => {
    const first = await GET(new NextRequest('https://finance.autonomis.co/api/finance/widget-code'))
    const etag = first.headers.get('ETag') as string
    const res = await GET(new NextRequest('https://finance.autonomis.co/api/finance/widget-code', { headers: { 'if-none-match': etag } }))
    expect(res.status).toBe(304)
    expect(await res.text()).toBe('')
  })
})

describe('widget script source', () => {
  it('the bundled string matches finance-widget.js (run: node src/widget/sync-source.mjs)', async () => {
    const { renderSourceModule } = await import('../../src/widget/sync-source.mjs')
    const generated = readFileSync(resolve(process.cwd(), 'src/widget/finance-widget.source.ts'), 'utf8')
    expect(generated).toBe(renderSourceModule(source))
  })

  it('the route reads nothing from disk', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/finance/widget-code/route.ts'), 'utf8')
    expect(route).not.toMatch(/readFileSync|node:fs/)
  })

  it('stays valid inside the loader\'s async wrapper', () => {
    expect(() => new Function(`return (async () => {\n${source}\n})`)).not.toThrow()
  })

  it('keeps the v1-loader marker and drops the retired v1 metrics and avatar', () => {
    // Loaders downloaded before v2 only accept code containing this word.
    expect(source).toContain('smartScreen')
    expect(source).not.toMatch(/EXTRA TODAY|PROTECT THE PLAN|THROUGH SUNDAY/)
    expect(source).not.toContain('wolff-widget.png')
    expect(source).not.toMatch(/APP_URL\.replace\(['"]/)
  })
})
