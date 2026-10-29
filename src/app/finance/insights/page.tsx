import type { Metadata } from 'next'
import InsightsClient from '@/components/finance/insights-client'

export const metadata: Metadata = { title: 'Daily Brief — Mona' }

export default function InsightsPage() {
  return <InsightsClient />
}
