import type { Metadata } from 'next'
import CommsClient from '@/components/comms-client'

export const metadata: Metadata = {
  title: 'Comms Log — Interstellar Squad',
  description: 'Inter-agent communication history',
}

export default function CommsPage() {
  return <CommsClient />
}
