import Link from 'next/link'
import { ArrowUpRight, CircleCheck, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Summary } from './command-center/types'

export function BudgetWatch({ summary }: { summary: Summary }) {
  const month = summary.current_month
  const budgets = month.budget_vs_actual.filter(b => !b.is_non_monthly && b.budget > 0)
  const alerts = budgets.filter(b => b.spent > b.budget || (month.day_of_month >= 7 && b.pct_used > 50 && b.projected_month_total > b.budget * 1.1))
  const shown = [...(alerts.length ? alerts : budgets)].sort((a, b) => (b.projected_month_total - b.budget) - (a.projected_month_total - a.budget)).slice(0, 3)
  const money = (amount: number) => `$${Math.round(amount).toLocaleString('en-US')}`

  return (
    <section aria-labelledby="budget-watch-heading" className="overview-quiet-card flex flex-col rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="budget-watch-heading" className="text-sm font-semibold">Budget watch</h2>
          <p className="mt-1 text-xs text-[hsl(var(--text-secondary))]">{alerts.length ? `${alerts.length} categor${alerts.length === 1 ? 'y needs' : 'ies need'} a look` : budgets.length ? 'Your budgets are on track' : 'Give every category a plan'}</p>
        </div>
        {alerts.length ? <SlidersHorizontal className="h-4 w-4 text-amber-300" aria-hidden="true" /> : <CircleCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" />}
      </div>
      <div className="mt-4 flex-1 space-y-4">
        {shown.map(budget => {
          const over = Math.max(0, budget.projected_month_total - budget.budget)
          return <div key={budget.category}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-medium">{budget.category}</span>
              <span className="shrink-0 tabular-nums text-[hsl(var(--text-secondary))]">{money(budget.spent)} <span className="text-[hsl(var(--text-tertiary))]">/ {money(budget.budget)}</span></span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={cn('h-full rounded-full', alerts.includes(budget) ? 'bg-amber-400/80' : 'bg-emerald-400/65')} style={{ width: `${Math.min(100, Math.max(0, budget.pct_used))}%` }} />
            </div>
            {alerts.includes(budget) && <p className="mt-1 text-[11px] text-amber-300">{money(over)} over budget at the current projection</p>}
          </div>
        })}
        {!shown.length && <p className="text-sm leading-relaxed text-[hsl(var(--text-secondary))]">Set category limits to see what is available and catch overspending early.</p>}
      </div>
      <Link href="/finance/budgets" className="mt-4 inline-flex min-h-10 items-center justify-between gap-2 border-t border-[hsl(var(--border-subtle))] pt-3 text-xs font-semibold text-sky-300">{budgets.length ? 'Review budgets' : 'Set up budgets'} <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
    </section>
  )
}
