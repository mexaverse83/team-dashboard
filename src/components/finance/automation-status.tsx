'use client'

// Automation health (AUTO-06, CH-22): a status dot for the masthead and a
// panel with per-job detail. Reads GET /api/finance/health; "Run now" POSTs
// the job's own endpoint after a confirm.
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Play, RefreshCw, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { useFinanceData } from '@/hooks/use-finance-data'
import { formatDateShort } from '@/lib/format'
import { MX_TIME_ZONE, mexicoCityToday, addDaysKey } from '@/lib/dates'
import { TONE_FILL_CLASS, type Tone } from '@/lib/budget-tone'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'

export type JobHealth = 'ok' | 'late' | 'failing'

export interface HealthJob {
  job: string
  label?: string
  last_ok_at: string | null
  last_run_at: string | null
  status: JobHealth
  last_error: string | null
  expected_every_h: number | null
  last_trigger?: string | null
  warnings?: string[]
  run_path?: string
  source?: 'ledger' | 'inferred'
}

export interface HealthResponse {
  status: JobHealth
  generated_at: string
  jobs: HealthJob[]
  checks?: {
    ledger?: 'ok' | 'missing'
    service_key_present?: boolean
    data_degraded?: boolean
    cron_secret_present?: boolean
    push_configured?: boolean
    transactions?: { count: number; page_size: number; pages: number } | null
    insights?: { generated_at: string | null; usable_today: boolean }
    recurring_income_active?: number | null
  }
  problems?: string[]
}

const TONE: Record<JobHealth, Tone> = { ok: 'positive', late: 'warning', failing: 'negative' }
const WORD: Record<JobHealth, string> = { ok: 'OK', late: 'Late', failing: 'Failing' }

