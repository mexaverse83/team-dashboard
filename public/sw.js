// Minimal service worker: required for Android installability, and gives a
// basic offline fallback. Network-first for everything cacheable; API calls
// and non-GET requests pass straight through (finance data must never be
// served stale from a SW cache).
const CACHE = 'finance-pwa-v5'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('finance-pwa-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* plain text push */ }
  event.waitUntil(
    self.registration.showNotification(data.title || '🐺 Finance', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/finance' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data && event.notification.data.url) || '/finance', self.location.origin)
  const url = target.origin === self.location.origin ? target.href : new URL('/finance', self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes('/finance'))
      return existing ? existing.navigate(url).then(client => client?.focus()) : clients.openWindow(url)
    })
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/brand/') || url.pathname === '/manifest.webmanifest')) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {})
        }
        return res
      })
      .catch(() => {
        if (event.request.mode === 'navigate') return caches.match('/offline.html').then(hit => hit || Response.error())
        return caches.match(event.request).then(hit => hit || Response.error())
      })
  )
})
