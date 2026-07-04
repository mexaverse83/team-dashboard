'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { VAPID_PUBLIC_KEY } from '@/lib/push-config'

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Bell toggle: subscribes this device to the daily Wolff brief push.
// Hidden entirely when the browser doesn't support push (e.g. iOS Safari
// tab — it works once the PWA is installed to the home screen).
export function PushToggle() {
  const [state, setState] = useState<'unsupported' | 'off' | 'on' | 'busy'>('unsupported')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => {
      setState(sub ? 'on' : 'off')
    }).catch(() => setState('off'))
  }, [])

  const toggle = async () => {
    if (state === 'busy' || state === 'unsupported') return
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await fetch(`/api/finance/push/subscribe?endpoint=${encodeURIComponent(existing.endpoint)}`, { method: 'DELETE' }).catch(() => {})
        await existing.unsubscribe()
        setState('off')
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setState('off'); return }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const res = await fetch('/api/finance/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      })
      if (!res.ok) { await sub.unsubscribe(); setState('off'); return }
      setState('on')
    } catch {
      setState('off')
    }
  }

  if (state === 'unsupported') return null

  return (
    <button
      onClick={toggle}
      title={state === 'on' ? 'Daily brief notifications ON — tap to disable' : 'Get the daily brief as a notification'}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
        state === 'on'
          ? 'bg-emerald-500/10 text-emerald-700'
          : 'text-[hsl(var(--text-tertiary))] hover:bg-[hsl(var(--bg-elevated))]'
      }`}
    >
      {state === 'on' ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
      {state === 'busy' ? '…' : state === 'on' ? 'Daily push on' : 'Enable push'}
    </button>
  )
}
