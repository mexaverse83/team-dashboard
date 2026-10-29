'use client'

import { LockKeyhole, LogOut } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useFinanceAuth } from './finance-auth-guard'

export function FinanceAuthBadge({ collapsed }: { collapsed: boolean }) {
  const { status, email, owner } = useFinanceAuth()
  const pathname = usePathname()
  const router = useRouter()

  // Only show on finance routes
  if (!pathname.startsWith('/finance') || status !== 'signed-in' || !email) return null

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/finance/login')
  }

  if (collapsed) {
    return (
      <button type="button" onClick={handleSignOut} title={`${email} — Sign out`} aria-label="Sign out"
        className="flex min-h-11 w-full items-center justify-center rounded-lg text-negative transition-colors hover:bg-negative-bg">
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-label font-medium text-fg">
          <LockKeyhole className="h-3 w-3 text-positive" aria-hidden="true" />{owner || 'Signed in'}
        </p>
        <p className="truncate text-micro text-fg-tertiary">{email}</p>
      </div>
      <button type="button" onClick={handleSignOut} title="Sign out" aria-label="Sign out"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-negative-bg hover:text-negative">
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
