import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/finance-review.json'
import InsightsClient from '@/components/finance/insights-client'

vi.mock('@/lib/west-projection-client', () => ({ fetchWestProjection: () => Promise.resolve(null) }))
vi.mock('@/components/brand-logo', () => ({ WolffAvatar: () => null }))

const now = new Date()
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const summary = { ...fixture.summary, current_month: { ...fixture.summary.current_month, month } }

const staleInsights = {
  generated_at: '2026-09-04T13:30:00Z',
  stale: true,
  insights: [
    { type: 'alert', icon: '🛒', title: 'Protege $108,231 para WEST hoy', detail: 'La proyección es **$119,400**.', priority: 'high', category: 'WIDGET' },
    { type: 'recommendation', icon: '', title: 'Cocina en casa el fin', detail: 'Ahorra $2k.', priority: 'medium', category: 'WEEK' },
  ],
}

function stub(insights: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => url.includes('/insights') ? insights : url.includes('summary') ? summary : {},
  })))
}

beforeEach(() => { window.localStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('Daily Brief', () => {
  it('shows the live plan instead of a stale “Today’s Priority”', async () => {
    stub(staleInsights)
    render(<InsightsClient />)
    expect(await screen.findByText('Today’s move')).toBeInTheDocument()
    expect(screen.queryByText('Today\'s Priority')).not.toBeInTheDocument()
    expect(screen.queryByText(/Protege/)).not.toBeInTheDocument()
    expect(screen.getByText(/last AI brief Sep 4/)).toBeInTheDocument()
  })

  it('keeps the old brief behind “Show last brief”', async () => {
    stub(staleInsights)
    render(<InsightsClient />)
    fireEvent.click(await screen.findByRole('button', { name: /Show last brief \(Sep 4\)/ }))
    expect(screen.getByText('Protege $108,231 para WEST hoy')).toBeInTheDocument()
    expect(screen.getByText('$119,400').tagName).toBe('STRONG')
    expect(screen.getByText(/may no longer match this month/)).toBeInTheDocument()
  })

  it('keeps the priority hero for a brief written today', async () => {
    stub({ ...staleInsights, stale: false, generated_at: new Date().toISOString() })
    render(<InsightsClient />)
    expect(await screen.findByText('Today\'s Priority')).toBeInTheDocument()
    expect(screen.getAllByText('Protege $108,231 para WEST hoy').length).toBeGreaterThan(0)
    expect(screen.queryByText('Today’s move')).not.toBeInTheDocument()
  })

  it('uses the archived brief when the API already serves live items', async () => {
    stub({ generated_at: new Date().toISOString(), source: 'live', expired: true, insights: [], archived: staleInsights.insights })
    render(<InsightsClient />)
    expect(await screen.findByText('Today’s move')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show last brief/ })).toBeInTheDocument()
  })

  it('uses words, not emoji, for budget status', async () => {
    stub(staleInsights)
    const { container } = render(<InsightsClient />)
    await screen.findByText('Today’s move')
    expect(container.textContent).not.toMatch(/🐺|🔴|⚠️|✅|📅/)
    expect(screen.getByRole('heading', { level: 1, name: 'Daily Brief' })).toBeInTheDocument()
  })
})
