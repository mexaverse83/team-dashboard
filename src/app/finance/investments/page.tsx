import { InvestmentsClient } from '@/components/finance/investments-client'

export default async function InvestmentsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const params = await searchParams
  return <InvestmentsClient initialTab={params.tab} />
}
