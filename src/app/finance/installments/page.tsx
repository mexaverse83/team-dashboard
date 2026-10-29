import type { Metadata } from 'next'
import { InstallmentsClient } from '@/components/finance/installments-client'

export const metadata: Metadata = { title: 'MSI Installments — Mona' }

export default function InstallmentsPage() {
  return <InstallmentsClient />
}