async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  const res = await fetch('/api/finance/health', { cache: 'no-store', signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: MX_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
function mxDay(iso: string) {
  return mexicoCityToday(new Date(iso))
}

/** "6:05 AM" today, "yesterday 6:05 AM", "Oct 26" — on the household's calendar. */
export function whenLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'never'
  const minutes = Math.round((now.getTime() - d.getTime()) / 60_000)
  if (minutes >= 0 && minutes < 1) return 'just now'
  if (minutes > 0 && minutes < 60) return `${minutes} min ago`
  const today = mexicoCityToday(now)
  const day = mxDay(iso)
  if (day === today) return `today ${timeFmt.format(d)}`
  if (day === addDaysKey(today, -1)) return `yesterday ${timeFmt.format(d)}`
  return formatDateShort(day)
}

/** The one-line summary the dot shows. */
export function summarizeHealth(health: HealthResponse | undefined): { tone: Tone; text: string; short: string } {
  if (!health) return { tone: 'neutral', text: 'Checking automations…', short: 'Checking' }
  const failing = health.jobs.filter(j => j.status === 'failing')
  const late = health.jobs.filter(j => j.status === 'late')
  if (failing.length) {
    return { tone: 'negative', text: failing.length === 1 ? `${failing[0].label || failing[0].job} failing` : `${failing.length} automations failing`, short: 'Failing' }
  }
  if (late.length || health.status !== 'ok') {
    const label = late.length === 1 ? `${late[0].label || late[0].job} late` : late.length ? `${late.length} automations late` : 'Automation needs attention'
    return { tone: 'warning', text: label, short: 'Late' }
  }
  const recurring = health.jobs.find(j => j.job === 'process-recurring')
  const at = recurring?.last_ok_at ? new Date(recurring.last_ok_at) : null
  return { tone: 'positive', text: at ? `Automations OK · ${timeFmt.format(at)}` : 'Automations OK', short: 'OK' }
}

function StatusIcon({ status }: { status: JobHealth }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'late' ? AlertTriangle : XCircle
  return <Icon aria-hidden="true" className={cn('h-4 w-4 shrink-0', status === 'ok' ? 'text-positive' : status === 'late' ? 'text-warning' : 'text-negative')} />
}

function cadence(h: number | null) {
  if (h == null) return 'on events'
  if (h <= 1) return 'hourly'
  if (h === 24) return 'daily'
  return `every ${h}h`
}

function JobRow({ job, now, onRun, running }: { job: HealthJob; now: Date; onRun?: (job: HealthJob) => void; running: boolean }) {
  const [open, setOpen] = useState(false)
  const detail = job.last_error || (job.warnings?.length ? `${job.warnings.length} warning${job.warnings.length === 1 ? '' : 's'}` : null)
  const hasMore = Boolean(job.warnings?.length)
  const canRun = Boolean(job.run_path && onRun)
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <StatusIcon status={job.status} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-sm font-medium text-fg">{job.label || job.job}</span>
            <StatusPill tone={TONE[job.status]}>{WORD[job.status]}</StatusPill>
          </div>
          <p className="mt-0.5 text-label text-fg-secondary">
            Last success {whenLabel(job.last_ok_at, now)}
            <span aria-hidden="true"> · </span>
            {cadence(job.expected_every_h)}
            {job.source === 'inferred' && <span> · estimated</span>}
          </p>
          {detail && (
            <p className={cn('mt-1 break-words text-xs', job.status === 'failing' ? 'text-negative' : 'text-fg-secondary')}>
              {detail}
            </p>
          )}
          {open && job.warnings && (
            <ul className="mt-1 list-disc space-y-1 pl-4 text-label text-fg-secondary">
              {job.warnings.map(w => <li key={w} className="break-words">{w}</li>)}
            </ul>
          )}
          {(hasMore || canRun) && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {canRun && (
                <Button variant="secondary" size="sm" onClick={() => onRun!(job)} disabled={running} aria-label={`Run ${job.label || job.job} now`}>
                  {running ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Play aria-hidden="true" className="h-3.5 w-3.5" />}
                  Run now
                </Button>
              )}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setOpen(v => !v)}
                  aria-expanded={open}
                  className="inline-flex min-h-[var(--tap-min)] items-center gap-1 text-label font-medium text-fg-secondary hover:text-fg sm:min-h-8"
                >
                  <ChevronDown aria-hidden="true" className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                  {open ? 'Hide details' : 'Show details'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export interface AutomationStatusProps {
  variant?: 'dot' | 'panel'
  className?: string
  /** Panel only: hide the "Run now" buttons. */
  readOnly?: boolean
  /** Dot only: which edge the popover lines up with (default 'end', for a dot at the right of a header). */
  align?: 'start' | 'end'
}

export function AutomationStatus({ variant = 'dot', className, readOnly = false, align = 'end' }: AutomationStatusProps) {
  const { data, error, loading, refreshing, refresh } = useFinanceData<HealthResponse>('automation-health', fetchHealth, { minIntervalMs: 120_000 })
  if (variant === 'panel') {
    return <AutomationPanel data={data} error={error} loading={loading} refreshing={refreshing} refresh={refresh} readOnly={readOnly} className={className} />
  }
  return <AutomationDot data={data} error={error} refresh={refresh} refreshing={refreshing} readOnly={readOnly} className={className} align={align} />
}

interface ViewProps {
  data: HealthResponse | undefined
  error: Error | null
  refresh: () => Promise<void>
  refreshing: boolean
  readOnly: boolean
  className?: string
}

function AutomationDot({ data, error, refresh, refreshing, readOnly, className, align }: ViewProps & { align: 'start' | 'end' }) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const summary = error && !data ? { tone: 'neutral' as Tone, text: 'Automation status unavailable', short: 'Unknown' } : summarizeHealth(data)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!wrapper.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={wrapper} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        title={summary.text}
        className="inline-flex min-h-[var(--tap-min)] items-center gap-2 rounded-full px-2 text-label font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:min-h-8"
      >
        <span className="relative flex h-2 w-2" aria-hidden="true">
          {summary.tone === 'negative' && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden', TONE_FILL_CLASS.negative)} />}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', TONE_FILL_CLASS[summary.tone])} />
        </span>
        <span className="truncate">{summary.text}</span>
      </button>
      {open && (
        <div id={panelId} className={cn('z-50 max-sm:fixed max-sm:inset-x-4 max-sm:top-20 max-sm:max-h-[calc(100dvh-7rem)] max-sm:overflow-y-auto sm:absolute sm:mt-2 sm:w-[24rem]', align === 'end' ? 'sm:right-0' : 'sm:left-0')}>
          <AutomationPanel data={data} error={error} loading={!data && !error} refreshing={refreshing} refresh={refresh} readOnly={readOnly} className="shadow-xl" />
        </div>
      )}
    </div>
  )
}

