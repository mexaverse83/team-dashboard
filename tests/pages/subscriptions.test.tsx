/**
 * Unit Tests — Subscriptions page (/finance/subscriptions)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { SEED_CATEGORIES, SEED_RECURRING } from '@/lib/seed-finance'
import { addDaysKey, localDateKey } from '@/lib/dates'
import { advanceDueDate, describeProcessResult, latestPriceChanges } from '@/components/finance/subscriptions-client'

// Importing every lucide icon for the mock is slow on a cold, loaded worker.
vi.setConfig({ testTimeout: 20000 })

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const icons: Record<string, unknown> = {}
  for (const key of Object.keys(actual)) {
    icons[key] = (props: Record<string, unknown>) => <svg data-testid={`icon-${key.toLowerCase()}`} {...props} />
  }
  return icons
})

vi.mock('@/components/ui/modal', () => ({
  Modal: ({ children, open, title }: any) => open ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null,
}))

const TODAY = localDateKey()
const RECURRING = [
  ...SEED_RECURRING.map(r => ({ ...r, next_due_date: addDaysKey(TODAY, 4) })),
  { id: 'r-due', name: 'YouTube Premium', amount: 319, currency: 'MXN', category_id: 'cat-subs', frequency: 'monthly', next_due_date: TODAY, is_active: true, merchant: 'YouTube', notes: null, owner: 'laura' },
  { id: 'r-paused', name: 'Gym', amount: 900, currency: 'MXN', category_id: 'cat-health', frequency: 'monthly', next_due_date: TODAY, is_active: false, merchant: 'Gym', notes: null, owner: null },
]
const POSTED = [
  { recurring_id: 'r-due', amount: 319, transaction_date: addDaysKey(TODAY, -30), description: 'Auto: YouTube Premium (price changed from $300 → $319)', flags: ['price_changed'] },
]

function makeChain(res: any) {
  const chain: any = { then: (ok: any, err: any) => Promise.resolve(res).then(ok, err) }
  for (const m of ['select', 'order', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'ilike', 'limit', 'single', 'range', 'is']) chain[m] = vi.fn(() => chain)
  return chain
}

const writes: Array<{ table: string; op: string; payload?: unknown; eq?: unknown[] }> = []

function writeChain(table: string, op: string, payload: unknown, res: any) {
  const entry: { table: string; op: string; payload?: unknown; eq?: unknown[] } = { table, op, payload }
  writes.push(entry)
  const chain = makeChain(res)
  chain.eq = vi.fn((...args: unknown[]) => { entry.eq = args; return chain })
  return chain
}

function setupSupabaseMock() {
  writes.length = 0
  const tables: Record<string, any> = {
    finance_categories: { data: SEED_CATEGORIES, error: null },
    finance_recurring: { data: RECURRING, error: null },
    finance_debts: { data: [], error: null },
    finance_transactions: { data: POSTED, error: null },
  }
  vi.mocked(supabase.from).mockImplementation(((table: string) => ({
    select: vi.fn(() => makeChain(tables[table] || { data: [], error: null })),
    insert: vi.fn((payload: unknown) => writeChain(table, 'insert', payload, { data: { id: 'tx-new' }, error: null })),
    update: vi.fn((payload: unknown) => writeChain(table, 'update', payload, { data: null, error: null })),
    delete: vi.fn(() => writeChain(table, 'delete', null, { data: null, error: null })),
  })) as unknown as typeof supabase.from)
}

let fetchMock: ReturnType<typeof vi.fn>

async function renderPage() {
  const Comp = (await import('@/components/finance/subscriptions-client')).default
  render(<Comp />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Subscriptions' })).toBeInTheDocument())
}

describe('Subscriptions page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
    fetchMock = vi.fn(() => Promise.resolve({ ok: true, status: 200, statusText: 'OK', json: () => Promise.resolve({ processed_at: '2026-10-28T12:00:00Z', results: { subscriptions: 2, income: 0, installments: 0, errors: [] }, total_created: 2, ok: true }) }))
    vi.stubGlobal('fetch', fetchMock)
  })

  it('renders the header and neutral KPIs', async () => {
    await renderPage()
    expect(screen.getByText('Recurring charges and subscription tracking')).toBeInTheDocument()
    expect(screen.getByText('Monthly burn')).toBeInTheDocument()
    expect(screen.getByText('Annual projection')).toBeInTheDocument()
    expect(screen.getByText('Next 30 days')).toBeInTheDocument()
  })

  it('lists subscriptions with "date · in N days" and a pill only when paused', async () => {
    await renderPage()
    const claude = screen.getByRole('button', { name: /^Edit Claude Pro/ })
    expect(within(claude).getByText(/· in 4 days/)).toBeInTheDocument()
    expect(within(claude).queryByText('Paused')).not.toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: /^Edit Gym/ })).getByText('Paused')).toBeInTheDocument()
    expect(screen.queryByText('Status')).not.toBeInTheDocument()
  })

  it('surfaces processor price changes', async () => {
    await renderPage()
    expect(within(screen.getByRole('button', { name: /^Edit YouTube Premium/ })).getByText('$300 → $319')).toBeInTheDocument()
  })

  it('replaces the duplicate upcoming list with a 30-day timeline', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Upcoming · next 30 days' })).toBeInTheDocument()
    expect(screen.getAllByText('Claude Pro').length).toBeGreaterThanOrEqual(2)
  })

  it('never posts without confirmation, then posts, reports and refetches', async () => {
    await renderPage()
    const before = vi.mocked(supabase.from).mock.calls.filter(([t]) => t === 'finance_recurring').length
    fireEvent.click(screen.getByRole('button', { name: 'Post due items (subscriptions, income, MSI)' }))
    const dialog = within(screen.getByTestId('modal'))
    expect(dialog.getByText('Post due items?')).toBeInTheDocument()
    expect(dialog.getByText(/YouTube Premium/)).toBeInTheDocument()
    expect(dialog.queryByText(/Gym/)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/finance/process-recurring', expect.anything())

    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith('/api/finance/process-recurring', expect.anything())

    fireEvent.click(screen.getByRole('button', { name: 'Post due items (subscriptions, income, MSI)' }))
    fireEvent.click(within(screen.getByTestId('modal')).getByRole('button', { name: 'Post now' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Posted 2 transactions'))
    expect(fetchMock).toHaveBeenCalledWith('/api/finance/process-recurring', { method: 'POST' })
    await waitFor(() => expect(vi.mocked(supabase.from).mock.calls.filter(([t]) => t === 'finance_recurring').length).toBeGreaterThan(before))
  })

  it('logging a due payment advances next_due_date so the processor does not re-post it, and undo reverts both', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Log YouTube Premium payment' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Logged YouTube Premium'))
    expect(writes.find(w => w.table === 'finance_transactions' && w.op === 'insert')).toBeTruthy()
    const advanced = advanceDueDate(TODAY, 'monthly')
    expect(writes).toContainEqual({ table: 'finance_recurring', op: 'update', payload: { next_due_date: advanced }, eq: ['id', 'r-due'] })
    expect(screen.getByRole('status')).toHaveTextContent('Next due')

    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(writes).toContainEqual({ table: 'finance_transactions', op: 'delete', payload: null, eq: ['id', 'tx-new'] }))
    await waitFor(() => expect(writes).toContainEqual({ table: 'finance_recurring', op: 'update', payload: { next_due_date: TODAY }, eq: ['id', 'r-due'] }))
  })

  it('logging a payment far from its due date leaves the schedule alone', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Log Netflix payment' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Logged Netflix'))
    expect(writes.some(w => w.table === 'finance_recurring' && w.op === 'update')).toBe(false)
  })

  it('uses contextual labels for row actions', async () => {
    await renderPage()
    expect(screen.getByRole('button', { name: 'Log Netflix payment' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause Netflix' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resume Gym' })).toBeInTheDocument()
  })
})

describe('subscription helpers', () => {
  it('shows errors and warnings from a partial 503 instead of "Service Unavailable"', () => {
    const outcome = describeProcessResult({ ok: false, statusText: 'Service Unavailable' }, {
      total_created: 3, ok: false, results: { errors: ['Sub Hulu: foreign-currency posting requires an explicit MXN conversion', 'Month close deferred until recurring processing succeeds'] }, item_warnings: ['Sub X: unsupported recurrence'],
    })
    expect(outcome.tone).toBe('warning')
    expect(outcome.title).toBe('Posted 3 transactions; 2 items need attention')
    expect(outcome.details).toHaveLength(2)
    expect(describeProcessResult({ ok: false, statusText: 'Service Unavailable' }, {}).tone).toBe('negative')
    const full = describeProcessResult({ ok: false, statusText: 'Service Unavailable' }, { total_created: 0, ok: false, results: { errors: ['Sub Hulu: insert failed'] } })
    expect(full.tone).toBe('negative')
    expect(full.title).toBe('Could not post due items; 1 error')
    expect(full.details).toEqual(['Sub Hulu: insert failed'])
    expect(describeProcessResult({ ok: true }, { total_created: 0 }).title).toBe('Nothing was due')
  })

  it('advances due dates on local calendar keys and clamps month ends', () => {
    expect(advanceDueDate('2026-10-31', 'monthly')).toBe('2026-11-30')
    expect(advanceDueDate('2026-12-15', 'monthly')).toBe('2027-01-15')
    expect(advanceDueDate('2026-11-30', 'quarterly')).toBe('2027-02-28')
    expect(advanceDueDate('2026-10-28', 'weekly')).toBe('2026-11-04')
    expect(advanceDueDate('2024-02-29', 'yearly')).toBe('2025-02-28')
  })

  it('reads only the latest charge per subscription for price changes', () => {
    expect(latestPriceChanges([
      { recurring_id: 'a', amount: 319, transaction_date: '2026-10-01', description: 'Auto: YT (recurring)', flags: null },
      { recurring_id: 'a', amount: 319, transaction_date: '2026-09-01', description: 'Auto: YT (price changed from $300 → $319)', flags: ['price_changed'] },
      { recurring_id: 'b', amount: 1299, transaction_date: '2026-10-01', description: 'Auto: Max (price changed from $1,199 → $1299)', flags: ['price_changed'] },
    ])).toEqual({ b: { from: 1199, to: 1299, date: '2026-10-01' } })
  })
})
