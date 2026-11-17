import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StocksTab } from '@/components/finance/investments/stocks-tab'
import { computePortfolio } from '@/components/finance/investments/portfolio'
import type { StockHolding } from '@/components/finance/investments/types'

const RATE = 18.5
const QUOTES = {
  NVDA: { symbol: 'NVDA', price: 160, currency: 'USD' as const, previousClose: 158, change: 2, changePct: 1.27, usd: 160, mxn: 160 * RATE, source: 'yahoo' as const },
  VOO: { symbol: 'VOO', price: 600, currency: 'USD' as const, previousClose: 603, change: -3, changePct: -0.5, usd: 600, mxn: 600 * RATE, source: 'yahoo' as const },
}

const row = (over: Partial<StockHolding>): StockHolding => ({
  id: 'x', ticker: 'X', name: 'X', exchange: 'US', asset_type: 'stock', shares: 1, avg_cost_basis: 100, currency: 'USD', broker: 'GBM', owner: 'Bernardo', notes: null, ...over,
})
const NVDA_B = row({ id: 'nb', ticker: 'NVDA', name: 'NVIDIA Corporation', shares: 0.34692423, avg_cost_basis: 154.185 })
const NVDA_L = row({ id: 'nl', ticker: 'NVDA', name: 'NVIDIA Corporation', shares: 1, avg_cost_basis: 150, owner: 'Laura' })
const VOO_L = row({ id: 'vl', ticker: 'VOO', name: 'Vanguard S&P 500 ETF', asset_type: 'etf', shares: 0.2, avg_cost_basis: 590, owner: 'Laura' })
const PE = row({ id: 'pe', ticker: 'NXM', name: 'Nexaminds — Employee Equity', asset_type: 'private_equity', shares: 10000, avg_cost_basis: 0.5, current_price_usd: 2, owner: 'bernardo' })

type Call = { url: string; method: string; body: Record<string, unknown> | null }
let calls: Call[] = []

function mockApi({ txs = [] as unknown[], pending = false } = {}) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (url.includes('/stocks/search')) {
      return Response.json({ results: [{ symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', type: 'stock', currency: 'USD' }] })
    }
    if (url.includes('/stocks/transactions')) {
      if (method === 'GET') return Response.json({ transactions: txs, migration_pending: pending })
      return Response.json({ id: 't1' }, { status: method === 'POST' ? 201 : 200 })
    }
    if (url.includes('/investments/stocks')) {
      if (method === 'POST') return Response.json({ id: 'new-holding' }, { status: 201 })
      return Response.json({ ok: true })
    }
    return Response.json({})
  }))
}

function renderTab(stocks: StockHolding[], { ownerFilter = 'All', ledgerReady = true, onChanged = vi.fn(async () => {}) } = {}) {
  const portfolio = computePortfolio({ stocks, fixedIncome: [], realEstate: [], crypto: [], prices: { BTC: { usd: 1, mxn: 18 } }, retirement: [], ownerFilter, stockQuotes: QUOTES, stockFx: RATE })
  render(<StocksTab portfolio={portfolio} allStocks={stocks} ledgerReady={ledgerReady} ownerFilter={ownerFilter} failed={false} onRetry={() => {}} onChanged={onChanged} />)
  return { onChanged }
}

const posts = (part: string) => calls.filter(c => c.method === 'POST' && c.url.includes(part))

