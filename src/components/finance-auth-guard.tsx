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
export type FinanceAuthStatus = 'loading' | 'signed-in' | 'signed-out'

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

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const email = data.session?.user?.email?.toLowerCase()
      if (!email || !isAllowedEmail(email)) { signedOut(); return }
      signedIn(email, false)
      void verifyInBackground()
    } catch {
      signedOut()
    }
  })()
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
  listeners.clear()
}

export function FinanceAuthGuard({ children }: { children: React.ReactNode }) {
  const auth = useFinanceAuth()
  const router = useRouter()

  useEffect(() => {
    if (!DEV_BYPASS && auth.status === 'signed-out') router.replace('/finance/login')
  }, [auth.status, router])

  if (auth.status !== 'signed-in') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-label="Checking your session">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-positive border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}
