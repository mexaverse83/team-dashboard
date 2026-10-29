'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { isIosDevice, isStandaloneApp } from './push-toggle'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const IOS_DISMISS_KEY = 'mona:ios-install-dismissed'
const DISMISS_EVENT = 'mona:install-dismissed'

function readIosCardVisible(): boolean {
  if (!isIosDevice() || isStandaloneApp()) return false
  try { return window.localStorage.getItem(IOS_DISMISS_KEY) !== '1' } catch { return true }
}

function subscribeDismiss(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange)
  return () => window.removeEventListener(DISMISS_EVENT, onChange)
}

const cardClass = 'flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-card'

// iPhone: Safari never fires beforeinstallprompt, so show the two Share-sheet
// steps instead (MOB-17). Dismissal is remembered per device.
function IosInstallCard() {
  const visible = useSyncExternalStore(subscribeDismiss, readIosCardVisible, () => false)
  const dismiss = useCallback(() => {
    try { window.localStorage.setItem(IOS_DISMISS_KEY, '1') } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(DISMISS_EVENT))
  }, [])
  if (!visible) return null
  return (
    <section className={cardClass} aria-labelledby="ios-install-title">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-secondary"><SquarePlus className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <h2 id="ios-install-title" className="text-sm font-semibold text-fg">Add Mona to your Home Screen</h2>
        <ol className="mt-1 space-y-0.5 text-label text-fg-secondary">
          <li className="flex items-center gap-1.5">1. Tap <Share className="h-3.5 w-3.5" aria-label="Share" /> in Safari’s toolbar</li>
          <li>2. Choose “Add to Home Screen”</li>
        </ol>
        <p className="mt-1 text-micro text-fg-tertiary">Full screen, faster to open, and the daily push works from there.</p>
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-tertiary hover:text-fg">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  )
}

// Android Chrome fires beforeinstallprompt when the PWA is installable; we
// stash it and offer a real Install button for the native dialog.
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferred || dismissed) return <IosInstallCard />

  const install = async () => {
    await deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'accepted') setDeferred(null)
  }

  return (
    <section className={cardClass} aria-label="Install the app">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-fg-secondary"><Download className="h-4 w-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-fg">Install Mona as an app</p>
        <p className="text-label text-fg-secondary">Full screen, home-screen icon, no browser bar</p>
      </div>
      <button type="button" onClick={install} className="btn-primary inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-label font-semibold">
        <Download className="h-3.5 w-3.5" aria-hidden="true" /> Install
      </button>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-tertiary hover:text-fg">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  )
}
