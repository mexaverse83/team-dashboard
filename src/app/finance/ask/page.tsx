import type { Metadata } from 'next'
import AskWolffClient from '@/components/finance/ask-wolff-client'

export const metadata: Metadata = {
  title: 'Ask Wolff — Finance',
  description: 'Chat with your household financial advisor',
}

export default function AskWolffPage() {
  return <AskWolffClient />
}
