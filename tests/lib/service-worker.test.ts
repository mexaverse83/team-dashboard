// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker() {
  const handlers: Record<string, (event: any) => void> = {}
  const fetch = vi.fn().mockResolvedValue({ ok: true, clone: () => 'static copy' })
  const put = vi.fn()
  const caches = { open: vi.fn().mockResolvedValue({ put }), match: vi.fn().mockResolvedValue('offline page') }
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    self: { location: { origin: 'https://finance.example' }, addEventListener: (name: string, handler: (e: any) => void) => { handlers[name] = handler } },
    fetch, caches, URL, Response,
  })
  return { handlers, fetch, caches, put }
}

describe('private finance PWA', () => {
  it('leaves API and mutation requests entirely outside the cache', () => {
    const { handlers, fetch } = worker()
    const respondWith = vi.fn()
    handlers.fetch({ request: { url: 'https://finance.example/api/finance/summary', method: 'GET' }, respondWith })
    handlers.fetch({ request: { url: 'https://finance.example/finance', method: 'POST' }, respondWith })
    expect(fetch).not.toHaveBeenCalled()
    expect(respondWith).not.toHaveBeenCalled()
  })
  it('returns a generic offline page for failed navigation without caching financial HTML', async () => {
    const { handlers, fetch, caches, put } = worker()
    fetch.mockRejectedValue(new Error('offline'))
    let result: Promise<unknown> | undefined
    handlers.fetch({ request: { url: 'https://finance.example/finance', method: 'GET', mode: 'navigate' }, respondWith: (value: Promise<unknown>) => { result = value } })
    expect(await result).toBe('offline page')
    expect(caches.match).toHaveBeenCalledWith('/offline.html')
    expect(put).not.toHaveBeenCalled()
  })
  it('does not store successful private page responses', async () => {
    const { handlers, caches } = worker()
    let result: Promise<unknown> | undefined
    handlers.fetch({ request: { url: 'https://finance.example/finance', method: 'GET', mode: 'navigate' }, respondWith: (value: Promise<unknown>) => { result = value } })
    await result
    expect(caches.open).not.toHaveBeenCalled()
  })
})
