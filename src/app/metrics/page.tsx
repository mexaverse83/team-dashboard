import type { Metadata } from 'next'
import MetricsClient from '@/components/metrics-client'

export const metadata: Metadata = {
  title: 'Metrics — Interstellar Squad',
  description: 'Team performance and agent analytics',
}

export default function MetricsPage() {
  return <MetricsClient />
}
