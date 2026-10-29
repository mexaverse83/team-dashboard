'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Baby, CalendarClock, Check, GraduationCap, ShieldCheck, Tag, TrendingUp } from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { PageTransition } from '@/components/page-transition'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { BABY_CHECKLIST, BABY_PLAN_TAG, PROTECTION_PLAN } from '@/lib/baby-plan'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/supabase-fetch-all'
import { diffDaysKey, mexicoCityToday, parseLocalDateKey } from '@/lib/dates'
import { formatCompact, formatDateShort, formatMoney, formatMonthShort } from '@/lib/format'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'
import { useFinanceData } from '@/hooks/use-finance-data'
import { useRefreshReport } from './command-center/use-refresh-report'
import { cn } from '@/lib/utils'
import type { FinanceTransaction } from '@/lib/finance-types'
import { type Summary, type TreatmentEvent, fmtMoney } from './command-center/types'
import { EducationProjectionWithScenarios } from './family-tracker'
import { WidgetInstallCard } from '@/components/finance/widget-install-card'

function fmtMonthYear(month: string) {
  return formatMonthShort(parseLocalDateKey(month), { withYear: true })
}

type ChecklistState = 'open' | 'upcoming' | 'closed'

// Collapse runs of identical months ("Prenatal care $4k" × 6) into one row (VIS-22).
export function groupPlanEvents(events: TreatmentEvent[]): Array<{ key: string; label: string; amount: number; count: number; first: string; last: string; months: string[] }> {
  const groups: Array<{ key: string; label: string; amount: number; count: number; first: string; last: string; months: string[] }> = []
  for (const event of events) {
    const label = event.label.split('(')[0].trim()
    const prev = groups[groups.length - 1]
    if (prev && prev.label === label && prev.amount === event.amount) {
      prev.count += 1
      prev.last = event.month
      prev.months.push(event.month)
    } else {
      groups.push({ key: event.month, label, amount: event.amount, count: 1, first: event.month, last: event.month, months: [event.month] })
    }
  }
  return groups
}

// ── Tag past baby expenses (UX-04, MOB-03 backfill) ─────────────────────────
// Untagged Health/Shopping rows since July whose text looks prenatal. Nothing
// is tagged until the user ticks rows and presses the button.
// `\bbeb[eé]` (bebé), not `beb`, which also matches "bebidas".
export const BABY_KEYWORDS = /bby|\bbeb[eé]|gine|prenatal|ultrason|eco |nutri|embarazo|pañal|pediatr|obstetr/i
const REVIEW_SINCE = '2026-07-01'
const REVIEW_PREVIEW_ROWS = 5
const REVIEW_CATEGORIES = new Set(['Health', 'Shopping'])

type ReviewRow = Pick<FinanceTransaction, 'id' | 'transaction_date' | 'merchant' | 'description' | 'amount_mxn' | 'tags' | 'owner' | 'category_id'> & { category_name: string }

async function loadBabyCandidates(): Promise<ReviewRow[]> {
  const { data: cats, error } = await supabase.from('finance_categories').select('id, name')
  if (error) throw new Error(error.message)
  const names = new Map((cats || []).map((c: { id: string; name: string }) => [c.id, c.name]))
  const ids = (cats || []).filter((c: { name: string }) => REVIEW_CATEGORIES.has(c.name)).map((c: { id: string }) => c.id)
  if (!ids.length) return []
  const rows = await fetchAllRows<Omit<ReviewRow, 'category_name'>>((from, to) => supabase.from('finance_transactions')
    .select('id, transaction_date, merchant, description, amount_mxn, tags, owner, category_id')
    .eq('type', 'expense').gte('transaction_date', REVIEW_SINCE).in('category_id', ids)
    .order('id').range(from, to), 1000, 20_000, true)
  return rows
    .filter(r => !(r.tags || []).includes(BABY_PLAN_TAG) && BABY_KEYWORDS.test(`${r.merchant || ''} ${r.description || ''} `))
    .map(r => ({ ...r, category_name: names.get(r.category_id) || '' }))
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
}

