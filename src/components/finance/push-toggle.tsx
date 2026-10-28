'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, BellOff, BellRing, Smartphone } from 'lucide-react'
import { VAPID_PUBLIC_KEY } from '@/lib/push-config'
import { useFinanceAuth } from '@/components/finance-auth-guard'
import { canonicalOwner } from '@/lib/owners'
import { cn } from '@/lib/utils'

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  try { return Boolean(nav.standalone) || window.matchMedia('(display-mode: standalone)').matches } catch { return Boolean(nav.standalone) }
}

export type PushState = 'checking' | 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on' | 'unconfirmed' | 'busy'

async function saveSubscription(sub: PushSubscription, owner: string | null): Promise<boolean> {
  const res = await fetch('/api/finance/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON(), ...(owner ? { owner } : {}) }),
  }).catch(() => null)
  return Boolean(res?.ok)
}

const LABEL: Record<PushState, string> = {
  checking: 'Push',
  unsupported: 'Push not supported',
  'ios-install': 'Add to Home Screen for push',
  blocked: 'Push blocked in Settings',
  off: 'Enable push',
  on: 'Daily push on',
  unconfirmed: 'Re-enable push',
  busy: 'Working…',
}

const HINT: Partial<Record<PushState, string>> = {
  'ios-install': 'On iPhone, notifications work once Mona is added to the Home Screen (Share › Add to Home Screen).',
  blocked: 'Notifications are blocked. Allow them in Settings › Notifications › Mona, then tap again.',
  on: 'This device gets the daily brief. Tap to turn off.',
  unconfirmed: 'The server lost this device. Tap to subscribe again.',
}

// Daily-brief push for this device, with explicit states instead of hiding
// (AUTO-08, MOB-17). On mount an existing subscription is re-posted with the
// signed-in owner so the server list heals itself.
export function PushToggle({ className }: { className?: string }) {
  const { owner: authOwner } = useFinanceAuth()
  const owner = canonicalOwner(authOwner)
  const [state, setState] = useState<PushState>('checking')

  useEffect(() => {
    let cancelled = false
    const set = (next: PushState) => { if (!cancelled) setState(next) }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
      set(isIosDevice() && !isStandaloneApp() ? 'ios-install' : 'unsupported')
      return
    }
    if (Notification.permission === 'denied') { set('blocked'); return }
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(async sub => {
        if (!sub) { set('off'); return }
        set((await saveSubscription(sub, owner)) ? 'on' : 'unconfirmed')
      })
      .catch(() => set('off'))
    return () => { cancelled = true }
  }, [owner])

  const subscribe = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) })
    if (await saveSubscription(sub, owner)) { setState('on'); return }
    await sub.unsubscribe()
    setState('off')
  }, [owner])

  const toggle = async () => {
    if (state === 'busy' || state === 'checking' || state === 'unsupported' || state === 'ios-install') return
    const previous = state
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (previous === 'on' && existing) {
        await fetch(`/api/finance/push/subscribe?endpoint=${encodeURIComponent(existing.endpoint)}`, { method: 'DELETE' }).catch(() => {})
        await existing.unsubscribe()
        setState('off')
        return
      }
      // Off, blocked-then-allowed, or unconfirmed: start clean, then subscribe.
      if (existing) await existing.unsubscribe().catch(() => false)
      await subscribe()
    } catch {
      setState(previous === 'on' ? 'on' : 'off')
    }
  }

  if (state === 'unsupported' || state === 'checking') return null

  const Icon = state === 'on' ? BellRing : state === 'ios-install' ? Smartphone : state === 'blocked' ? BellOff : Bell
  const passive = state === 'ios-install'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state === 'on'}
      aria-disabled={passive || undefined}
      title={HINT[state] ?? 'Get the daily brief as a notification'}
      data-push-state={state}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[0.75rem] font-medium leading-4 transition-colors',
        state === 'on' ? 'text-positive hover:bg-positive-bg'
          : state === 'unconfirmed' || state === 'blocked' ? 'text-warning hover:bg-warning-bg'
          : 'text-fg-secondary hover:bg-surface-2 hover:text-fg',
        passive && 'cursor-default hover:bg-transparent',
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {LABEL[state]}
    </button>
  )
}
