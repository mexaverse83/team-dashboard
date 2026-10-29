import type { Metadata } from 'next'
import GoalsClient from '@/components/finance/goals-client'

export const metadata: Metadata = {
  title: 'Goals — Mona',
  description: 'Goal-based savings with progress tracking',
}

export default function GoalsPage() {
  return <GoalsClient />
}
