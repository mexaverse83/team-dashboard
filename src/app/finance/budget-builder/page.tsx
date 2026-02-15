import type { Metadata } from 'next'
import BudgetBuilderClient from '@/components/finance/budget-builder-client'

export const metadata: Metadata = {
  title: 'Budget Builder — Finance',
  description: 'Zero-based budgeting with 50/30/20 analysis',
}

export default function BudgetBuilderPage() {
  return <BudgetBuilderClient />
}
