'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ALLOWED_EMAILS } from '@/lib/auth'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleCallback = async () => {
      // Wait for Supabase to process the hash fragment and establish session
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error || !session) {
        // Maybe hash hasn't been processed yet — listen for auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session) {
            if (!ALLOWED_EMAILS.includes(session.user.email?.toLowerCase() || '')) {
              supabase.auth.signOut()
              router.push('/finance/login?error=unauthorized')
            } else {
              router.push('/finance')
            }
            subscription.unsubscribe()
          }
        })

        // Timeout fallback
        setTimeout(() => {
          subscription.unsubscribe()
          router.push('/finance/login?error=auth_failed')
        }, 10000)
        return
      }

      // Session already exists
      if (!ALLOWED_EMAILS.includes(session.user.email?.toLowerCase() || '')) {
        await supabase.auth.signOut()
        router.push('/finance/login?error=unauthorized')
        return
      }

      router.push('/finance')
    }

    handleCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))]">
      <div className="text-center">
        <div className="h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-[hsl(var(--text-secondary))]">Signing you in...</p>
      </div>
    </div>
  )
}
