import type { Metadata } from 'next'
import ReportsClient from '@/components/finance/reports-client'

export const metadata: Metadata = {
  title: 'Reports — Mona',
  description: 'Financial reports and trend analytics',
}

export default function ReportsPage() {
  return <ReportsClient />
}
