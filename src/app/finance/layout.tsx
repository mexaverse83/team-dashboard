'use client'

import { usePathname } from 'next/navigation'
import { FinanceAuthGuard } from '@/components/finance-auth-guard'

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  // Don't guard the login page
  if (pathname === '/finance/login') {
    return <>{children}</>
  }

  return <FinanceAuthGuard>{children}</FinanceAuthGuard>
}
