'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import {
  applyThemePreference,
  DEFAULT_THEME,
  readThemePreference,
  THEME_STORAGE_KEY,
  writeThemePreference,
  type ThemePreference,
} from '@/lib/theme'

const CHANGE_EVENT = 'mona:theme-change'

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === THEME_STORAGE_KEY) onChange() }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

/** Current preference, shared by every mounted toggle (storage-backed, try/catch inside). */
export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const pref = useSyncExternalStore(subscribe, readThemePreference, () => DEFAULT_THEME)
  const setPref = useCallback((next: ThemePreference) => {
    writeThemePreference(next)
    applyThemePreference(next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [])
  return [pref, setPref]
}

const OPTIONS = [
  { value: 'system' as const, label: 'System', icon: <Monitor aria-hidden="true" className="h-4 w-4" /> },
  { value: 'light' as const, label: 'Light', icon: <Sun aria-hidden="true" className="h-4 w-4" /> },
  { value: 'dark' as const, label: 'Dark', icon: <Moon aria-hidden="true" className="h-4 w-4" /> },
]

export interface ThemeToggleProps {
  /** Icon-only segments (labels stay as accessible names). */
  compact?: boolean
  className?: string
}

/** System / Light / Dark (NU-1: Dark is the default). */
export function ThemeToggle({ compact = false, className }: ThemeToggleProps) {
  const [pref, setPref] = useThemePreference()

  // Keep <html data-theme> in sync with the stored choice, and follow the OS
  // while the preference is 'system'.
  useEffect(() => {
    applyThemePreference(pref)
    if (pref !== 'system') return
    let media: MediaQueryList | null = null
    try { media = window.matchMedia('(prefers-color-scheme: light)') } catch { return }
    const onChange = () => applyThemePreference('system')
    media.addEventListener?.('change', onChange)
    return () => media?.removeEventListener?.('change', onChange)
  }, [pref])

  return (
    <Segmented
      ariaLabel="Theme"
      size="sm"
      value={pref}
      onChange={setPref}
      className={className}
      options={OPTIONS.map(o => compact ? { ...o, label: <span className="sr-only">{o.label}</span>, ariaLabel: o.label } : o)}
    />
  )
}
