'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Baby, CalendarClock, GraduationCap, ShieldCheck, TrendingUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { BABY_CHECKLIST, PROTECTION_PLAN } from '@/lib/baby-plan'
import { cn } from '@/lib/utils'
import { type Summary, fmtMoney, fmtMonth } from './command-center/types'
import { EducationProjectionWithScenarios } from './family-tracker'

function fmtMonthYear(month: string) {
  return `${fmtMonth(month)} ${month.slice(0, 4)}`
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

type ChecklistState = 'open' | 'upcoming' | 'closed'

export function FamilyClient() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const sum = await fetch('/api/finance/summary').then(r => r.ok ? r.json() : null).catch(() => null)
    setSummary(sum)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const h = () => { if (document.visibilityState === 'visible') fetchData() }
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
  }, [fetchData])

  const today = useMemo(() => dayKey(new Date()), [])
  const checklist = useMemo(() =>
    BABY_CHECKLIST.map(item => ({
      ...item,
      state: (item.windowStart <= today && today <= item.windowEnd ? 'open'
        : today < item.windowStart ? 'upcoming' : 'closed') as ChecklistState,
    })), [today])

  if (loading) {
    return (
      <div className="max-w-6xl space-y-6 p-0 md:p-6">
        <div className="h-8 w-48 rounded bg-[hsl(var(--muted))] animate-pulse" />
        <div className="h-40 rounded-xl bg-[hsl(var(--muted))] animate-pulse" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-64 rounded-xl bg-[hsl(var(--muted))] animate-pulse" />
          <div className="h-64 rounded-xl bg-[hsl(var(--muted))] animate-pulse" />
        </div>
      </div>
    )
  }

  const baby = summary?.baby_plan && summary.baby_plan.planning_total > 0 ? summary.baby_plan : null
  if (!baby) {
    return (
      <div className="max-w-6xl p-0 md:p-6">
        <GlassCard className="p-8 text-center text-sm text-[hsl(var(--text-tertiary))]">No family plan configured.</GlassCard>
      </div>
    )
  }

  const spentPct = Math.round((baby.spent_to_date / baby.planning_total) * 100)
  const next = baby.current_month_event ?? baby.remaining_events[0] ?? null

  return (
    <PageTransition>
      <div className="max-w-6xl space-y-6 p-0 md:p-6" data-animate>
        {/* Header */}
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl sm:text-3xl font-bold tracking-tight"><span className="section-tick" aria-hidden />Family Plan</h1>
          <p className="text-[hsl(var(--text-secondary))] text-sm">Baby {fmtMonthYear(baby.due_month)}, the education fund, and protection</p>
        </div>

        {/* ── Hero: the countdown and the envelope ── */}
        <GlassCard className="p-5 sm:p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-sky-500/5 rounded-full blur-3xl" />
          <div className="relative grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Baby arrives</span>
              <p className="num-metric text-3xl sm:text-4xl font-bold tabular-nums mt-1 text-sky-600">{baby.months_to_birth} mo</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">due {fmtMonthYear(baby.due_month)}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Envelope remaining</span>
              <p className="num-metric text-3xl sm:text-4xl font-bold tabular-nums mt-1">{fmtMoney(baby.remaining_amount, { compact: true })}</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">of {fmtMoney(baby.planning_total, { compact: true })} planned</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Next event</span>
              <p className="num-metric text-3xl sm:text-4xl font-bold tabular-nums mt-1">{next ? fmtMoney(next.amount, { compact: true }) : '—'}</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">{next ? `${next.label.split('(')[0].trim()} · ${fmtMonthYear(next.month)}` : 'schedule complete'}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Fund at 2045</span>
              <p className="num-metric text-3xl sm:text-4xl font-bold tabular-nums mt-1 text-violet-600">{fmtMoney(baby.education.projected_value, { compact: true })}</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">vs Tec {fmtMoney(baby.education.tec_cost_min, { compact: true })}–{fmtMoney(baby.education.tec_cost_max, { compact: true })}</p>
            </div>
          </div>
          <div className="relative mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-[hsl(var(--text-secondary))]">Envelope spent — transactions tagged “baby”</span>
              <span className="text-[11px] tabular-nums text-[hsl(var(--text-tertiary))]">{spentPct}% · {fmtMoney(baby.spent_to_date, { compact: true })}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.min(spentPct, 100)}%` }} />
            </div>
          </div>
        </GlassCard>

        {/* ── Schedule + Action items ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Planned Spend</h3>
            </div>
            <div className="space-y-2">
              {baby.monthly_events.map(event => {
                const isPast = !baby.remaining_events.some(item => item.month === event.month)
                return (
                  <div key={event.month} className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2.5',
                    isPast ? 'border-sky-500/30 bg-sky-500/5' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30'
                  )}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{event.label}</p>
                      <p className="text-[10px] text-[hsl(var(--text-tertiary))]">{fmtMonthYear(event.month)}{isPast ? ' · elapsed' : ''}</p>
                    </div>
                    <span className="text-sm font-bold tabular-nums shrink-0 ml-3">{fmtMoney(event.amount, { compact: true })}</span>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[10px] text-[hsl(var(--text-tertiary))]">
              Amounts are the planning envelope (Monterrey private care, Aug 2026 research). Each milestone clears when a matching “baby”-tagged transaction posts.
            </p>
          </GlassCard>

          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <Baby className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Action Items</h3>
            </div>
            <div className="space-y-2">
              {checklist.map(item => (
                <div key={item.id} className={cn(
                  'rounded-lg border px-3 py-2.5',
                  item.state === 'open' && item.severity === 'warning' && 'border-amber-500/40 bg-amber-500/5',
                  item.state === 'open' && item.severity === 'info' && 'border-sky-500/30 bg-sky-500/5',
                  item.state === 'upcoming' && 'border-[hsl(var(--border))] bg-[hsl(var(--muted))]/20 opacity-70',
                  item.state === 'closed' && 'border-[hsl(var(--border))] opacity-45',
                )}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn('text-sm font-medium', item.state === 'closed' && 'line-through')}>{item.title}</p>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
                      item.state === 'open' && item.severity === 'warning' && 'bg-amber-500/15 text-amber-700',
                      item.state === 'open' && item.severity === 'info' && 'bg-sky-500/15 text-sky-700',
                      item.state === 'upcoming' && 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]',
                      item.state === 'closed' && 'bg-[hsl(var(--accent))] text-[hsl(var(--text-tertiary))]',
                    )}>
                      {item.state === 'open' ? `closes ${item.windowEnd.slice(5)}` : item.state === 'upcoming' ? `opens ${item.windowStart.slice(0, 7)}` : 'window closed'}
                    </span>
                  </div>
                  {item.state !== 'closed' && (
                    <p className="mt-1 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))]">{item.description}</p>
                  )}
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* ── Education fund: the 18-year project ── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="h-4 w-4 text-violet-600" />
            <h2 className="text-base font-semibold">Education Fund 2045</h2>
          </div>
          <EducationProjectionWithScenarios />
        </div>

        {/* ── Protection ── */}
        <GlassCard className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Protection Plan</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-[hsl(var(--text-tertiary))]">
                  <th className="pb-2 pr-4 font-semibold">Insured</th>
                  <th className="pb-2 pr-4 font-semibold">Product</th>
                  <th className="pb-2 pr-4 font-semibold text-right">Coverage target</th>
                  <th className="pb-2 font-semibold text-right">Est. premium</th>
                </tr>
              </thead>
              <tbody>
                {PROTECTION_PLAN.policies.map(p => (
                  <tr key={p.person} className="border-t border-[hsl(var(--border-subtle))]">
                    <td className="py-2.5 pr-4 font-medium">{p.person}</td>
                    <td className="py-2.5 pr-4 text-[hsl(var(--text-secondary))]">{p.product}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{fmtMoney(p.coverage_min, { compact: true })}–{fmtMoney(p.coverage_max, { compact: true })}</td>
                    <td className="py-2.5 text-right tabular-nums">{fmtMoney(p.monthly_min, { compact: true })}–{fmtMoney(p.monthly_max, { compact: true })}/mo</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))]">
            Sizing: {PROTECTION_PLAN.sizing_rule}. Quote all of {PROTECTION_PLAN.insurers.join(', ')} — identical profiles vary up to 40%.
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--text-tertiary))]">{PROTECTION_PLAN.estate_note}</p>
        </GlassCard>

        {/* ── The engine ── */}
        <GlassCard className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700">
                <TrendingUp className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Funded by the same engine</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))] max-w-xl">
                  This plan doesn&rsquo;t have its own money — it&rsquo;s a set of claims on the household portfolio. The birth envelope draws on the emergency-fund surplus;
                  the education fund becomes a dedicated GBM position from {baby.education.start_month}; the insurance premiums are cash-flow. WEST and the yearly goals live on the same pot.
                </p>
              </div>
            </div>
            <Link href="/finance/investments" className="inline-flex items-center justify-center gap-1.5 shrink-0 rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium hover:bg-[hsl(var(--accent))] transition-colors">
              Open Investments <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  )
}
