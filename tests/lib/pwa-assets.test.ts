// @vitest-environment node
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import manifest from '@/app/manifest'
import { config as proxyConfig, proxy } from '@/proxy'

const ROOT = path.resolve(__dirname, '../..')

describe('asset size budget (perf-01)', () => {
  it('keeps every brand image at or under 50KB', () => {
    const dir = path.join(ROOT, 'public/brand')
    const over = readdirSync(dir)
      .map(f => ({ f, kb: statSync(path.join(dir, f)).size / 1024 }))
      .filter(({ kb }) => kb > 50)
    expect(over, `oversized: ${over.map(o => `${o.f} ${o.kb.toFixed(0)}KB`).join(', ')}`).toEqual([])
  })
  it('keeps app icons small (WebP for the 512s, quantized PNG fallbacks)', () => {
    const size = (f: string) => statSync(path.join(ROOT, 'public/icons', f)).size / 1024
    expect(size('icon-512.webp')).toBeLessThan(60)
    expect(size('icon-512-maskable.webp')).toBeLessThan(60)
    expect(size('icon-512.png')).toBeLessThan(150)
    expect(size('badge-96.png')).toBeLessThan(10)
  })
})

describe('web app manifest (MOB-20)', () => {
  const m = manifest()
  it('declares a stable id, categories and Android shortcuts', () => {
    expect(m.id).toBe('/finance')
    expect(m.categories).toContain('finance')
    expect(m.shortcuts?.map(s => [s.name, s.url])).toEqual([
      ['Add expense', '/finance/transactions?add=1'],
      ['Ask Mona', '/finance/ask'],
      ['Budgets', '/finance/budgets'],
    ])
  })
  it('lists a maskable icon and only icons that exist', () => {
    expect(m.icons?.some(i => i.purpose === 'maskable')).toBe(true)
    for (const icon of m.icons ?? []) expect(statSync(path.join(ROOT, 'public', icon.src)).isFile()).toBe(true)
  })
})

describe('proxy (CH-19)', () => {
  // Next compiles the matcher like a path-to-regexp source anchored at '/'
  const matcher = new RegExp(`^${proxyConfig.matcher[0]}$`)
  it('skips API routes and static/PWA assets entirely', () => {
    for (const p of ['/api/finance/summary', '/_next/static/chunks/a.js', '/icons/icon-192.png', '/brand/wolff-avatar.png', '/sw.js', '/manifest.webmanifest', '/offline.html', '/favicon-finance.svg']) {
      expect(matcher.test(p), p).toBe(false)
    }
  })
  it('runs for pages and short URLs', () => {
    for (const p of ['/', '/finance', '/finance/budgets', '/transactions']) expect(matcher.test(p), p).toBe(true)
  })
  it('rewrites short URLs to /finance/*', () => {
    const res = proxy(new NextRequest('http://localhost/transactions'))
    expect(res.headers.get('x-middleware-rewrite')).toBe('http://localhost/finance/transactions')
    expect(proxy(new NextRequest('http://localhost/finance/budgets')).headers.get('x-middleware-rewrite')).toBeNull()
  })
})
