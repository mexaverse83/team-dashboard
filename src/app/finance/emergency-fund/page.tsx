import type { Metadata } from 'next'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'

export const metadata: Metadata = { title: 'Emergency Fund — Finance', description: 'Risk-based emergency fund calculator' }

export default function EmergencyFundPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Emergency Fund</h1>
          <p className="text-[hsl(var(--text-secondary))]">Risk-based emergency fund calculator</p>
        </div>
        <GlassCard>
          <div className="text-center py-12">
            <p className="text-4xl mb-3">🚧</p>
            <h3 className="text-lg font-semibold">Coming Soon</h3>
            <p className="text-sm text-[hsl(var(--text-tertiary))] mt-1">Waiting on Tom&apos;s designs. Schema is ready.</p>
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  )
}
