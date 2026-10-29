import type { Metadata } from 'next'
import DebtClient from '@/components/finance/debt-client'

export const metadata: Metadata = { title: 'Debt Planner — Mona' }
export default function DebtPage() { return <DebtClient /> }
