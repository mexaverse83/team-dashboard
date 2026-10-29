import type { Metadata } from 'next'
import AuditClient from '@/components/finance/audit-client'

export const metadata: Metadata = { title: 'Spending Audit — Mona' }
export default function AuditPage() { return <AuditClient /> }
