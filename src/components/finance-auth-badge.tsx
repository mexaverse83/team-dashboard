'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { LogOut } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'

export function FinanceAuthBadge({ collapsed }: { collapsed: boolean }) {
  const [user, setUser] = useState<User | null>(null)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  // Only show on finance routes
  if (!pathname.startsWith('/finance') || !user) return null

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/finance/login')
  }

  if (collapsed) {
    return (
      <button onClick={handleSignOut} title={`${user.email} — Sign out`}
        className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors">
        <LogOut className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="px-3 py-2 rounded-lg bg-[hsl(var(--bg-elevated))]">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[10px] text-emerald-400 font-medium">🔒 Authenticated</p>
          <p className="text-[10px] text-[hsl(var(--text-tertiary))] truncate">{user.email}</p>
        </div>
        <button onClick={handleSignOut} title="Sign out"
          className="p-1 rounded hover:bg-red-500/10 text-red-400 transition-colors shrink-0">
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
