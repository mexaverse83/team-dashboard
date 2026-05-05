'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import type {
  FinanceCategory,
  FinanceTransaction,
  FinanceRecurring,
  FinanceInstallment,
} from '@/lib/finance-types'

const DISCRETIONARY = new Set(['Dining Out', 'Entertainment', 'Shopping', 'Travel', 'Gifts'])
const SAVINGS_TARGET = 85000

const FREQ_MONTHLY: Record<string, number> = {
  weekly: 4.333, biweekly: 2.167, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12,
}

interface Props {
  transactions: FinanceTransaction[]
  categories: FinanceCategory[]
}

export function WeekendBudgetCard({ transactions, categories }: Props) {
  const [recurring, setRecurring] = useState<FinanceRecurring[]>([])
  const [installments, setInstallments] = useState<FinanceInstallment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('finance_recurring').select('*').eq('is_active', true),
      supabase.from('finance_installments').select('*').eq('is_active', true),
    ]).then(([r, i]) => {
      setRecurring((r.data as FinanceRecurring[]) || [])
      setInstallments((i.data as FinanceInstallment[]) || [])
      setLoading(false)
    })
  }, [])

  const m = useMemo(() => {
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    const currentMonthStr = monthStart.toISOString().slice(0, 7)

    const last3 = [1, 2, 3].map(i => {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      return d.toISOString().slice(0, 7)
    })
    const inLast3 = (date: string) => last3.some(s => date.startsWith(s))

    const discretionaryIds = new Set(
      categories.filter(c => DISCRETIONARY.has(c.name)).map(c => c.id),
    )

    const monthlyIncome = transactions
      .filter(t => t.type === 'income' && inLast3(t.transaction_date))
      .reduce((s, t) => s + t.amount_mxn, 0) / 3

    const monthlyFixed =
      recurring.reduce((s, r) => s + r.amount * (FREQ_MONTHLY[r.frequency] ?? 0), 0) +
      installments.reduce((s, i) => s + (i.installment_amount || 0), 0)

    const avgNecessary = transactions
      .filter(t =>
        t.type === 'expense' &&
        !discretionaryIds.has(t.category_id) &&
        !t.recurring_id && !t.installment_id &&
        inLast3(t.transaction_date),
      )
      .reduce((s, t) => s + t.amount_mxn, 0) / 3

    const discretionaryPool = monthlyIncome - monthlyFixed - SAVINGS_TARGET - avgNecessary

    const mtdDiscretionary = transactions
      .filter(t =>
        t.type === 'expense' &&
        discretionaryIds.has(t.category_id) &&
        t.transaction_date.startsWith(currentMonthStr),
      )
      .reduce((s, t) => s + t.amount_mxn, 0)

    let weekendDays = 0
    for (
      let d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      d <= monthEnd;
      d.setDate(d.getDate() + 1)
    ) {
      const dow = d.getDay()
      if (dow === 0 || dow === 6) weekendDays++
    }
    const weekendsRemaining = Math.max(1, Math.ceil(weekendDays / 2))

    const remaining = discretionaryPool - mtdDiscretionary
    const weekendBudget = remaining / weekendsRemaining

    return {
      monthlyIncome, monthlyFixed, avgNecessary, discretionaryPool,
      mtdDiscretionary, remaining, weekendsRemaining, weekendBudget,
    }
  }, [transactions, categories, recurring, installments])

  if (loading) return null

  const overspent = m.remaining < 0
  const tight = !overspent && m.discretionaryPool > 0 && m.mtdDiscretionary / m.discretionaryPool > 0.7
  const tone = overspent ? 'rose' : tight ? 'amber' : 'emerald'
  const headlineColor = {
    rose: 'text-rose-400',
    amber: 'text-amber-400',
    emerald: 'text-emerald-400',
  }[tone]

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`

  return (
    <GlassCard>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>This weekend&apos;s budget</span>
          </div>
          <p className={cn('text-3xl sm:text-4xl font-bold mt-1', headlineColor)}>
            {fmt(Math.max(0, m.weekendBudget))}
          </p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">
            Covers Dining · Entertainment · Shopping · Travel · Gifts ·
            <span className="ml-1">{m.weekendsRemaining} weekend{m.weekendsRemaining === 1 ? '' : 's'} left this month</span>
          </p>
          {overspent && (
            <p className="text-xs text-rose-400 mt-1">
              Already over the discretionary pool by {fmt(-m.remaining)} — extra spend pulls from savings.
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Stat label="Income (3-mo avg)" value={fmt(m.monthlyIncome)} />
        <Stat label="Fixed + savings" value={`-${fmt(m.monthlyFixed + SAVINGS_TARGET)}`} />
        <Stat label="Necessary (3-mo avg)" value={`-${fmt(m.avgNecessary)}`} />
        <Stat label="Discretionary pool" value={fmt(m.discretionaryPool)} tone={m.discretionaryPool < 0 ? 'rose' : undefined} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs border-t border-[hsl(var(--border))] pt-3">
        <Stat label="Spent on discretionary MTD" value={fmt(m.mtdDiscretionary)} />
        <Stat label="Remaining this month" value={fmt(m.remaining)} tone={m.remaining < 0 ? 'rose' : undefined} />
      </div>
    </GlassCard>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">{label}</p>
      <p className={cn('font-semibold mt-0.5', tone === 'rose' ? 'text-rose-400' : '')}>{value}</p>
    </div>
  )
}
