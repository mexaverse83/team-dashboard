import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/finance-review.json'
import { supabase } from '@/lib/supabase'
import CommandCenter from '@/components/finance/command-center-client'

vi.mock('@/components/finance/wolff-widget', () => ({ WolffWidget: () => null }))
vi.mock('@/components/finance/month-projection-card', () => ({ MonthProjectionCard: () => null }))
vi.mock('@/components/finance/install-prompt', () => ({ InstallPrompt: () => null }))
vi.mock('@/components/ui/sparkline-chart', () => ({ SparklineChart: () => null }))

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
    // More than 200 transactions, including income beyond the old cutoff.
    const data = table === 'finance_categories' ? fixture.categories : [
      ...Array.from({ length: 220 }, (_, i) => ({ ...fixture.transactions[1], id: String(i), transaction_date: new Date().toISOString().slice(0, 7) + '-01', amount_mxn: 10 })),
      { ...fixture.transactions[0], transaction_date: new Date().toISOString().slice(0, 7) + '-01', amount_mxn: 10000 },
    ]
    const chain = { select: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn(), range: vi.fn(), abortSignal: vi.fn(), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) }
    for (const fn of [chain.select, chain.gte, chain.lte, chain.order, chain.range, chain.abortSignal]) fn.mockReturnValue(chain)
    return chain as unknown as ReturnType<typeof supabase.from>
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('summary') ? fixture.summary : url.includes('forecast') ? fixture.forecast : fixture.netWorth })))
})

describe('command center reliability', () => {
  it('includes transactions beyond 200 and opens the actual entry flow', async () => {
    render(<CommandCenter />)
    await waitFor(() => expect(screen.getByText('+$7.8k')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'New transaction' })).toHaveAttribute('href', '/finance/transactions?add=1')
  })
  it('offers recovery instead of showing zero balances when initial loading fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    render(<CommandCenter />)
    expect(await screen.findByText('Your finances are unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('net this month')).not.toBeInTheDocument()
  })
  it('keeps the last successful data after a failed refresh', async () => {
    render(<CommandCenter />)
    await screen.findByText('+$7.8k')
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('last successful update'))
    expect(screen.getByText('+$7.8k')).toBeInTheDocument()
  })
})
