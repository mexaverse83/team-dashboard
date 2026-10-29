// @vitest-environment node
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

function worker(cached: Record<string, unknown> = {}) {
  const handlers: Record<string, (event: any) => void> = {}
  const fetch = vi.fn().mockResolvedValue({ ok: true, clone: () => 'static copy' })
  const put = vi.fn().mockResolvedValue(undefined)
  const keys = vi.fn().mockResolvedValue([])
  const cache = { put, keys, delete: vi.fn(), add: vi.fn().mockResolvedValue(undefined) }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn(async (req: unknown) => {
      const key = typeof req === 'string' ? req : (req as { url: string }).url
      return key === '/offline.html' ? 'offline page' : cached[key]
    }),
    keys: vi.fn().mockResolvedValue(['finance-pwa-v5', 'finance-pwa-v6', 'other-cache']),
    delete: vi.fn().mockResolvedValue(true),
  }
  const skipWaiting = vi.fn()
  const self = {
    location: { origin: 'https://finance.example' },
    addEventListener: (name: string, handler: (e: any) => void) => { handlers[name] = handler },
    skipWaiting,
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
  }
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, fetch, caches, URL, Response })
  const run = async (url: string, extra: Record<string, unknown> = {}) => {
    let result: Promise<unknown> | undefined
    handlers.fetch({ request: { url, method: 'GET', ...extra }, respondWith: (value: Promise<unknown>) => { result = value }, waitUntil: vi.fn() })
    return result === undefined ? 'passthrough' : await result
  }
  return { handlers, fetch, caches, put, skipWaiting, run }
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
    const { fetch, caches, put, run } = worker()
    fetch.mockRejectedValue(new Error('offline'))
    expect(await run('https://finance.example/finance', { mode: 'navigate' })).toBe('offline page')
    expect(caches.match).toHaveBeenCalledWith('/offline.html')
    expect(put).not.toHaveBeenCalled()
  })
  it('does not store successful private page responses', async () => {
    const { caches, run } = worker()
    await run('https://finance.example/finance', { mode: 'navigate' })
    expect(caches.open).not.toHaveBeenCalled()
  })
})

describe('service worker cache strategy', () => {
  it('serves hashed Next chunks and icons from the cache without touching the network', async () => {
    const chunk = 'https://finance.example/_next/static/chunks/app.js'
    const icon = 'https://finance.example/icons/icon-192.png'
    const { fetch, run } = worker({ [chunk]: 'cached chunk', [icon]: 'cached icon' })
    expect(await run(chunk)).toBe('cached chunk')
    expect(await run(icon)).toBe('cached icon')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('fetches and stores a cache-first asset on a miss', async () => {
    const { fetch, put, run } = worker()
    await run('https://finance.example/manifest.webmanifest')
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(put).toHaveBeenCalled())
  })
  it('answers brand images from cache and revalidates them in the background', async () => {
    const logo = 'https://finance.example/brand/household-logo.png'
    const { fetch, put, run } = worker({ [logo]: 'old logo' })
    expect(await run(logo)).toBe('old logo')
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(put).toHaveBeenCalled())
  })
  it('never caches pages even on success', async () => {
    const { put, fetch, run } = worker()
    await run('https://finance.example/finance/budgets')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(put).not.toHaveBeenCalled()
  })
  it('waits for the page to ask before activating a new version', async () => {
    const { handlers, skipWaiting } = worker()
    const waits: Promise<unknown>[] = []
    handlers.install({ waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
    expect(skipWaiting).not.toHaveBeenCalled()
    handlers.message({ data: { type: 'SKIP_WAITING' } })
    expect(skipWaiting).toHaveBeenCalledTimes(1)
  })
  it('drops old finance caches on activate and uses a monochrome notification badge', async () => {
    const { handlers, caches } = worker()
    const waits: Promise<unknown>[] = []
    handlers.activate({ waitUntil: (p: Promise<unknown>) => waits.push(p) })
    await Promise.all(waits)
    expect(caches.delete).toHaveBeenCalledWith('finance-pwa-v5')
    expect(caches.delete).not.toHaveBeenCalledWith('other-cache')
    expect(readFileSync('public/sw.js', 'utf8')).toContain("badge: '/icons/badge-96.png'")
  })
})
