import type { Metadata } from 'next'
import { InvestmentsClient } from '@/components/finance/investments-client'

export const metadata: Metadata = {
  title: 'Investments — Finance',
  description: 'Crypto, stocks, fixed income, real estate and retirement in one view',
}

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams
  return <InvestmentsClient initialTab={params.tab} />
}
