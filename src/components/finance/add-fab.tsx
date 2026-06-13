'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Plus } from 'lucide-react'

/**
 * Mobile-only floating action button: a transaction is always one tap away.
 * Links to the transactions page with ?add=1, which auto-opens the add sheet.
 * Hidden on the transactions page itself (it has its own Add button) and login.
 */
export function AddTransactionFab() {
  const pathname = usePathname()
  if (pathname === '/finance/transactions' || pathname === '/finance/login') return null

  return (
    <Link
      href="/finance/transactions?add=1"
      aria-label="Add transaction"
      className="md:hidden fixed right-4 bottom-[4.75rem] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 active:scale-95 transition-transform"
    >
      <Plus className="h-6 w-6" strokeWidth={2.5} />
    </Link>
  )
}
