'use client'

import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

// Registers the service worker (PWA installability) and, when a new version
// has installed and is waiting, offers "Update ready — tap to reload". The
// worker no longer skips waiting on its own (MOB-19), so the switch happens
// only when the user taps, and the page reloads once the new worker controls it.
export function PwaRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const reloading = useRef(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let cancelled = false
    const sw = navigator.serviceWorker
    const hadController = !!sw.controller

    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && sw.controller) setWaiting(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const next = reg.installing
        next?.addEventListener('statechange', () => {
          // 'installed' with an existing controller = an update, not the first install
          if (!cancelled && next.state === 'installed' && sw.controller) setWaiting(next)
        })
      })
    }

    const onControllerChange = () => {
      if (!hadController || reloading.current) return
      reloading.current = true
      window.location.reload()
    }
    sw.addEventListener('controllerchange', onControllerChange)
    sw.register('/sw.js').then(reg => { if (!cancelled) watch(reg) }).catch(() => {})

    return () => {
      cancelled = true
      sw.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  if (!waiting || dismissed) return null

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-sm items-center gap-2 rounded-2xl border border-border-strong bg-surface p-2 pl-4 text-sm text-fg shadow-card sm:bottom-6"
    >
      <span className="min-w-0 flex-1 font-medium">Update ready</span>
      <button
        type="button"
        onClick={() => waiting.postMessage({ type: 'SKIP_WAITING' })}
        className="btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-semibold"
      >
        <RefreshCw aria-hidden className="h-4 w-4" /> Tap to reload
      </button>
      <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-fg-secondary hover:bg-surface-2">
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  )
}
