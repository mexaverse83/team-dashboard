import type { Metadata } from 'next'
import RulesClient from '@/components/finance/rules-client'

export const metadata: Metadata = {
  title: 'Auto Rules — Mona',
  description: 'Manage auto-categorization rules for transactions',
}

export default function FinanceRulesPage() {
  return <RulesClient />
}