function BabyTagReview({ onTagged }: { onTagged: () => void }) {
  const candidates = useFinanceData<ReviewRow[]>('family:baby-candidates', loadBabyCandidates, { refetchOnVisible: false })
  const rows = candidates.data ?? null
  const failed = Boolean(candidates.error) && !candidates.data
  const load = () => { void candidates.refresh() }
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const tagSelected = async () => {
    if (!rows || selected.size === 0) return
    setSaving(true)
    setMessage(null)
    let ok = 0
    for (const row of rows.filter(r => selected.has(r.id))) {
      const tags = Array.from(new Set([...(row.tags || []), BABY_PLAN_TAG]))
      const { error } = await supabase.from('finance_transactions').update({ tags }).eq('id', row.id)
      if (!error) ok += 1
    }
    setSaving(false)
    setSelected(new Set())
    setMessage(ok === selected.size ? `Tagged ${ok} expense${ok === 1 ? '' : 's'} as baby.` : `Tagged ${ok} of ${selected.size}. Try the rest again.`)
    dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'finance_transactions' })
    load()
    onTagged()
  }

  const total = rows?.filter(r => selected.has(r.id)).reduce((sum, r) => sum + (Number(r.amount_mxn) || 0), 0) ?? 0

  return (
    <section id="baby-review" aria-labelledby="baby-review-title" className="scroll-mt-24 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="baby-review-title" className="flex items-center gap-2 text-[0.9375rem] font-semibold text-fg"><Tag className="h-4 w-4 text-fg-secondary" aria-hidden="true" />Tag past baby expenses</h2>
          <p className="mt-0.5 text-label text-fg-secondary">Health and shopping since July that look prenatal but miss the “baby” tag. Tagging feeds the envelope above.</p>
        </div>
      </div>
      {message && <p role="status" className="mt-3 text-label text-positive">{message}</p>}
      {failed ? (
        <p className="mt-3 text-sm text-fg-tertiary">Couldn’t load transactions. <button type="button" onClick={load} className="font-semibold text-fg underline">Retry</button></p>
      ) : rows === null ? (
        <div className="mt-3 space-y-2" aria-label="Loading candidates">{[0, 1, 2].map(i => <div key={i} className="h-11 animate-pulse rounded-lg bg-surface-2" />)}</div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-secondary">All caught up — nothing untagged looks like baby spending.</p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {(showAll ? rows : rows.slice(0, REVIEW_PREVIEW_ROWS)).map(row => {
              const checked = selected.has(row.id)
              return (
                <li key={row.id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                    <input type="checkbox" checked={checked} onChange={() => toggle(row.id)} className="peer sr-only" />
                    <span aria-hidden="true" className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[hsl(var(--positive))] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[hsl(var(--surface))]',
                      checked ? 'border-transparent bg-[hsl(var(--btn-primary-bg))] text-[hsl(var(--btn-primary-fg))]' : 'border-border-strong bg-surface')}>
                      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{row.merchant || row.description || '—'}</span>
                      <span className="flex items-center gap-1.5 text-micro text-fg-tertiary">{row.category_name} · {formatDateShort(parseLocalDateKey(row.transaction_date))}{row.owner && <OwnerAvatar owner={row.owner} size={14} />}</span>
                    </span>
                    <span className="num shrink-0 text-sm font-semibold text-fg" data-money>{formatMoney(row.amount_mxn)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
          {rows.length > REVIEW_PREVIEW_ROWS && (
            <button type="button" onClick={() => setShowAll(v => !v)} aria-expanded={showAll}
              className="mt-1 inline-flex min-h-11 items-center px-1 text-label font-semibold text-fg-secondary hover:text-fg">
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
          {/* Sticky so the action stays in reach while ticking rows (above the dock on phones). */}
          <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-2 flex items-center justify-between gap-2 border-t border-border bg-surface/95 px-4 py-2 backdrop-blur sm:-mx-5 sm:px-5 md:bottom-0">
            <span className="min-w-0 text-label text-fg-tertiary">
              {selected.size ? <>{selected.size} selected · <span data-money>{formatMoney(total)}</span></> : `${rows.length} candidate${rows.length === 1 ? '' : 's'}`}
              <button type="button" onClick={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map(r => r.id)))} className="ml-2 min-h-11 font-medium text-fg-secondary underline-offset-2 hover:text-fg hover:underline">
                {selected.size === rows.length ? 'Clear' : 'Select all'}
              </button>
            </span>
            <button type="button" onClick={tagSelected} disabled={saving || selected.size === 0}
              className="btn-primary inline-flex min-h-11 shrink-0 items-center rounded-lg px-4 text-sm font-semibold disabled:opacity-40">
              {saving ? 'Tagging…' : selected.size ? `Tag ${selected.size} as baby` : 'Select to tag'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}

export function FamilyClient() {
  const summaryQ = useFinanceData<Summary | null>('family:summary', async signal => {
    const res = await fetch('/api/finance/summary', { cache: 'no-store', signal })
    if (!res.ok) throw new Error(`summary ${res.status}`)
    return res.json()
  })
  useRefreshReport([summaryQ])
  const summary = summaryQ.data ?? null
  const loading = summaryQ.loading
  const fetchData = summaryQ.refresh

  const today = useMemo(() => mexicoCityToday(), [])
  const checklist = useMemo(() => {
    const STATE_ORDER: Record<ChecklistState, number> = { open: 0, upcoming: 1, closed: 2 }
    return BABY_CHECKLIST.map(item => {
      const state = (item.windowStart <= today && today <= item.windowEnd ? 'open'
        : today < item.windowStart ? 'upcoming' : 'closed') as ChecklistState
      // A window closing within 14 days is urgent whatever its static severity.
      const closingSoon = state === 'open' && diffDaysKey(today, item.windowEnd) <= 14
      return { ...item, state, severity: closingSoon ? 'warning' as const : item.severity }
    }).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]
      || (a.state === 'open' ? a.windowEnd.localeCompare(b.windowEnd) : 0))
  }, [today])

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
  const remainingMonths = new Set(baby.remaining_events.map(e => e.month))
  const eventGroups = groupPlanEvents(baby.monthly_events)

  return (
    <PageTransition>
      <div className="max-w-6xl space-y-6 p-0 md:p-6" data-animate>
        {/* Header */}
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-[2.125rem] tracking-[-0.02em] text-fg">Family &amp; Baby</h1>
          <p className="mt-1 text-sm text-fg-secondary">Baby {fmtMonthYear(baby.due_month)}, the education fund, and protection</p>
        </div>

        {/* ── Hero: the countdown and the envelope ── */}
        <GlassCard className="p-5 sm:p-6 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-sky-500/5 rounded-full blur-3xl" />
          <div className="relative grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Baby arrives</span>
              <p className="num-metric text-3xl sm:text-4xl font-bold tabular-nums mt-1 text-fg" data-privacy-exempt>{baby.months_to_birth} mo</p>
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
              <p className="num-metric text-3xl sm:text-4xl font-bold tabular-nums mt-1 text-fg">{formatCompact(baby.education.projected_value)}</p>
              <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">vs Tec {fmtMoney(baby.education.tec_cost_min, { compact: true })}–{fmtMoney(baby.education.tec_cost_max, { compact: true })}</p>
            </div>
          </div>
          <div className="relative mt-5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-[hsl(var(--text-secondary))]">Envelope spent — transactions tagged “baby”</span>
              <span className="text-[11px] tabular-nums text-[hsl(var(--text-tertiary))]">{spentPct}% · {fmtMoney(baby.spent_to_date, { compact: true })}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[hsl(var(--bg-elevated))] overflow-hidden">
              <div className="h-full rounded-full bg-fg-secondary" style={{ width: `${Math.min(spentPct, 100)}%` }} />
            </div>
          </div>
        </GlassCard>

        <BabyTagReview onTagged={() => { void fetchData() }} />

        {/* ── Schedule + Action items ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <GlassCard className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarClock className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Planned Spend</h3>
            </div>
            <div className="space-y-2">
              {eventGroups.map(group => {
                const elapsed = group.months.filter(m => !remainingMonths.has(m)).length
                const done = elapsed === group.count
                const range = group.count > 1 ? `${fmtMonthYear(group.first)} – ${fmtMonthYear(group.last)}` : fmtMonthYear(group.first)
                return (
                  <div key={group.key} className={cn(
                    'flex items-center justify-between rounded-lg border px-3 py-2.5',
                    done ? 'border-border bg-surface-2 opacity-70' : 'border-border bg-surface',
                  )}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg line-clamp-2 sm:line-clamp-none sm:truncate">{group.label}</p>
                      <p className="text-micro text-fg-tertiary">{range}{elapsed > 0 ? ` · ${done ? 'elapsed' : `${elapsed} of ${group.count} elapsed`}` : ''}</p>
                    </div>
                    <span className="num ml-3 shrink-0 text-sm font-bold text-fg" data-money>
                      {formatCompact(group.amount)}{group.count > 1 && <span className="font-medium text-fg-tertiary">/mo × {group.count}</span>}
                    </span>
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
                  <div className="flex flex-col-reverse items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <p className={cn('text-sm font-medium', item.state === 'closed' && 'line-through')}>{item.title}</p>
                    <span className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide whitespace-nowrap',
                      item.state === 'open' && item.severity === 'warning' && 'bg-amber-500/15 text-warning',
                      item.state === 'open' && item.severity === 'info' && 'bg-info-bg text-info',
                      item.state === 'upcoming' && 'bg-[hsl(var(--accent))] text-[hsl(var(--text-secondary))]',
                      item.state === 'closed' && 'bg-[hsl(var(--accent))] text-[hsl(var(--text-tertiary))]',
                    )}>
                      {item.state === 'open' ? `closes ${formatDateShort(parseLocalDateKey(item.windowEnd))}` : item.state === 'upcoming' ? `opens ${fmtMonthYear(item.windowStart.slice(0, 7))}` : 'window closed'}
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
            <ShieldCheck className="h-4 w-4 text-positive" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">Protection Plan</h3>
          </div>
          <div className="space-y-2 sm:hidden">
            {PROTECTION_PLAN.policies.map(p => (
              <div key={p.person} className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 px-3 py-2.5">
                <p className="text-sm font-medium">{p.person}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--text-secondary))]">{p.product}</p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Coverage target</span>
                    <span className="text-sm font-semibold tabular-nums">{fmtMoney(p.coverage_min, { compact: true })}–{fmtMoney(p.coverage_max, { compact: true })}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--text-tertiary))]">Est. premium</span>
                    <span className="text-sm font-semibold tabular-nums">{fmtMoney(p.monthly_min, { compact: true })}–{fmtMoney(p.monthly_max, { compact: true })}/mo</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto">
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

        {/* ── Phone widget (WS3): download the per-phone Scriptable loader ── */}
        <WidgetInstallCard />

        {/* ── The engine ── */}
        <GlassCard className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-positive">
                <TrendingUp className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="text-sm font-semibold">Funded by the same engine</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[hsl(var(--text-secondary))] max-w-xl">
                  This plan doesn&rsquo;t have its own money — it&rsquo;s a set of claims on the household portfolio. {(summary?.emergency_fund?.gap ?? 0) > 0
                    ? <>The birth envelope is funded from monthly cash flow (the emergency fund is {formatCompact(summary!.emergency_fund!.gap)} below target);</>
                    : <>The birth envelope draws on the emergency-fund surplus;</>}{' '}
                  the education fund becomes a dedicated GBM position from {fmtMonthYear(baby.education.start_month)}; the insurance premiums are cash-flow. WEST and the yearly goals live on the same pot.
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