beforeEach(() => { try { window.localStorage.clear() } catch { /* ignore */ } })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Stocks tab', () => {
  it('shows the empty state and keeps the private equity card', async () => {
    mockApi()
    renderTab([PE])
    expect(screen.getByText('No public stocks yet')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Private equity' })).toBeInTheDocument()
    expect(screen.getAllByText(/Nexaminds/).length).toBeGreaterThan(0)
  })

  it('adds a stock: search → pick → owner → log the first buy (GBM receipt)', async () => {
    mockApi()
    const { onChanged } = renderTab([PE])
    fireEvent.click(screen.getAllByRole('button', { name: /Add stock/ })[0])
    fireEvent.change(screen.getByPlaceholderText(/Search a company or ticker/), { target: { value: 'nvidia' } })
    fireEvent.click(await screen.findByRole('button', { name: /NVIDIA Corporation/ }, { timeout: 2000 }))
    expect(screen.getByRole('radio', { name: /Bernardo/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(screen.getByLabelText('Shares *'), { target: { value: '0.34692423' } })
    fireEvent.change(screen.getByLabelText('Price per share *'), { target: { value: '153.81' } })
    fireEvent.click(screen.getByRole('button', { name: /Use GBM 0.25%/ }))
    expect(screen.getByLabelText(/Commission/)).toHaveValue(0.13)
    expect(screen.getByLabelText('Broker')).toHaveValue('GBM')
    fireEvent.click(screen.getByRole('button', { name: 'Add & log buy' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(posts('/investments/stocks')[0].body).toMatchObject({ ticker: 'NVDA', currency: 'USD', owner: 'Bernardo', shares: 0, asset_type: 'stock' })
    expect(posts('/stocks/transactions')[0].body).toMatchObject({
      holding_id: 'new-holding', type: 'buy', shares: 0.34692423, price: 153.81, price_currency: 'USD', commission: 0.13, broker: 'GBM',
    })
  })

  it('shows one row per ticker with the B/L split and a total row', async () => {
    mockApi()
    renderTab([NVDA_B, NVDA_L, VOO_L, PE])
    const table = screen.getByRole('table', { name: 'Holdings by stock' })
    const rows = within(table).getAllByRole('row')
    // header + NVDA + VOO + total
    expect(rows).toHaveLength(4)
    expect(rows[1]).toHaveTextContent('NVDA')
    expect(rows[1]).toHaveTextContent('B 0.3469 · L 1')
    expect(rows[3]).toHaveTextContent('Total · 2 stocks')
    expect(within(table).queryByText('NXM')).not.toBeInTheDocument()
  })

  it('switches between MXN and USD and remembers the choice', async () => {
    mockApi()
    renderTab([NVDA_B])
    const table = screen.getByRole('table', { name: 'Holdings by stock' })
    const valueMXN = 0.34692423 * 160 * RATE
    // A fraction of a share: shown with cents.
    expect(table).toHaveTextContent(new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valueMXN))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Show amounts in' })).getByRole('radio', { name: 'USD' }))
    expect(table).toHaveTextContent('US$')
    expect(table).toHaveTextContent('55.51')
    expect(window.localStorage.getItem('mona:stocks-currency')).toBe('USD')
  })

  it('logs a sell for the holder', async () => {
    mockApi()
    renderTab([NVDA_B])
    fireEvent.click(within(screen.getByRole('table', { name: 'Holdings by stock' })).getByRole('button', { name: 'Log NVDA transaction' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Sell' }))
    fireEvent.change(within(dialog).getByLabelText('Shares *'), { target: { value: '0.1' } })
    fireEvent.change(within(dialog).getByLabelText('Price per share *'), { target: { value: '170' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Log sell' }))
    await waitFor(() => expect(posts('/stocks/transactions')).toHaveLength(1))
    expect(posts('/stocks/transactions')[0].body).toMatchObject({ holding_id: 'nb', type: 'sell', shares: 0.1, price: 170 })
    // No new holding for an existing one.
    expect(posts('/investments/stocks').filter(c => !c.url.includes('transactions'))).toHaveLength(0)
  })

  it('removes one owner’s shares or the whole ticker, saying the history goes too', async () => {
    mockApi({ txs: [{ id: 't1', holding_id: 'nb', type: 'buy', shares: 0.34692423, price: 153.81, price_currency: 'USD', fx_usd_mxn: 18.5, commission: 0.13, total: 53.49, broker: 'GBM', notes: null, transaction_date: '2026-11-17', ticker: 'NVDA', owner: 'Bernardo' }] })
    renderTab([NVDA_B, NVDA_L])
    await screen.findByRole('table', { name: 'Stock transaction history' })
    fireEvent.click(within(screen.getByRole('table', { name: 'Holdings by stock' })).getByRole('button', { name: 'Remove NVDA' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /Only Bernardo/ }))
    expect(dialog).toHaveTextContent('1 logged transaction')
    expect(dialog).toHaveTextContent('history')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(calls.some(c => c.method === 'DELETE')).toBe(true))
    expect(calls.find(c => c.method === 'DELETE')!.body).toEqual({ ids: ['nb'] })
  })

  it('before the migration: says so, and only offers a balance', async () => {
    mockApi({ pending: true })
    renderTab([PE], { ledgerReady: false })
    expect(screen.getByText(/Database update pending/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /Add stock/ })[0])
    fireEvent.change(screen.getByPlaceholderText(/Search a company or ticker/), { target: { value: 'nvidia' } })
    fireEvent.click(await screen.findByRole('button', { name: /NVIDIA Corporation/ }, { timeout: 2000 }))
    expect(screen.getByRole('radio', { name: 'Log the first buy' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Shares held *'), { target: { value: '0.34692423' } })
    fireEvent.change(screen.getByLabelText(/Average cost per share/), { target: { value: '154.19' } })
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Add stock' }))
    await waitFor(() => expect(posts('/investments/stocks')).toHaveLength(1))
    expect(posts('/investments/stocks')[0].body).toMatchObject({ ticker: 'NVDA', shares: 0.34692423, avg_cost_basis: 154.19 })
    expect(posts('/stocks/transactions')).toHaveLength(0)
  })
})
