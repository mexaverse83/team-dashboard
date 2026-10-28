'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { StatusPill } from '@/components/ui/status-pill'
import { ownerSlot } from '@/components/ui/owner-avatar'
import { formatCompact, formatMoney, formatPct } from '@/lib/format'
import { OWNERS, canonicalOwner } from '@/lib/owners'
import type { Tone } from '@/lib/budget-tone'
import { cn } from '@/lib/utils'
import type { HomeWestPlan } from './command-center/west-plan'

export interface MonthProjection {
  expected_income: number
  income_received?: number
  income_still_scheduled?: number
  spent_so_far: number
  projected_spend: number
  projected_savings: number
  method?: string
}

interface Props {
  projection?: MonthProjection | null
  /** undefined = still loading (skeleton); null = unavailable. */
  westPlan?: HomeWestPlan | null
  monthLabel?: string
  monthEndLabel?: string
  dayOfMonth?: number
  daysInMonth?: number
  ownerSpend?: Record<string, number> | null
  /** Highlight this owner's spend chip (You mode). */
  highlightOwner?: string | null
}

const money = (n: number) => formatMoney(n)
const compact = (n: number) => formatCompact(n)

function verdict(p: MonthProjection, plan: HomeWestPlan | null | undefined): { text: string; tone: Tone; pill: string } {
  const rate = p.expected_income > 0 ? Math.round((p.projected_savings / p.expected_income) * 100) : null
  if (p.projected_savings < 0) return { text: 'Spending is running ahead of income this month', tone: 'negative', pill: 'Over income' }
  const text = rate != null ? `On track to save ${formatPct(rate)} of income` : 'On track to save this month'
  if (!plan) return { text, tone: 'neutral', pill: 'Projected' }
  if (p.projected_savings >= plan.capacity_target) return { text, tone: 'positive', pill: 'On plan' }
  return { text, tone: 'warning', pill: 'Below plan' }
}

// One bar against the realistic WEST capacity; the stretch (full funding)
// target is only a thin marker, never a second goal (UX-03, F04).
function WestBar({ projected, plan }: { projected: number; plan: HomeWestPlan }) {
  const capacity = plan.capacity_target
  const stretch = plan.month_target > capacity ? plan.month_target : null
  const scale = Math.max(capacity, stretch ?? 0, projected, 1)
  const at = (n: number) => `${Math.min(100, Math.max(0, (n / scale) * 100))}%`
  const ahead = projected >= capacity
  const gap = capacity - projected
  const pct = capacity > 0 ? Math.round((Math.max(0, projected) / capacity) * 100) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label font-medium text-fg-secondary">WEST plan this month</span>
        <span className="num text-label text-fg-secondary" data-money>{compact(Math.max(0, projected))} of {compact(capacity)}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Projected savings vs the WEST plan"
        aria-valuemin={0}
        aria-valuemax={Math.round(capacity)}
        aria-valuenow={Math.round(Math.min(capacity, Math.max(0, projected)))}
        aria-valuetext={`${pct}% of the WEST plan — ${ahead ? `${compact(-gap)} ahead` : `${compact(gap)} to go`}`}
        className="relative mt-2 h-2.5 w-full rounded-full bg-surface-3"
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', ahead ? 'bg-positive' : 'bg-warning')} style={{ width: at(Math.max(0, projected)) }} />
        {stretch != null && (
          <span aria-hidden="true" data-testid="plan-marker" className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded-full bg-fg" style={{ left: at(capacity) }} />
        )}
      </div>
      <div className="relative mt-1.5 h-4 text-micro text-fg-tertiary">
        {stretch != null && <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: at(capacity) }}>Plan</span>}
      </div>
      <p className={cn('mt-1 text-sm font-medium', ahead ? 'text-positive' : 'text-warning')} data-money>
        {ahead ? `${compact(-gap)} ahead of the plan` : `${compact(gap)} to reach the plan`}
      </p>
      {stretch != null && (
        <p className="mt-1 hidden text-label text-fg-tertiary sm:block">
          Stretch <span data-money>{compact(stretch)}</span>/mo funds WEST fully
          {plan.purchase_gap != null && plan.purchase_gap > 0 && <> · purchase gap <span data-money>{compact(plan.purchase_gap)}</span></>}
          {plan.furnishing_budget != null && plan.furnishing_budget > 0 && <> · furnishing <span data-money>{compact(plan.furnishing_budget)}</span></>}
        </p>
      )}
      {plan.cumulative_vs_capacity_since_jan != null && (
        <p className="mt-1 text-label text-fg-secondary" data-money>
          Since January: {plan.cumulative_vs_capacity_since_jan >= 0 ? `${compact(plan.cumulative_vs_capacity_since_jan)} ahead of plan` : `${compact(-plan.cumulative_vs_capacity_since_jan)} behind plan`}
        </p>
      )}
    </div>
  )
}

