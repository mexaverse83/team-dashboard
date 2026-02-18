import { redirect } from 'next/navigation'

export default function CryptoPage() {
  redirect('/finance/investments?tab=Crypto')
}
