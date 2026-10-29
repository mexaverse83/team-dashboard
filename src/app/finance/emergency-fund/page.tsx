import type { Metadata } from 'next'
import EmergencyFundClient from '@/components/finance/emergency-fund-client'

export const metadata: Metadata = { title: 'Emergency Fund — Mona' }
export default function EmergencyFundPage() { return <EmergencyFundClient /> }
