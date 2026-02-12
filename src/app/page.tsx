import type { Metadata } from 'next'
import OverviewClient from '@/components/overview-client'

export const metadata: Metadata = {
  title: 'Overview — Interstellar Squad',
  description: 'Mission overview and team status',
}

export default function DashboardPage() {
  return <OverviewClient />
}
