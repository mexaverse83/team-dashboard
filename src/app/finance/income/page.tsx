import type { Metadata } from 'next'
import { IncomeClient } from '@/components/finance/income-client'

export const metadata: Metadata = {
  title: 'Recurring Income — Finance',
  description: 'Manage recurring income sources and auto-registration',
}

export default function IncomePage() {
  return <IncomeClient />
}
