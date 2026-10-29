import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CryptoClient } from '@/components/finance/crypto-client'
import { formatDateShort } from '@/lib/format'

const holding = {
  id: 'aero-position', symbol: 'AERO', name: 'Aerodrome', owner: 'Bernardo',
  quantity: 1, avg_cost_basis_usd: null, cost_currency: 'MXN', wallet_address: null, notes: null,
}
const swaps = [
  { id: 'october-swap', holding_id: holding.id, symbol: 'AERO', owner: 'Bernardo', type: 'sell', quantity: 2440.199, price_per_coin_mxn: 14.66, total_mxn: 35776.54, transaction_date: '2026-10-08', exchange: null, notes: null },
  { id: 'september-swap', holding_id: holding.id, symbol: 'AERO', owner: 'Bernardo', type: 'sell', quantity: 723.172, price_per_coin_mxn: 14.66, total_mxn: 10602.65, transaction_date: '2026-09-25', exchange: 'Coinbase', notes: null },
]

function mockData(initialTransactions = swaps) {
  let transactions = initialTransactions
  const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => ({
    ok: true,
    text: async () => JSON.stringify(url.includes('/transactions')
      ? { transactions }
      : { holdings: [holding], prices: { AERO: { usd: 0.79, mxn: 14.6, change24h: 0 } } }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, setTransactions: (next: typeof swaps) => { transactions = next } }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('crypto transaction history', () => {
  it('shows both historical AERO sales independently of the current holding quantity', async () => {
    mockData()
    render(<CryptoClient />)
    await screen.findByText('Transaction History')
    const history = within(screen.getByRole('table'))
    expect(history.getByText('2,440.199')).toBeInTheDocument()
    expect(history.getByText('723.172')).toBeInTheDocument()
    expect(history.getByText(formatDateShort('2026-10-08'))).toBeInTheDocument()
    expect(history.getByText(formatDateShort('2026-09-25'))).toBeInTheDocument()
    expect(history.getAllByText(/Sell/)).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'View transaction history (2)' })).toHaveAttribute('href', '#crypto-transactions')
  })

  it('loads transactions added outside the app when the user returns to the window', async () => {
    const data = mockData([])
    render(<CryptoClient />)
    await screen.findByText('Crypto Portfolio')
    expect(screen.queryByText('Transaction History')).not.toBeInTheDocument()

    data.setTransactions(swaps)
    fireEvent(window, new Event('focus'))

    await screen.findByText('Transaction History')
    expect(within(screen.getByRole('table')).getByText('2,440.199')).toBeInTheDocument()
    expect(data.fetchMock.mock.calls.filter(([url]) => url.includes('/transactions')).length).toBeGreaterThan(1)
    expect(data.fetchMock.mock.calls.every(([, options]) => options?.cache === 'no-store')).toBe(true)
  })

  it('refreshes the history when a suspended mobile app becomes visible', async () => {
    const data = mockData([])
    render(<CryptoClient />)
    await screen.findByText('Crypto Portfolio')
    const visibility = vi.spyOn(document, 'visibilityState', 'get')
    const initialCalls = data.fetchMock.mock.calls.length
    visibility.mockReturnValue('hidden')
    fireEvent(document, new Event('visibilitychange'))
    expect(data.fetchMock).toHaveBeenCalledTimes(initialCalls)

    data.setTransactions(swaps)
    visibility.mockReturnValue('visible')
    fireEvent(document, new Event('visibilitychange'))
    await screen.findByText('Transaction History')
    expect(within(screen.getByRole('table')).getByText('723.172')).toBeInTheDocument()
  })
})
