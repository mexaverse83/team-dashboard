'use client'

import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Android Chrome fires beforeinstallprompt when the PWA is installable and
// not yet installed. We stash the event and offer a real Install button that
// triggers the native dialog — no digging through browser menus. iOS never
// fires this event (install is Share → Add to Home Screen), so the banner
// simply never renders there.
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

  if (!deferred || dismissed) return null

  const install = async () => {
    await deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'accepted') setDeferred(null)
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5">
      <span className="text-lg">📲</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold">Install Finance as an app</p>
        <p className="text-[11px] text-[hsl(var(--text-secondary))]">Fullscreen, home-screen icon, no browser bar</p>
      </div>
      <button
        onClick={install}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
      >
        <Download className="h-3.5 w-3.5" /> Install
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" className="p-1 text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--foreground))]">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
