import type { Metadata } from 'next'
import { FamilyClient } from '@/components/finance/family-client'

export const metadata: Metadata = {
  title: 'Family & Baby — Mona',
  description: 'Baby 2027, the education fund, and family protection',
}

export default function FamilyPlanPage() {
  return <FamilyClient />
}
