import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { describeBudget, TONE_TEXT_CLASS } from '@/lib/budget-tone'
import { formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Summary } from './command-center/types'

const MAX_ROWS = 4

// Budget pace (not an alert surface — overruns live in Needs attention).
// One tone rule shared with the Budgets page (getBudgetTone, VIS-03) and a
// pace marker at today's share of the month.
export function BudgetWatch({ summary, exclude = [] }: {
  summary: Summary
  /** Categories already shown in Needs attention (UX-15: one surface per overrun). */
  exclude?: string[]
}) {
  const month = summary.current_month
  const budgets = month.budget_vs_actual.filter(b => !b.is_non_monthly && b.budget > 0)
  const pace = month.days_in_month > 0 ? month.day_of_month / month.days_in_month : null
  // "How are the rest pacing": furthest ahead of today's pace first.
  const paceRatio = (b: { spent: number; budget: number }) => b.spent / (b.budget * (pace || 1))
  // A fixed bill already paid has no pace to watch (the Budgets page still lists it): sort those last.
  const isPaid = (b: (typeof budgets)[number]) =>
    describeBudget({ actual: b.spent, budget: b.budget, projected: b.projected_month_total, isFixed: b.is_fixed }).label === 'Paid'
  const shown = budgets.filter(b => !exclude.includes(b.category))
    .sort((a, b) => Number(isPaid(a)) - Number(isPaid(b)) || paceRatio(b) - paceRatio(a))
    .slice(0, MAX_ROWS)

  return (
    <Card>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[0.9375rem] font-semibold text-fg">Budgets</h2>
          <p className="mt-0.5 text-label text-fg-tertiary">{budgets.length ? `Marker shows day ${month.day_of_month} of ${month.days_in_month}` : 'Give every category a plan'}</p>
        </div>
        <Link href={`/finance/budgets?month=${month.month}`} className="inline-flex min-h-9 items-center gap-1 text-label font-medium text-fg-secondary hover:text-fg">
          {budgets.length ? 'Review budgets' : 'Set up budgets'} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="space-y-3.5">
        {shown.map(budget => {
          const status = describeBudget({ actual: budget.spent, budget: budget.budget, projected: budget.projected_month_total, isFixed: budget.is_fixed })
          return (
            <div key={budget.category}>
              <div className="flex items-baseline justify-between gap-2 text-label">
                <span className="truncate font-medium text-fg">{budget.category}</span>
                <span className="flex shrink-0 items-baseline gap-2">
                  <span className="num text-fg-secondary" data-money>{formatMoney(budget.spent)} <span className="text-fg-tertiary">/ {formatMoney(budget.budget)}</span></span>
                  <span className={cn('w-14 text-right font-medium', TONE_TEXT_CLASS[status.tone])}>{status.label}</span>
                </span>
              </div>
              <ProgressBar
                className="mt-1.5"
                value={budget.spent}
                max={budget.budget}
                projected={budget.projected_month_total}
                isFixed={budget.is_fixed}
                marker={pace != null && !budget.is_fixed ? budget.budget * pace : null}
                label={`${budget.category} budget`}
              />
            </div>
          )
        })}
        {!shown.length && <p className="text-sm leading-relaxed text-fg-secondary">Set category limits to see what is available and catch overspending early.</p>}
      </div>
    </Card>
  )
}
