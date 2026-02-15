'use client'

import { useState, useEffect, useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { PageTransition } from '@/components/page-transition'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { SEED_CATEGORIES, SEED_RECURRING, enrichRecurring } from '@/lib/seed-finance'
import type { FinanceCategory, FinanceRecurring } from '@/lib/finance-types'

function monthlyEquivalent(amount: number, freq: string): number {
  switch (freq) {
    case 'weekly': return amount * 4.33
    case 'biweekly': return amount * 2.17
    case 'monthly': return amount
    case 'quarterly': return amount / 3
    case 'yearly': return amount / 12
    default: return amount
  }
}

export default function SubscriptionsClient() {
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [recurring, setRecurring] = useState<FinanceRecurring[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order'),
      supabase.from('finance_recurring').select('*').order('next_due_date'),
    ]).then(([catRes, recRes]) => {
      const cats = catRes.data?.length ? catRes.data : SEED_CATEGORIES
      const recs = recRes.data?.length ? recRes.data : SEED_RECURRING
      setCategories(cats)
      setRecurring(enrichRecurring(recs, cats))
      setLoading(false)
    })
  }, [])

  const active = recurring.filter(r => r.is_active)
  const monthlyBurn = useMemo(() => active.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0), [active])
  const annualBurn = monthlyBurn * 12

  // Upcoming in next 7 days
  const now = new Date()
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const upcoming = active.filter(r => {
    if (!r.next_due_date) return false
    const d = new Date(r.next_due_date)
    return d >= now && d <= weekFromNow
  })

  if (loading) return <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />

  return (
    <PageTransition>
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
        <p className="text-[hsl(var(--text-secondary))]">Recurring charges and subscription tracking</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-3">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Monthly Burn</span>
          <p className="text-3xl font-bold text-rose-400 mt-1">${Math.round(monthlyBurn).toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Annual Projection</span>
          <p className="text-3xl font-bold text-amber-400 mt-1">${Math.round(annualBurn).toLocaleString()}</p>
        </GlassCard>
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Active</span>
          <AnimatedNumber value={active.length} className="text-3xl font-bold mt-1" />
        </GlassCard>
      </div>

      {/* Table */}
      <GlassCard>
        {recurring.length === 0 ? (
          <EmptyState icon="radio" title="No subscriptions" description="Track recurring charges to see your monthly burn" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  {['', 'Name', 'Amount', 'Frequency', 'Next Due', 'Status'].map(h => (
                    <th key={h} className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recurring.map(sub => (
                  <tr key={sub.id} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-[hsl(var(--bg-elevated))]/50 transition-colors">
                    <td className="py-3 px-4 text-lg">{sub.category?.icon}</td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium">{sub.name}</p>
                      <p className="text-xs text-[hsl(var(--text-tertiary))]">{sub.merchant}</p>
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold">${sub.amount.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary" className="text-xs capitalize">{sub.frequency}</Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-[hsl(var(--text-secondary))]">{sub.next_due_date?.slice(5) || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center gap-1 text-xs font-medium",
                        sub.is_active ? "text-emerald-400" : "text-[hsl(var(--text-tertiary))]"
                      )}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", sub.is_active ? "bg-emerald-500" : "bg-gray-500")} />
                        {sub.is_active ? 'Active' : 'Cancelled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Upcoming */}
      <GlassCard>
        <h3 className="text-base font-semibold mb-3">📅 Upcoming (Next 7 Days)</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-[hsl(var(--text-tertiary))] text-center py-6">All clear — no bills due in the next 7 days</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(sub => (
              <div key={sub.id} className="flex items-center gap-3 p-2 rounded-lg bg-[hsl(var(--bg-elevated))]">
                <span className="text-sm">{sub.category?.icon}</span>
                <span className="text-sm font-medium flex-1">{sub.name}</span>
                <span className="text-xs text-[hsl(var(--text-secondary))]">{sub.next_due_date?.slice(5)}</span>
                <span className="text-sm font-semibold text-rose-400">${sub.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
    </PageTransition>
  )
}
