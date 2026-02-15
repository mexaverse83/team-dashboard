import type { Metadata } from 'next'
import BudgetsClient from '@/components/finance/budgets-client'

export const metadata: Metadata = {
  title: 'Budgets — Finance',
  description: 'Monthly budget management by category',
}

export default function BudgetsPage() {
  return <BudgetsClient />
}
