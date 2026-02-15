import type { Metadata } from 'next'
import TransactionsClient from '@/components/finance/transactions-client'

export const metadata: Metadata = {
  title: 'Transactions — Finance',
  description: 'Transaction list with filters and CRUD',
}

export default function TransactionsPage() {
  return <TransactionsClient />
}
