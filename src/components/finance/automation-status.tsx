'use client'

// Automation health (AUTO-06, CH-22): a status dot for the masthead and a
// panel with per-job detail. Reads GET /api/finance/health; "Run now" POSTs
// the job's own endpoint after a confirm.
import { useCallback, useEffect, useId, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ChevronDown, Loader2, Play, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusPill } from '@/components/ui/status-pill'
import { useFinanceData } from '@/hooks/use-finance-data'
import { formatDateShort } from '@/lib/format'
import { MX_TIME_ZONE, mexicoCityToday, addDaysKey } from '@/lib/dates'
import { TONE_FILL_CLASS, type Tone } from '@/lib/budget-tone'
import { dispatchFinanceEvent, FINANCE_EVENTS } from '@/lib/finance-events'

export type JobHealth = 'ok' | 'late' | 'failing' | 'unknown'

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

const TONE: Record<JobHealth, Tone> = { ok: 'positive', late: 'warning', failing: 'negative', unknown: 'neutral' }
const WORD: Record<JobHealth, string> = { ok: 'OK', late: 'Late', failing: 'Failing', unknown: 'Not tracked' }

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
  if (late.length || (health.status !== 'ok' && health.status !== 'unknown')) {
    const label = late.length === 1 ? `${late[0].label || late[0].job} late` : late.length ? `${late.length} automations late` : 'Automation needs attention'
    return { tone: 'warning', text: label, short: 'Late' }
  }
  const recurring = health.jobs.find(j => j.job === 'process-recurring')
  const at = recurring?.last_ok_at ? new Date(recurring.last_ok_at) : null
  return { tone: 'positive', text: at ? `Automations OK · ${timeFmt.format(at)}` : 'Automations OK', short: 'OK' }
}

function cadence(h: number | null) {
  if (h == null) return 'on events'
  if (h <= 1) return 'hourly'
  if (h === 24) return 'daily'
  return `every ${h}h`
}

/** Plain-language line for the household; the raw error sits behind "Show details". */
function jobSummary(job: HealthJob): string | null {
  if (job.status === 'failing') return 'The last run didn’t finish. It retries on its next run.'
  if (job.status === 'late') return 'Hasn’t run on schedule.'
  const warnings = job.warnings?.length ?? 0
  if (warnings) return `${warnings} item${warnings === 1 ? '' : 's'} need${warnings === 1 ? 's' : ''} a look.`
  return null
}

function JobRow({ job, now, onRun, running }: { job: HealthJob; now: Date; onRun?: (job: HealthJob) => void; running: boolean }) {
  const [open, setOpen] = useState(false)
  const summary = jobSummary(job)
  const details = [...(job.last_error && job.status !== 'ok' ? [job.last_error] : []), ...(job.warnings ?? [])]
  const hasMore = details.length > 0
  const canRun = Boolean(job.run_path && onRun && (job.status === 'late' || job.status === 'failing'))
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-fg">{job.label || job.job}</span>
        {/* Wrapper sets the size: StatusPill's own text-label is dropped by tailwind-merge next to a tone colour. */}
        <span className="shrink-0 text-xs"><StatusPill tone={TONE[job.status]}>{WORD[job.status]}</StatusPill></span>
      </div>
      <p className="mt-0.5 text-label text-fg-secondary">
        {job.status === 'unknown' ? `Last posted ${whenLabel(job.last_ok_at, now)}` : `Last success ${whenLabel(job.last_ok_at, now)}`}
        <span aria-hidden="true"> · </span>
        {cadence(job.expected_every_h)}
        {job.source === 'inferred' && <span> · estimated</span>}
      </p>
      {summary && (
        <p className={cn('mt-1 text-xs', job.status === 'failing' ? 'text-negative' : job.status === 'late' ? 'text-warning' : 'text-fg-secondary')}>
          {summary}
        </p>
      )}
      {open && hasMore && (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-label text-fg-secondary">
          {details.map(d => <li key={d} className="break-words">{d}</li>)}
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
  /**
   * Dot only: 'beside' portals the desktop popover next to the sidebar
   * (whose scroll container would clip an absolutely positioned one).
   */
  placement?: 'below' | 'beside'
}

export function AutomationStatus({ variant = 'dot', className, readOnly = false, align = 'end', placement = 'below' }: AutomationStatusProps) {
  const { data, error, loading, refreshing, refresh } = useFinanceData<HealthResponse>('automation-health', fetchHealth, { minIntervalMs: 120_000 })
  if (variant === 'panel') {
    return <AutomationPanel data={data} error={error} loading={loading} refreshing={refreshing} refresh={refresh} readOnly={readOnly} className={className} />
  }
  return <AutomationDot data={data} error={error} refresh={refresh} refreshing={refreshing} readOnly={readOnly} className={className} align={align} placement={placement} />
}

interface ViewProps {
  data: HealthResponse | undefined
  error: Error | null
  refresh: () => Promise<void>
  refreshing: boolean
  readOnly: boolean
  className?: string
}

const PHONE_QUERY = '(max-width: 639px)'

function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = typeof window !== 'undefined' ? window.matchMedia?.(PHONE_QUERY) : undefined
    if (!mq) return
    const sync = () => setPhone(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])
  return phone
}

