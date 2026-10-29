import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutomationStatus, summarizeHealth, whenLabel, type HealthResponse } from '@/components/finance/automation-status'

const NOW = new Date('2026-10-28T18:00:00Z') // 12:00 in Mexico City

const health = (overrides: Partial<HealthResponse> = {}): HealthResponse => ({
  status: 'ok',
  generated_at: NOW.toISOString(),
  jobs: [
    { job: 'process-recurring', label: 'Recurring bills, income & MSI', last_ok_at: '2026-10-28T12:05:00Z', last_run_at: '2026-10-28T12:05:00Z', status: 'ok', last_error: null, expected_every_h: 24, run_path: '/api/finance/process-recurring' },
    { job: 'net-worth', label: 'Net-worth snapshot', last_ok_at: '2026-10-27T12:15:00Z', last_run_at: '2026-10-28T12:15:00Z', status: 'ok', last_error: null, expected_every_h: 24 },
  ],
  checks: { ledger: 'ok', transactions: { count: 939, page_size: 1000, pages: 1 }, insights: { generated_at: '2026-09-04T13:30:53Z', usable_today: false } },
  problems: [],
  ...overrides,
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => (url === '/api/finance/health' ? health() : { total_created: 2, item_warnings: [] }) }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('summarizeHealth / whenLabel', () => {
  it('names the posting time when everything is fine', () => {
    expect(summarizeHealth(health())).toMatchObject({ tone: 'positive', text: 'Automations OK · 6:05 AM' })
  })
  it('names a single failing or late job, and counts several', () => {
    const failing = health({ status: 'failing', jobs: [{ ...health().jobs[1], status: 'failing', last_error: 'read failed' }] })
    expect(summarizeHealth(failing)).toMatchObject({ tone: 'negative', text: 'Net-worth snapshot failing' })
    const late = health({ status: 'late', jobs: health().jobs.map(j => ({ ...j, status: 'late' as const })) })
    expect(summarizeHealth(late)).toMatchObject({ tone: 'warning', text: '2 automations late' })
  })
  it('labels times on the Mexico City calendar', () => {
    expect(whenLabel('2026-10-28T12:05:00Z', NOW)).toBe('today 6:05 AM')
    expect(whenLabel('2026-10-27T12:15:00Z', NOW)).toBe('yesterday 6:15 AM')
    expect(whenLabel('2026-10-20T12:15:00Z', NOW)).toBe('Oct 20')
    expect(whenLabel('2026-10-28T17:50:00Z', NOW)).toBe('10 min ago')
    expect(whenLabel(null, NOW)).toBe('never')
  })
})

describe('<AutomationStatus />', () => {
  it('shows the dot summary and opens the panel', async () => {
    render(<AutomationStatus />)
    const dot = await screen.findByRole('button', { name: /Automations OK · 6:05 AM/ })
    fireEvent.click(dot)
    expect(await screen.findByRole('region', { name: 'Automation status' })).toBeInTheDocument()
    expect(screen.getByText('Net-worth snapshot')).toBeInTheDocument()
    expect(screen.getByText(/939 transactions/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close automation status' })).toBeInTheDocument()
    // Healthy jobs don't offer a manual run.
    expect(screen.queryByRole('button', { name: /^Run .* now$/ })).not.toBeInTheDocument()
  })

  it('runs a job only after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const lateHealth = health({ status: 'late', jobs: [{ ...health().jobs[0], status: 'late' }] })
    fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => (url === '/api/finance/health' ? lateHealth : { total_created: 2, item_warnings: [] }) }))
    render(<AutomationStatus variant="panel" />)
    const run = await screen.findByRole('button', { name: 'Run Recurring bills, income & MSI now' })
    fireEvent.click(run)
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0)
    fireEvent.click(run)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/finance/process-recurring', expect.objectContaining({ method: 'POST' })))
    expect(await screen.findByRole('status')).toHaveTextContent('Recurring bills, income & MSI ran · 2 posted')
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<AutomationStatus />)
    const dot = await screen.findByRole('button', { name: /Automations OK/ })
    fireEvent.click(dot)
    await screen.findByRole('dialog', { name: 'Automation status' })
    expect(document.activeElement).toHaveTextContent('Automations')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(dot)
  })

  it('keeps raw errors behind Show details', async () => {
    const failing = health({ status: 'failing', jobs: [{ ...health().jobs[1], status: 'failing', last_error: 'RecurringIncome fetch: TypeError: fetch failed' }] })
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => failing }))
    render(<AutomationStatus variant="panel" readOnly />)
    expect(await screen.findByText(/last run didn’t finish/)).toBeInTheDocument()
    expect(screen.queryByText(/TypeError/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText(/TypeError: fetch failed/)).toBeInTheDocument()
  })

  it('says so when the health check is unreachable', async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    render(<AutomationStatus variant="panel" readOnly />)
    expect(await screen.findByText(/Couldn’t reach the health check \(HTTP 503\)/)).toBeInTheDocument()
  })
})
