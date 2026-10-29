'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useFinanceAuth } from '@/components/finance-auth-guard'
import { OWNERS } from '@/lib/owners'

/** Who is looking at home: the signed-in owner, or null (unknown email / dev bypass). (UX-11) */
export function useViewer(): { owner: string | null } {
  const { owner } = useFinanceAuth()
  return { owner: owner && OWNERS.includes(owner) ? owner : null }
}

export type HomeScope = 'together' | 'you'
const SCOPE_KEY = 'mona:home-scope'
const SCOPE_EVENT = 'mona:home-scope-change'

function readScope(): HomeScope {
  try { return window.localStorage.getItem(SCOPE_KEY) === 'you' ? 'you' : 'together' } catch { return 'together' }
}

function subscribe(onChange: () => void) {
  window.addEventListener(SCOPE_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(SCOPE_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** You / Together toggle, remembered per device. */
export function useHomeScope(): [HomeScope, (scope: HomeScope) => void] {
  const scope = useSyncExternalStore(subscribe, readScope, () => 'together' as const)
  const set = useCallback((next: HomeScope) => {
    try { window.localStorage.setItem(SCOPE_KEY, next) } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(SCOPE_EVENT))
  }, [])
  return [scope, set]
}
