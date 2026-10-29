import { describe, expect, it, vi } from 'vitest'
import { buildJobStatuses, claimDedupeKey, computeJobHealth, overallHealth } from '@/lib/automation/runs'
import { buildReminders, type ReminderInput } from '@/lib/automation/reminders'

const NOW = new Date('2026-10-28T18:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

describe('automation health', () => {
  it('is ok inside the cadence and late after 26h for a daily job', () => {
    expect(computeJobHealth({ last_ok_at: hoursAgo(25), last_run_at: hoursAgo(25), last_status: 'ok' }, 24, NOW)).toBe('ok')
    expect(computeJobHealth({ last_ok_at: hoursAgo(27), last_run_at: hoursAgo(27), last_status: 'ok' }, 24, NOW)).toBe('late')
    expect(computeJobHealth(null, 24, NOW)).toBe('late')
  })
  it('is failing when the latest run errored, even with a recent success before it', () => {
    expect(computeJobHealth({ last_ok_at: hoursAgo(5), last_run_at: hoursAgo(1), last_status: 'error' }, 24, NOW)).toBe('failing')
    // A warning still counts as a successful run.
    expect(computeJobHealth({ last_ok_at: hoursAgo(1), last_run_at: hoursAgo(1), last_status: 'warning' }, 24, NOW)).toBe('ok')
  })
  it('never calls an event-driven job late', () => {
    expect(computeJobHealth({ last_ok_at: hoursAgo(400), last_status: 'ok' }, null, NOW)).toBe('ok')
  })
  it('lists required jobs even before they ever ran, and optional ones only once they report', () => {
    const jobs = buildJobStatuses([{ job: 'process-recurring', last_ok_at: hoursAgo(2), last_run_at: hoursAgo(2), last_status: 'warning', details: { warnings: ['Subscription X: unsupported recurrence'] } }], NOW)
    expect(jobs.map(j => j.job)).toEqual(['process-recurring', 'net-worth', 'reminders', 'push-daily'])
    expect(jobs[0]).toMatchObject({ status: 'ok', warnings: ['Subscription X: unsupported recurrence'], run_path: '/api/finance/process-recurring' })
    expect(jobs[1].status).toBe('late')
    expect(overallHealth(jobs)).toBe('late')
    expect(overallHealth([{ status: 'late' }, { status: 'failing' }])).toBe('failing')
  })
  it('claims a dedupe key once', async () => {
    const seen = new Set<string>()
    const supabase = { from: () => ({ upsert: (row: { dedupe_key: string }) => ({ select: async () => {
      const fresh = !seen.has(row.dedupe_key)
      seen.add(row.dedupe_key)
      return { data: fresh ? [{ id: 1 }] : [], error: null }
    } }) }) }
    const client = supabase as unknown as Parameters<typeof claimDedupeKey>[0]
    expect(await claimDedupeKey(client, 'reminders', 'k1')).toBe('claimed')
    expect(await claimDedupeKey(client, 'reminders', 'k1')).toBe('duplicate')
    const broken = { from: () => ({ upsert: () => ({ select: vi.fn().mockResolvedValue({ data: null, error: { message: 'no table' } }) }) }) }
    expect(await claimDedupeKey(broken as unknown as typeof client, 'reminders', 'k2')).toBe('unavailable')
  })
})

describe('reminders', () => {
  const base: ReminderInput = { today: '2026-10-28', dayOfWeek: 3 }

  it('reminds each owner the day before the BBVA Infinite due date with their own total', () => {
    const reminders = buildReminders({
      ...base,
      cardTransactions: [
        { type: 'expense', amount_mxn: 1_200, transaction_date: '2026-09-20', owner: 'laura', payment_method: 'bbva_infinite' },
        { type: 'expense', amount_mxn: 800, transaction_date: '2026-10-05', owner: 'Laura', payment_method: 'bbva_infinite' },
        { type: 'expense', amount_mxn: 500, transaction_date: '2026-10-12', owner: 'Laura', payment_method: 'bbva_infinite' },
        { type: 'expense', amount_mxn: 300, transaction_date: '2026-10-01', owner: 'Bernardo', payment_method: 'amex' },
      ],
    })
    expect(reminders).toEqual([expect.objectContaining({
      kind: 'card-due', owner: 'Laura', key: 'card-due:bbva_infinite:Laura:2026-10-29:tomorrow', body: 'Laura: pay $2,000 by tomorrow to avoid interest.',
    })])
  })

  it('previews month-start bills the evening before the 1st', () => {
    const [reminder] = buildReminders({
      ...base,
      today: '2026-10-31',
      dayOfWeek: 6,
      recurring: [
        { name: 'Rent', amount: 35_000, next_due_date: '2026-11-01' },
        { name: 'WEST', amount: 10_000, next_due_date: '2026-11-01' },
        { name: 'Internet', amount: 600, next_due_date: '2026-11-01' },
        { name: 'Gym', amount: 900, next_due_date: '2026-11-15' },
      ],
    })
    expect(reminder).toMatchObject({ key: 'month-start:2026-11-01', title: 'Tomorrow: $45,600 in bills', body: 'Rent $35k + WEST $10k + 1 more post on the 1st.' })
  })

  it('fires one budget reminder per category, month and threshold — only for controllable monthly rows', () => {
    const reminders = buildReminders({
      ...base,
      budgets: [
        { category: 'Dining Out', spent: 5_100, budget: 6_000 },
        { category: 'Other', spent: 12_000, budget: 3_500 },
        { category: 'Rent/Mortgage', spent: 45_000, budget: 45_000, is_fixed: true },
        { category: 'Utilities', spent: 3_000, budget: 1_000, is_non_monthly: true },
      ],
    })
    expect(reminders.map(r => r.key)).toEqual(['budget:Dining Out:2026-10:80', 'budget:Other:2026-10:100'])
  })

  it('flags a logging gap once per gap, and digests on Sunday only', () => {
    const gap = buildReminders({ ...base, lastManualEntryAt: '2026-10-23T20:00:00Z' })
    expect(gap.map(r => r.key)).toEqual(['logging-gap:2026-10-23'])
    expect(buildReminders({ ...base, lastManualEntryAt: '2026-10-26T20:00:00Z' })).toEqual([])
    const digest = { weekTitle: '$4,200 left this week', weekDetail: 'Through Sun Nov 1', householdTitle: 'Projected savings $84k' }
    expect(buildReminders({ ...base, digest })).toEqual([])
    expect(buildReminders({ ...base, today: '2026-11-01', dayOfWeek: 0, digest })[0]).toMatchObject({ key: 'digest:2026-11-01', kind: 'digest' })
  })

  it('nudges checklist items 7 days and 1 day before the window closes, unless done, never after', () => {
    const checklist = [{ id: 'baby-imss-weeks', title: 'Confirm IMSS weeks', windowEnd: '2026-10-29' }, { id: 'baby-testamento', title: 'Wills', windowEnd: '2026-09-30' }]
    expect(buildReminders({ ...base, checklist }).map(r => r.key)).toEqual(['checklist:baby-imss-weeks:2026-10-29:1d'])
    expect(buildReminders({ ...base, checklist, checklistDone: new Set(['baby-imss-weeks']) })).toEqual([])
  })

  it('dates the logging gap on the Mexico City calendar', () => {
    // 20:00 CDMX on Oct 23 is already Oct 24 in UTC.
    expect(buildReminders({ ...base, lastManualEntryAt: '2026-10-24T02:00:00Z' }).map(r => r.key)).toEqual(['logging-gap:2026-10-23'])
  })

  it('speaks the brief’s language so a push never mixes two', () => {
    const digest = { weekTitle: 'Te quedan $4,200 esta semana', weekDetail: 'Hasta el dom 1 nov', householdTitle: 'Ahorro proyectado $84k', topCategories: [{ category: 'Dining Out', spent: 5_100, budget: 6_000 }] }
    const out = buildReminders({ ...base, today: '2026-11-01', dayOfWeek: 0, digest, lang: 'es', budgets: [{ category: 'Other', spent: 12_000, budget: 3_500 }] })
    expect(out.map(r => r.title)).toEqual(['Other se pasó del presupuesto', 'Te quedan $4,200 esta semana'])
    expect(out[1].body).toContain('Mayores: Dining Out 85%')
    expect(out.map(r => `${r.title} ${r.body}`).join(' ')).not.toMatch(/\b(Top|over|left|this month)\b/)
  })

  it('reports a fresh price change', () => {
    const [reminder] = buildReminders({ ...base, priceChanges: [{ merchant: 'YouTube', amount: 319, transaction_date: '2026-10-28', description: 'Auto: YouTube (price changed from $300 → $319)' }] })
    expect(reminder).toMatchObject({ key: 'price:YouTube:2026-10-28', body: 'Now $319 (was $300).' })
  })
})