function AutomationPanel({ data, error, loading, refreshing, refresh, readOnly, className }: ViewProps & { loading: boolean }) {
  const [running, setRunning] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null)
  const now = new Date()
  const summary = summarizeHealth(data)

  const runNow = useCallback(async (job: HealthJob) => {
    if (!job.run_path) return
    if (!window.confirm(`Run "${job.label || job.job}" now? It posts anything that is due to the real ledger.`)) return
    setRunning(job.job)
    setMessage(null)
    try {
      const res = await fetch(job.run_path, { method: 'POST', cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.results?.errors?.[0] || body?.error || `HTTP ${res.status}`)
      const created = typeof body.total_created === 'number' ? ` · ${body.total_created} posted` : ''
      const warnings = Array.isArray(body.item_warnings) && body.item_warnings.length ? ` · ${body.item_warnings.length} warning${body.item_warnings.length === 1 ? '' : 's'}` : ''
      setMessage({ tone: warnings ? 'warning' : 'positive', text: `${job.label || job.job} ran${created}${warnings}` })
      dispatchFinanceEvent(FINANCE_EVENTS.dataChanged, { source: 'automation', job: job.job })
    } catch (err) {
      setMessage({ tone: 'negative', text: `${job.label || job.job} failed: ${(err as Error).message}` })
    } finally {
      setRunning(null)
      void refresh()
    }
  }, [refresh])

  const checks = data?.checks
  const footer: string[] = []
  if (checks?.transactions) footer.push(`${checks.transactions.count.toLocaleString('en-US')} transactions · ${checks.transactions.pages} page${checks.transactions.pages === 1 ? '' : 's'}`)
  if (checks?.insights) footer.push(checks.insights.usable_today ? 'AI brief from today' : `AI brief ${checks.insights.generated_at ? whenLabel(checks.insights.generated_at, now) : 'missing'} · live plan in use`)

  return (
    <Card className={cn('text-left', className)} aria-busy={loading || refreshing} role="region" aria-label="Automation status">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-fg">Automations</h3>
          <p className="truncate text-label text-fg-secondary">{error && !data ? 'Status unavailable' : summary.text}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void refresh()} aria-label="Refresh automation status" disabled={refreshing}>
          <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </div>

      {loading && !data && (
        <ul aria-hidden="true" className="space-y-3">
          {[0, 1, 2].map(i => <li key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />)}
        </ul>
      )}

      {error && !data && (
        <p className="rounded-lg bg-surface-2 p-3 text-label text-fg-secondary">Couldn’t reach the health check ({error.message}). Try again in a minute.</p>
      )}

      {data && (
        <>
          {data.problems && data.problems.length > 0 && (
            <ul className="mb-3 space-y-1 rounded-lg bg-warning-bg p-3 text-label text-warning">
              {data.problems.map(p => <li key={p} className="flex gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{p}</li>)}
            </ul>
          )}
          {checks?.ledger === 'missing' && (
            <p className="mb-3 rounded-lg bg-surface-2 p-3 text-label text-fg-secondary">
              Run log not installed yet — times are estimated from posted data. Apply supabase-2026-10-automation-runs.sql.
            </p>
          )}
          <ul className="divide-y divide-border">
            {data.jobs.map(job => (
              <JobRow key={job.job} job={job} now={now} running={running === job.job} onRun={readOnly ? undefined : runNow} />
            ))}
          </ul>
          {message && (
            <p role="status" className={cn('mt-3 rounded-lg p-2.5 text-xs', message.tone === 'negative' ? 'bg-negative-bg text-negative' : message.tone === 'warning' ? 'bg-warning-bg text-warning' : 'bg-positive-bg text-positive')}>
              {message.text}
            </p>
          )}
          {footer.length > 0 && <p className="mt-3 border-t border-border pt-3 text-label text-fg-tertiary">{footer.join(' · ')}</p>}
        </>
      )}
    </Card>
  )
}
