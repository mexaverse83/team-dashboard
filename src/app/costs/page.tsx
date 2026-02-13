import type { Metadata } from 'next'
import CostsClient from '@/components/costs-client'

export const metadata: Metadata = {
  title: 'Costs — Interstellar Squad',
  description: 'Per-agent API spend tracking and token analytics',
}

export default function CostsPage() {
  return <CostsClient />
}
