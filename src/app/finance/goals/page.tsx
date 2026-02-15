import type { Metadata } from 'next'
import GoalsClient from '@/components/finance/goals-client'

export const metadata: Metadata = {
  title: 'Savings Goals — Finance',
  description: 'Goal-based savings with progress tracking',
}

export default function GoalsPage() {
  return <GoalsClient />
}
