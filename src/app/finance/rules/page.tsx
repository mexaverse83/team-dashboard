import type { Metadata } from 'next'
import RulesClient from '@/components/finance/rules-client'

export const metadata: Metadata = {
  title: 'Finance — Auto-categorization rules',
  description: 'Manage auto-categorization rules for transactions',
}

export default function FinanceRulesPage() {
  return <RulesClient />
}
