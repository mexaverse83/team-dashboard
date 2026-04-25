import type { Metadata } from 'next'
import CommandCenterClient from '@/components/finance/command-center-client'

export const metadata: Metadata = {
  title: 'Finance — Command Center',
  description: 'Personal finance command center with cash flow forecast and smart alerts',
}

export default function FinanceCommandCenterPage() {
  return <CommandCenterClient />
}
