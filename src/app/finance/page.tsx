import type { Metadata } from 'next'
import CommandCenterClient from '@/components/finance/command-center-client'

export const metadata: Metadata = {
  title: 'Home — Mona Finance',
  description: 'This month, what you can spend, and what needs attention',
}

export default function FinanceCommandCenterPage() {
  return <CommandCenterClient />
}
