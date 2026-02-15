import type { Metadata } from 'next'
import FinanceOverviewClient from '@/components/finance/overview-client'

export const metadata: Metadata = {
  title: 'Finance — Interstellar Squad',
  description: 'Personal finance overview and spending analytics',
}

export default function FinanceOverviewPage() {
  return <FinanceOverviewClient />
}
