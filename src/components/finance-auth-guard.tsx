'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ALLOWED_EMAILS } from '@/lib/auth'
import type { User } from '@supabase/supabase-js'

// Local-only bypass for development/design iteration. NODE_ENV is 'production'
// in every deployed build, so this branch cannot exist outside `npm run dev`.
const DEV_BYPASS = process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_AUTH_BYPASS === '1'

export function FinanceAuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (DEV_BYPASS) return
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !ALLOWED_EMAILS.includes(user.email?.toLowerCase() || '')) {
        router.replace('/finance/login')
        return
      }
      setUser(user)
      setLoading(false)
    }
    check()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.replace('/finance/login')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (DEV_BYPASS) return <>{children}</>

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}
