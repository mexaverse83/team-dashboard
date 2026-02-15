import type { Metadata } from 'next'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'

export const metadata: Metadata = { title: 'Budget Builder — Finance', description: 'Zero-based budgeting with 50/30/20 analysis' }

export default function BudgetBuilderPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Budget Builder</h1>
          <p className="text-[hsl(var(--text-secondary))]">Zero-based budgeting with 50/30/20 analysis</p>
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
