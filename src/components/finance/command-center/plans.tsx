'use client'

import { useState } from 'react'
import { Target, HeartPulse, Scissors, ChevronDown, ChevronUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { cn } from '@/lib/utils'
import { type Summary, fmtMoney, fmtMonth } from './types'

// Small stat shown under a plan card's primary number.
function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">{label}</p>
      <p className={cn(
        'text-sm font-bold tabular-nums',
        tone === 'good' && 'text-emerald-600',
        tone === 'bad' && 'text-rose-600',
      )}>{value}</p>
    </div>
  )
}

function ExpandToggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 w-full inline-flex items-center justify-center gap-1 py-1.5 text-xs font-medium text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--muted))]/30 rounded-md transition-colors"
    >
      {open ? <>Hide detail <ChevronUp className="h-3 w-3" /></> : <>Show detail <ChevronDown className="h-3 w-3" /></>}
    </button>
  )
}

function CutList({ cuts, total, gap }: {
  cuts: Summary['year_end_goal_plan']['recommended_cuts']
  total: number
  gap: number
}) {
  const remainingAfterCuts = Math.max(0, gap - total)
  if (cuts.length === 0) {
    return <p className="text-sm text-[hsl(var(--text-tertiary))]">No wants budgets available to allocate cuts.</p>
  }
  return (
    <div className="space-y-2">
      {cuts.slice(0, 4).map(cut => (
        <div key={cut.category} className="flex items-center gap-3">
          <span className="w-7 text-center">{cut.icon || '·'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium truncate">{cut.category}</span>
              <span className="font-semibold tabular-nums text-emerald-600">+{fmtMoney(cut.cut_amount)}/mo</span>
            </div>
            <p className="mt-0.5 text-[10px] text-[hsl(var(--text-tertiary))]">
              Cap at {fmtMoney(cut.recommended_cap)} from {fmtMoney(cut.current_budget)}
            </p>
          </div>
        </div>
      ))}
      <p className="text-[10px] text-[hsl(var(--text-tertiary))] pt-1">
        These cuts cover {fmtMoney(total)} of the gap.
        {remainingAfterCuts > 0 ? ` Remaining: ${fmtMoney(remainingAfterCuts)}/mo.` : ' Gap covered.'}
      </p>
    </div>
  )
}

// ─── December target — compact card ──────────────────────────────────────────
function DecemberCard({ plan }: { plan: Summary['year_end_goal_plan'] }) {
  const [open, setOpen] = useState(false)
  const progress = plan.target_amount > 0 ? Math.round((plan.current_saved / plan.target_amount) * 100) : 0
  const totalCuts = plan.recommended_cuts.reduce((s, c) => s + c.cut_amount, 0)

  return (
    <GlassCard className={cn('border-l-2', plan.on_track ? 'border-l-emerald-500' : 'border-l-rose-500')}>
      <div className="flex items-center gap-2">
        <Target className={cn('h-4 w-4', plan.on_track ? 'text-emerald-600' : 'text-rose-600')} />
        <h4 className="text-sm font-semibold">December target</h4>
      </div>

      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Monthly gap to stay on track</p>
        <p className={cn('text-2xl font-bold tabular-nums leading-none', plan.on_track ? 'text-emerald-600' : 'text-rose-600')}>
          {plan.on_track ? 'On track' : `${fmtMoney(plan.monthly_extra_needed, { compact: true })}/mo`}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <MiniStat label="Saved" value={fmtMoney(plan.current_saved, { compact: true })} tone="good" />
        <MiniStat label="To save" value={fmtMoney(plan.goal_remaining, { compact: true })} />
        <MiniStat label="+ Treatment" value={fmtMoney(plan.treatment_remaining, { compact: true })} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-[hsl(var(--text-secondary))]">Goal progress</span>
          <span className="text-[11px] tabular-nums text-[hsl(var(--text-tertiary))]">{progress}% of {fmtMoney(plan.target_amount, { compact: true })}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      </div>

      <ExpandToggle open={open} onClick={() => setOpen(!open)} />

      {open && (
        <div className="mt-3 space-y-3 border-t border-[hsl(var(--border))] pt-3">
          <div className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            plan.on_track ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-rose-500/25 bg-rose-500/5'
          )}>
            <p className="font-medium">
              Need {fmtMoney(plan.goal_remaining)} for goals + {fmtMoney(plan.treatment_remaining)} for treatment = {fmtMoney(plan.total_needed_by_december)} by December.
            </p>
            <p className="mt-1">
              Free cash pace {fmtMoney(plan.monthly_free_cash)}/mo × {plan.months_remaining}mo = {fmtMoney(plan.projected_free_cash_by_december)}.{' '}
              {plan.on_track
                ? <span className="text-emerald-600">Surplus: {fmtMoney(plan.surplus_by_december)}.</span>
                : <span className="text-rose-600">Shortfall: {fmtMoney(plan.shortfall_by_december)}.</span>}
            </p>
          </div>
          {!plan.on_track && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Scissors className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-medium text-[hsl(var(--text-secondary))]">Possible monthly cuts</span>
              </div>
              <CutList cuts={plan.recommended_cuts} total={totalCuts} gap={plan.monthly_extra_needed} />
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}

// ─── Fertility treatment — compact card ──────────────────────────────────────
function FertilityCard({ plan }: { plan: Summary['fertility_plan'] }) {
  const [open, setOpen] = useState(false)
  const paid = plan.planning_total - plan.remaining_amount
  const progress = plan.planning_total > 0 ? Math.round((paid / plan.planning_total) * 100) : 0
  const next = plan.current_month_event ?? plan.remaining_events[0] ?? null
  const nextPayment = next?.amount ?? plan.current_month_commitment
  const gap = plan.monthly_gap_to_keep_goals
  const hasGap = gap > 0
  const totalCuts = plan.recommended_cuts.reduce((s, c) => s + c.cut_amount, 0)
  const remainingAfterCuts = Math.max(0, gap - totalCuts)
  const formulaResult = plan.monthly_free_cash - nextPayment - plan.total_goal_monthly_needed

  return (
    <GlassCard className={cn('border-l-2', hasGap ? 'border-l-rose-500' : 'border-l-emerald-500')}>
      <div className="flex items-center gap-2">
        <HeartPulse className={cn('h-4 w-4', hasGap ? 'text-rose-600' : 'text-emerald-600')} />
        <h4 className="text-sm font-semibold">Fertility treatment</h4>
      </div>

      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Remaining of {fmtMoney(plan.planning_total, { compact: true })} all-in</p>
        <p className="text-2xl font-bold tabular-nums leading-none">{fmtMoney(plan.remaining_amount, { compact: true })}</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <MiniStat label="Next pay" value={next ? fmtMoney(nextPayment, { compact: true }) : '—'} />
        <MiniStat label="Mo. shortfall" value={hasGap ? fmtMoney(gap, { compact: true }) : '$0'} tone={hasGap ? 'bad' : 'good'} />
        <MiniStat label="Free after" value={fmtMoney(plan.discretionary_after_treatment, { compact: true })} tone={plan.discretionary_after_treatment >= 0 ? 'good' : 'bad'} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-[hsl(var(--text-secondary))]">Paid</span>
          <span className="text-[11px] tabular-nums text-[hsl(var(--text-tertiary))]">{progress}% · {fmtMoney(paid, { compact: true })}</span>
        </div>
        <div className="h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      </div>

      <ExpandToggle open={open} onClick={() => setOpen(!open)} />

      {open && (
        <div className="mt-3 space-y-3 border-t border-[hsl(var(--border))] pt-3">
          <div className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            hasGap ? 'border-rose-500/25 bg-rose-500/5' : 'border-emerald-500/25 bg-emerald-500/5'
          )}>
            <p className="font-medium">
              Free cash {fmtMoney(plan.monthly_free_cash)} − next payment {fmtMoney(nextPayment)} − goals {fmtMoney(plan.total_goal_monthly_needed)} ={' '}
              <span className={cn(formulaResult >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                {formulaResult >= 0 ? `${fmtMoney(formulaResult)} available` : `${fmtMoney(Math.abs(formulaResult))} short`}
              </span>
            </p>
            <p className="mt-1 text-[hsl(var(--text-tertiary))]">Monthly cash-flow check, not the full treatment cost.</p>
          </div>

          <div>
            <span className="text-xs font-medium text-[hsl(var(--text-secondary))]">Payment schedule</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {plan.monthly_events.map(event => {
                const isPast = !plan.remaining_events.some(item => item.month === event.month)
                return (
                  <div key={event.month} className={cn(
                    'rounded-lg border px-2 py-2',
                    isPast ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30'
                  )}>
                    <p className="text-xs font-medium">{fmtMonth(event.month)}</p>
                    <p className="text-sm font-bold tabular-nums">{fmtMoney(event.amount, { compact: true })}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {hasGap && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Scissors className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-medium text-[hsl(var(--text-secondary))]">Suggested temporary cuts</span>
              </div>
              <CutList cuts={plan.recommended_cuts} total={totalCuts} gap={gap} />
              {remainingAfterCuts > 0 && plan.deferred_catch_up_monthly > 0 && (
                <p className="mt-1 text-[10px] text-[hsl(var(--text-tertiary))]">Remaining pressure after cuts: {fmtMoney(remainingAfterCuts)}.</p>
              )}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}

// ─── Plans section — one headline, two compact cards ─────────────────────────
export function PlansSection({ summary }: { summary: Summary | null }) {
  const december = summary?.year_end_goal_plan
  const fertility = summary?.fertility_plan
  if (!december && !fertility) return null

  const onTrack = december?.on_track ?? true
  const headline = december
    ? (onTrack
        ? `On track to reach ${fmtMoney(december.target_amount, { compact: true })} by December`
        : `Need ${fmtMoney(december.monthly_extra_needed, { compact: true })}/mo more to stay on plan`)
    : 'Treatment plan'

  return (
    <section id="plans">
      <div className="flex items-end justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold leading-tight">Plans</h3>
          <p className={cn('text-xs mt-0.5', onTrack ? 'text-emerald-600' : 'text-rose-600')}>{headline}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {december && <DecemberCard plan={december} />}
        {fertility && <FertilityCard plan={fertility} />}
      </div>
    </section>
  )
}
