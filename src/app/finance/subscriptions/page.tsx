import type { Metadata } from 'next'
import SubscriptionsClient from '@/components/finance/subscriptions-client'

export const metadata: Metadata = {
  title: 'Subscriptions — Finance',
  description: 'Recurring subscription tracker',
}

export default function SubscriptionsPage() {
  return <SubscriptionsClient />
}