function OwnerSplit({ ownerSpend, highlightOwner }: { ownerSpend: Record<string, number>; highlightOwner?: string | null }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-label text-fg-secondary" aria-label="Spent this month by owner">
      {OWNERS.map(owner => {
        const value = Object.entries(ownerSpend).find(([k]) => canonicalOwner(k) === owner)?.[1] ?? 0
        return (
          <span key={owner} className={cn('inline-flex items-center gap-1', highlightOwner === owner && 'font-semibold text-fg')}>
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(var(--${ownerSlot(owner)}))` }} />
            <span>{owner.charAt(0)}</span>
            <span className="num" data-money>{compact(value)}</span>
          </span>
        )
      })}
    </span>
  )
}

// "This month": are we OK? One verdict, the projected savings number, one bar
// against the WEST plan (UX-02, UX-03, VIS-21). The 2026 goals live on the
// Goals page — they are the same GBM pesos, so they never sit beside WEST.
export function MonthProjectionCard({ projection, westPlan, monthLabel, monthEndLabel, dayOfMonth, daysInMonth, ownerSpend, highlightOwner }: Props) {
  if (!projection) return null
  const p = projection
  const v = verdict(p, westPlan)
  const received = p.income_received ?? p.expected_income
  const scheduled = p.income_still_scheduled ?? 0
  const stillExpected = Math.max(0, p.projected_spend - p.spent_so_far)
  const daysLeft = dayOfMonth && daysInMonth ? daysInMonth - dayOfMonth + 1 : null

  return (
    <Card variant="hero" padding="none" className="overflow-hidden" aria-labelledby="month-hero-title">
      <div className="grid gap-5 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="month-hero-title" className="text-label font-semibold uppercase tracking-[0.08em] text-fg-tertiary">{monthLabel ? `${monthLabel} · this month` : 'This month'}</h2>
            <StatusPill tone={v.tone} className="text-[0.75rem]">{v.pill}</StatusPill>
          </div>
          <p className="mt-2 text-[1.0625rem] font-medium leading-snug text-fg sm:mt-3">{v.text}</p>
          <p className={cn('num-metric mt-1 text-[2.5rem] font-semibold leading-[2.75rem] tracking-[-0.025em] sm:text-5xl', p.projected_savings < 0 ? 'text-negative' : 'text-fg')} data-money>
            {money(p.projected_savings)}
          </p>
          <p className="mt-1 text-label text-fg-tertiary">
            projected savings{monthEndLabel ? ` by ${monthEndLabel}` : ' at month end'}{daysLeft != null ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}
          </p>
        </div>

        <div className="min-w-0 lg:pt-1">
          {westPlan === undefined ? (
            <div aria-label="Loading WEST plan" className="space-y-2.5">
              <div className="h-3 w-40 animate-pulse rounded bg-surface-3" />
              <div className="h-2.5 w-full animate-pulse rounded-full bg-surface-3" />
              <div className="h-3 w-56 animate-pulse rounded bg-surface-3" />
            </div>
          ) : westPlan ? (
            <WestBar projected={p.projected_savings} plan={westPlan} />
          ) : (
            <p className="text-sm text-fg-tertiary">WEST plan unavailable right now. The projection above is live.</p>
          )}
          <Link href="/finance/investments?tab=Real%20Estate" className="mt-2 hidden min-h-9 items-center gap-1 text-label font-medium text-fg-secondary hover:text-fg sm:inline-flex">
            WEST tracker <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
        <dl className="grid grid-cols-3 divide-x divide-border">
          <div className="pr-4">
            <dt className="text-label text-fg-tertiary">Income</dt>
            <dd className="num mt-0.5 text-[0.9375rem] font-semibold text-fg" data-money>{compact(received)}</dd>
            {scheduled > 0 && <dd className="text-micro text-fg-tertiary" data-money>+{compact(scheduled)} due</dd>}
          </div>
          <div className="px-4">
            <dt className="text-label text-fg-tertiary">Spent</dt>
            <dd className="num mt-0.5 text-[0.9375rem] font-semibold text-fg" data-money>{compact(p.spent_so_far)}</dd>
          </div>
          <div className="pl-4">
            <dt className="text-label text-fg-tertiary">Still expected</dt>
            <dd className="num mt-0.5 text-[0.9375rem] font-semibold text-fg" data-money>{compact(stillExpected)}</dd>
          </div>
        </dl>
        {ownerSpend && <OwnerSplit ownerSpend={ownerSpend} highlightOwner={highlightOwner} />}
      </div>
    </Card>
  )
}
