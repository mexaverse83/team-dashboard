// Service worker: Android installability, an offline fallback, and fast
// launches. Strategies:
//   /_next/static/*, /icons/*, /manifest.webmanifest → cache-first (hashed or
//     versioned assets; a miss fetches and stores)
//   /brand/*                                         → stale-while-revalidate
//   API calls, HTML navigations, non-GET             → network only (finance
//     data and private pages are never served from a SW cache)
// A new version waits until the page asks it to take over (SKIP_WAITING from
// the "Update ready" toast), so a long-lived standalone session never mixes
// old HTML with new chunks.
const CACHE = 'finance-pwa-v6'
const MAX_STATIC_ENTRIES = 160

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html')))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('finance-pwa-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* plain text push */ }
  event.waitUntil(
    self.registration.showNotification(data.title || '🐺 Finance', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
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

function isCacheFirst(pathname) {
  return pathname.startsWith('/_next/static/') || pathname.startsWith('/icons/') || pathname === '/manifest.webmanifest'
}

function trim(cache) {
  return cache.keys().then((keys) => {
    const extra = keys.length - MAX_STATIC_ENTRIES
    return extra > 0 ? Promise.all(keys.slice(0, extra).map((k) => cache.delete(k))) : undefined
  })
}

function store(request, res) {
  if (!res || !res.ok) return
  const copy = res.clone()
  caches.open(CACHE).then((c) => c.put(request, copy).then(() => trim(c))).catch(() => {})
}

function cacheFirst(request) {
  return caches.match(request).then((hit) => hit || fetch(request).then((res) => { store(request, res); return res }))
}

function staleWhileRevalidate(request, event) {
  return caches.match(request).then((hit) => {
    const network = fetch(request).then((res) => { store(request, res); return res })
    if (hit) {
      if (event && event.waitUntil) event.waitUntil(network.catch(() => {}))
      return hit
    }
    return network
  })
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (isCacheFirst(url.pathname)) {
    event.respondWith(cacheFirst(event.request).catch(() => Response.error()))
    return
  }
  if (url.pathname.startsWith('/brand/')) {
    event.respondWith(staleWhileRevalidate(event.request, event).catch(() => Response.error()))
    return
  }

  // Pages and everything else: network only, with a generic offline page for
  // failed navigations.
  event.respondWith(
    fetch(event.request).catch(() => {
      if (event.request.mode === 'navigate') return caches.match('/offline.html').then(hit => hit || Response.error())
      return Response.error()
    })
  )
})
