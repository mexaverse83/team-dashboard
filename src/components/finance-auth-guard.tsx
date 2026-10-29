'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAllowedEmail } from '@/lib/auth'
import { getOwnerName } from '@/lib/owners'

// Local-only bypass for development/design iteration. NODE_ENV is 'production'
// in every deployed build, so this branch cannot exist outside `npm run dev`.
const DEV_BYPASS = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_AUTH_BYPASS === '1'

// One auth state for the guard, the sidebar badge and the home greeting
// (MOB-05, perf-06). The first render trusts the locally stored session
// (getSession, no network); getUser() then confirms in the background and
// only a definite auth failure signs the viewer out. A timeout or offline
// error keeps the shell, so a weak signal never bounces them to the login page.
export type FinanceAuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'offline'

export interface FinanceAuthState {
  status: FinanceAuthStatus
  email: string | null
  /** Display owner for the signed-in email ('Bernardo' | 'Laura'), null when unknown. */
  owner: string | null
  /** True once getUser() confirmed the session with the server. */
  verified: boolean
}

const INITIAL: FinanceAuthState = { status: 'loading', email: null, owner: null, verified: false }
const BYPASS_STATE: FinanceAuthState = { status: 'signed-in', email: null, owner: null, verified: true }

let state: FinanceAuthState = INITIAL
let started = false
const listeners = new Set<() => void>()

function setState(next: Partial<FinanceAuthState>) {
  state = { ...state, ...next }
  listeners.forEach(listener => listener())
}

function signedIn(email: string, verified: boolean) {
  setState({ status: 'signed-in', email, owner: getOwnerName(email), verified })
}

function signedOut() {
  setState({ status: 'signed-out', email: null, owner: null, verified: false })
}

/** Definite auth failure (expired/revoked session), as opposed to a network problem. */
function isAuthRejection(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const e = error as { status?: number; name?: string }
  if (e.status === 401 || e.status === 403) return true
  return e.name === 'AuthSessionMissingError' || e.name === 'AuthInvalidJwtError'
}

/** Email from the stored @supabase/ssr session cookie (possibly chunked, base64-prefixed). */
export function storedSessionEmail(cookie = typeof document === 'undefined' ? '' : document.cookie): string | null {
  try {
    const parts = new Map<string, string>()
    for (const pair of cookie.split(/;\s*/)) {
      const eq = pair.indexOf('=')
      if (eq > 0) parts.set(pair.slice(0, eq), decodeURIComponent(pair.slice(eq + 1)))
    }
    const base = [...parts.keys()].map(k => k.replace(/\.\d+$/, '')).find(k => /^sb-.+-auth-token$/.test(k))
    if (!base) return null
    let raw = parts.get(base) ?? ''
    if (!raw) for (let i = 0; parts.has(`${base}.${i}`); i++) raw += parts.get(`${base}.${i}`)
    if (raw.startsWith('base64-')) {
      const b64 = raw.slice(7).replace(/-/g, '+').replace(/_/g, '/')
      raw = new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))
    }
    const email = JSON.parse(raw)?.user?.email
    return typeof email === 'string' ? email.toLowerCase() : null
  } catch {
    return null
  }
}

async function verifyInBackground() {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      if (isAuthRejection(error)) signedOut()
      return
    }
    const email = data.user?.email?.toLowerCase()
    if (!email || !isAllowedEmail(email)) signedOut()
    else signedIn(email, true)
  } catch {
    // Network/timeout: keep the locally trusted session.
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null

/** Network trouble while loading/refreshing the session: keep the shell, retry later. */
function keepShellOffline() {
  const email = storedSessionEmail()
  if (email && isAllowedEmail(email)) signedIn(email, false)
  else if (state.status !== 'signed-in') setState({ status: 'offline' })
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(() => { retryTimer = null; void loadSession() }, 15_000)
}

async function loadSession() {
  try {
    const { data, error } = await supabase.auth.getSession()
    const email = data.session?.user?.email?.toLowerCase()
    if (!email) {
      // An expired token is refreshed here; offline that fails with a retryable
      // error and session null, which is not a sign-out.
      if (error && !isAuthRejection(error)) keepShellOffline()
      else signedOut()
      return
    }
    if (!isAllowedEmail(email)) { signedOut(); return }
    signedIn(email, false)
    void verifyInBackground()
  } catch {
    keepShellOffline()
  }
}

/** Retry the session now (offline screen button, `online` event). */
export function retryFinanceAuth() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  void loadSession()
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  void loadSession()
  window.addEventListener('online', () => {
    if (state.status === 'offline' || !state.verified) retryFinanceAuth()
  })
  supabase.auth.onAuthStateChange((event, session) => {
    const email = session?.user?.email?.toLowerCase()
    if (event === 'SIGNED_OUT') signedOut()
    else if (email && isAllowedEmail(email)) signedIn(email, state.verified || event === 'SIGNED_IN')
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  start()
  return () => { listeners.delete(listener) }
}

const getSnapshot = () => state
const getServerSnapshot = () => INITIAL

export function useFinanceAuth(): FinanceAuthState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return DEV_BYPASS ? BYPASS_STATE : snapshot
}

/** Test-only: forget the cached session so each test starts from 'loading'. */
export function resetFinanceAuthForTests() {
  state = INITIAL
  started = false
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  listeners.clear()
}

export function FinanceAuthGuard({ children }: { children: React.ReactNode }) {
  const auth = useFinanceAuth()
  const router = useRouter()

  useEffect(() => {
    if (!DEV_BYPASS && auth.status === 'signed-out') router.replace('/finance/login')
  }, [auth.status, router])

  if (auth.status === 'offline') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center" role="status">
        <p className="text-[0.9375rem] font-semibold text-fg">Can’t reach the server</p>
        <p className="max-w-xs text-label text-fg-secondary">You’re still signed in. We’ll reconnect as soon as the signal is back.</p>
        <button type="button" onClick={retryFinanceAuth} className="min-h-11 rounded-lg border border-border bg-surface px-4 text-label font-semibold text-fg">Try again</button>
      </div>
    )
  }

  if (auth.status !== 'signed-in') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Checking your session">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-positive border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
