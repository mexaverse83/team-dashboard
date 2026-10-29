'use client'

import { useCallback, useEffect, useId, useState } from 'react'
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

export type PushState = 'checking' | 'unsupported' | 'ios-install' | 'blocked' | 'off' | 'on' | 'unconfirmed' | 'offline' | 'busy'

type SaveResult = 'ok' | 'rejected' | 'network'

async function saveSubscription(sub: PushSubscription, owner: string | null): Promise<SaveResult> {
  try {
    const res = await fetch('/api/finance/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), ...(owner ? { owner } : {}) }),
    })
    return res.ok ? 'ok' : 'rejected'
  } catch {
    return 'network'
  }
}

// Re-post an existing subscription once per session, not on every mount.
const SYNC_KEY = 'mona:push-synced'
function syncedThisSession(endpoint: string, owner: string | null): boolean {
  try { return window.sessionStorage.getItem(SYNC_KEY) === `${owner ?? ''}|${endpoint}` } catch { return false }
}
function markSynced(endpoint: string, owner: string | null) {
  try { window.sessionStorage.setItem(SYNC_KEY, `${owner ?? ''}|${endpoint}`) } catch { /* storage blocked */ }
}

const saveState = (result: SaveResult): PushState => result === 'ok' ? 'on' : result === 'network' ? 'offline' : 'unconfirmed'

const LABEL: Record<PushState, string> = {
  checking: 'Push',
  unsupported: 'Push not supported',
  'ios-install': 'Push needs Home Screen',
  blocked: 'Push blocked',
  off: 'Enable push',
  on: 'Daily push on',
  unconfirmed: 'Re-enable push',
  offline: 'Couldn’t reach server',
  busy: 'Working…',
}

const HINT: Partial<Record<PushState, string>> = {
  'ios-install': 'On iPhone, notifications work once Mona is on the Home Screen: Share › Add to Home Screen, then open it from there.',
  blocked: 'Notifications are blocked. Allow them in Settings › Notifications › Mona, then tap Enable push.',
  unconfirmed: 'The server no longer has this device. Tap to subscribe again.',
  offline: 'Couldn’t confirm push with the server. Tap to retry when you’re online.',
}

// Daily-brief push for this device, with explicit states instead of hiding
// (AUTO-08, MOB-17). Guidance is visible text, not a tooltip touch screens
// never show. An existing subscription is re-posted with the signed-in owner
// once per session so the server list heals itself.
export function PushToggle({ className }: { className?: string }) {
  const { owner: authOwner } = useFinanceAuth()
  const owner = canonicalOwner(authOwner)
  const [state, setState] = useState<PushState>('checking')
  const [hintOpen, setHintOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const hintId = useId()

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
        if (syncedThisSession(sub.endpoint, owner)) { set('on'); return }
        const result = await saveSubscription(sub, owner)
        if (result === 'ok') markSynced(sub.endpoint, owner)
        set(saveState(result))
      })
      .catch(() => set('off'))
    return () => { cancelled = true }
  }, [owner])

  const subscribe = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) })
    const result = await saveSubscription(sub, owner)
    if (result === 'ok') { markSynced(sub.endpoint, owner); setState('on'); return }
    // Offline: keep the browser subscription and retry later; rejected: start over.
    if (result === 'rejected') await sub.unsubscribe()
    setState(result === 'network' ? 'offline' : 'off')
  }, [owner])

  const toggle = async () => {
    if (state === 'busy' || state === 'checking' || state === 'unsupported') return
    // These need a step outside the app: tapping shows how.
    if (state === 'ios-install' || state === 'blocked') { setHintOpen(open => !open); return }
    const previous = state
    setState('busy')
    try {
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (previous === 'on' && existing) {
        await fetch(`/api/finance/push/subscribe?endpoint=${encodeURIComponent(existing.endpoint)}`, { method: 'DELETE' }).catch(() => {})
        await existing.unsubscribe()
        try { window.sessionStorage.removeItem(SYNC_KEY) } catch { /* storage blocked */ }
        setState('off')
        return
      }
      if (previous === 'offline' && existing) {
        const result = await saveSubscription(existing, owner)
        if (result === 'ok') markSynced(existing.endpoint, owner)
        setState(saveState(result))
        return
      }
      // Off or unconfirmed: start clean, then subscribe.
      if (existing) await existing.unsubscribe().catch(() => false)
      await subscribe()
    } catch {
      setState(previous === 'on' ? 'on' : 'off')
    }
  }

  const sendTest = async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/finance/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) })
      const body = await res.json().catch(() => ({})) as { sent?: number; error?: string }
      setTestResult(res.ok && (body.sent ?? 0) > 0 ? `Sent to ${body.sent} device${body.sent === 1 ? '' : 's'}` : body.error || 'No device received it')
    } catch {
      setTestResult('Couldn’t reach the server')
    } finally {
      setTesting(false)
    }
  }

  if (state === 'unsupported' || state === 'checking') return null

  const Icon = state === 'on' ? BellRing : state === 'ios-install' ? Smartphone : state === 'blocked' ? BellOff : Bell
  const needsStep = state === 'ios-install' || state === 'blocked'
  const hint = HINT[state]
  const showHint = Boolean(hint) && (!needsStep || hintOpen)
  return (
    <div className={cn('flex min-w-0 flex-col items-end', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={needsStep ? undefined : state === 'on'}
        aria-expanded={needsStep ? hintOpen : undefined}
        aria-describedby={showHint ? hintId : undefined}
        data-push-state={state}
        className={cn(
          'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[0.75rem] font-medium leading-4 transition-colors',
          state === 'on' ? 'text-positive hover:bg-positive-bg'
            : state === 'unconfirmed' || state === 'blocked' || state === 'offline' ? 'text-warning hover:bg-warning-bg'
            : 'text-fg-secondary hover:bg-surface-2 hover:text-fg',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {LABEL[state]}
      </button>
      {state === 'on' && (
        <button type="button" onClick={sendTest} disabled={testing}
          className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-[0.75rem] font-medium leading-4 text-fg-secondary hover:bg-surface-2 hover:text-fg disabled:opacity-60">
          {testing ? 'Sending…' : 'Send test'}
        </button>
      )}
      {testResult && <p role="status" className="max-w-[17rem] px-2.5 pb-1 text-right text-micro leading-snug text-fg-tertiary">{testResult}</p>}
      {showHint && <p id={hintId} className="max-w-[17rem] px-2.5 pb-1 text-right text-micro leading-snug text-fg-tertiary">{hint}</p>}
    </div>
  )
}