function AutomationDot({ data, error, refresh, refreshing, readOnly, className, align, placement }: ViewProps & { align: 'start' | 'end'; placement: 'below' | 'beside' }) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const popover = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const phone = usePhone()
  const summary = error && !data ? { tone: 'neutral' as Tone, text: 'Automation status unavailable', short: 'Unknown' } : summarizeHealth(data)

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    heading.current?.focus()
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!wrapper.current?.contains(target) && !popover.current?.contains(target)) close(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(true) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, close])

  const panel = <AutomationPanel data={data} error={error} loading={!data && !error} refreshing={refreshing} refresh={refresh} readOnly={readOnly} className="shadow-xl" headingRef={heading} onClose={() => close(true)} />

  return (
    <div ref={wrapper} className={cn('relative inline-block min-w-0 max-w-full', className)}>
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close(false) : setOpen(true))}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={summary.text}
        title={summary.text}
        className="inline-flex min-h-[var(--tap-min)] min-w-0 max-w-full items-center gap-2 rounded-full px-2 text-label font-medium text-fg-secondary transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:min-h-8"
      >
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          {summary.tone === 'negative' && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden', TONE_FILL_CLASS.negative)} />}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', TONE_FILL_CLASS[summary.tone])} />
        </span>
        <span aria-hidden="true" className="sm:hidden">{summary.short}</span>
        <span aria-hidden="true" className="hidden min-w-0 max-w-[14rem] truncate sm:inline">{summary.text}</span>
      </button>
      {open && !phone && placement === 'beside' && createPortal(
        <div id={panelId} ref={popover} role="dialog" aria-label="Automation status" className="fixed bottom-4 left-[15.5rem] z-[111] max-h-[calc(100dvh-2rem)] w-[24rem] overflow-y-auto rounded-xl lg:left-[17.5rem]">
          {panel}
        </div>,
        document.body,
      )}
      {open && !phone && placement === 'below' && (
        <div id={panelId} ref={popover} role="dialog" aria-label="Automation status" className={cn('absolute z-50 mt-2 w-[24rem]', align === 'end' ? 'right-0' : 'left-0')}>
          {panel}
        </div>
      )}
      {/* On a phone the sheet is portalled above the app chrome, over a scrim. */}
      {open && phone && createPortal(
        <>
          <div aria-hidden="true" className="fixed inset-0 z-[110] bg-black/50" onClick={() => close(true)} />
          <div id={panelId} ref={popover} role="dialog" aria-modal="true" aria-label="Automation status" className="fixed inset-x-4 top-20 z-[111] max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl">
            {panel}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

function AutomationPanel({ data, error, loading, refreshing, refresh, readOnly, className, headingRef, onClose }: ViewProps & { loading: boolean; headingRef?: Ref<HTMLHeadingElement>; onClose?: () => void }) {
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
  if (checks?.transactions) footer.push(`${checks.transactions.count.toLocaleString('en-US')} transactions`)
  if (checks?.insights) footer.push(checks.insights.usable_today ? 'AI brief from today' : `AI brief ${checks.insights.generated_at ? whenLabel(checks.insights.generated_at, now) : 'missing'} · live plan in use`)

  return (
    <Card className={cn('text-left', className)} aria-busy={loading || refreshing} role="region" aria-label="Automation status">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {/* Focus target when the popover opens; not interactive, so no ring. */}
          <h3 ref={headingRef} tabIndex={-1} style={{ outline: 'none' }} className="text-sm font-semibold text-fg">Automations</h3>
          <p className="truncate text-label text-fg-secondary">{error && !data ? 'Status unavailable' : summary.text}</p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" onClick={() => void refresh()} aria-label="Refresh automation status" disabled={refreshing}>
            <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close automation status">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </div>
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
              Run history isn’t set up yet, so these times are estimates from what was posted.
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
