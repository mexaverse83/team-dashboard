import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CryptoClient } from '@/components/finance/crypto-client'

const base = { cost_currency: 'MXN', wallet_address: null, notes: null }
const holdings = [
  { ...base, id: 'sol-b', symbol: 'SOL', name: 'Solana', owner: 'Bernardo', quantity: 1.71, avg_cost_basis_usd: 2500 },
  { ...base, id: 'sol-l', symbol: 'SOL', name: 'Solana', owner: 'laura', quantity: 0.36, avg_cost_basis_usd: 2000 },
  { ...base, id: 'btc-b', symbol: 'BTC', name: 'Bitcoin', owner: 'Bernardo', quantity: 0.1, avg_cost_basis_usd: 1_500_000 },
  { ...base, id: 'kas-l', symbol: 'KAS', name: 'Kaspa', owner: 'Laura', quantity: 0, avg_cost_basis_usd: null },
]
const transactions = [
  { id: 't1', holding_id: 'sol-l', symbol: 'SOL', owner: 'laura', type: 'buy', quantity: 0.36, price_per_coin_mxn: 2000, total_mxn: 720, transaction_date: '2026-10-01', exchange: null, notes: null },
  { id: 't2', holding_id: 'sol-b', symbol: 'SOL', owner: 'Bernardo', type: 'buy', quantity: 1.71, price_per_coin_mxn: 2500, total_mxn: 4275, transaction_date: '2026-09-01', exchange: null, notes: null },
]
const prices = { SOL: { usd: 150, mxn: 3000, change24h: 0 }, BTC: { usd: 100_000, mxn: 2_000_000, change24h: 0 }, KAS: { usd: 0.05, mxn: 0.9, change24h: 0 } }

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  try { window.localStorage.clear() } catch { /* ignore */ }
  fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') return { ok: true, json: async () => ({ ok: true }) as unknown, text: async (): Promise<string> => '{"ok":true}' }
    const body = url.includes('/transactions') ? { transactions } : { holdings, prices }
    return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('crypto tab: household view per coin', () => {
  it('shows ONE row per coin with both owners added, sorted by value, and a grand total', async () => {
    render(<CryptoClient />)
    const table = await screen.findByRole('table', { name: 'Holdings by coin' })
    const rows = within(table).getAllByRole('row')
    // header, BTC, SOL, total — the zero-balance KAS is hidden.
    expect(rows).toHaveLength(4)
    expect(within(rows[1]).getByText('BTC')).toBeInTheDocument()
    expect(within(rows[2]).getByText('SOL')).toBeInTheDocument()
    expect(within(rows[2]).getByText('2.07')).toBeInTheDocument()
    expect(within(rows[2]).getByText('B 1.71 · L 0.36')).toBeInTheDocument()
    expect(within(rows[3]).getByText(/Total/)).toBeInTheDocument()
    expect(within(table).queryByText('KAS')).not.toBeInTheDocument()
  })

  it('a price outage never reads as a −100% loss', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const body = url.includes('/transactions') ? { transactions } : { holdings, prices: null }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    await screen.findByRole('table', { name: 'Holdings by coin' })
    expect(screen.queryByText(/−100\.0%|-100\.0%/)).not.toBeInTheDocument()
    expect(screen.getByText(/BTC, SOL unpriced/)).toBeInTheDocument()
    expect(screen.getAllByText('no price').length).toBeGreaterThan(0)
    // Value, owner cards and totals read "—", never a $0 that looks like a total loss.
    expect(screen.queryByText(/^\$0(\.00)?$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/US\$0/)).not.toBeInTheDocument()
    expect(screen.queryByText(/0% of the household/)).not.toBeInTheDocument()
  })

  it('a partial outage names the coins the total leaves out', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const body = url.includes('/transactions') ? { transactions } : { holdings, prices: { BTC: prices.BTC } }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    await screen.findByRole('table', { name: 'Holdings by coin' })
    expect(screen.getAllByText(/excl\. SOL/).length).toBeGreaterThan(0)
  })

  it('folds the per-holding cards away in the household view (the coin table already lists them)', async () => {
    render(<CryptoClient />)
    await screen.findByRole('table', { name: 'Holdings by coin' })
    expect(screen.queryByRole('button', { name: 'Edit BTC position' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Details per person \(3\)/ }))
    expect(screen.getByRole('button', { name: 'Edit BTC position' })).toBeInTheDocument()
  })

  it('an empty holding does not count as an owner when removing or logging', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const extra = [{ ...base, id: 'btc-l', symbol: 'BTC', name: 'Bitcoin', owner: 'Laura', quantity: 0, avg_cost_basis_usd: null }]
      const body = url.includes('/transactions') ? { transactions } : { holdings: [...holdings, ...extra], prices }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    const table = await screen.findByRole('table', { name: 'Holdings by coin' })
    fireEvent.click(within(table).getByRole('button', { name: 'Remove BTC' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByRole('radio', { name: /Only Laura’s/ })).not.toBeInTheDocument()
    expect(within(dialog).getByText(/for Bernardo/)).toBeInTheDocument()
  })

  it("the trash on an emptied owner's card removes only that holding, never the other owner's coins", async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (options?.method === 'DELETE') return { ok: true, json: async () => ({ ok: true }) as unknown, text: async (): Promise<string> => '{"ok":true}' }
      const extra = [{ ...base, id: 'btc-l', symbol: 'BTC', name: 'Bitcoin', owner: 'Laura', quantity: 0, avg_cost_basis_usd: null }]
      const body = url.includes('/transactions') ? { transactions } : { holdings: [...holdings, ...extra], prices }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    await screen.findByRole('table', { name: 'Holdings by coin' })
    const toggle = screen.getByRole('checkbox', { name: /Show empty coins/ })
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /Details per person/ }))
    const trash = screen.getAllByRole('button', { name: 'Delete BTC position' })
    // Bernardo's live BTC card comes first, Laura's emptied one second.
    fireEvent.click(trash[trash.length - 1])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: /Only Laura’s/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).getByText(/Laura’s emptied BTC holding/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(true))
    const [, del] = fetchMock.mock.calls.find(([, o]) => o?.method === 'DELETE')!
    expect(JSON.parse(String(del.body))).toEqual({ ids: ['btc-l'] })
  })

  it('the whole-coin removal names an emptied holding it takes along', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const extra = [{ ...base, id: 'btc-l', symbol: 'BTC', name: 'Bitcoin', owner: 'Laura', quantity: 0, avg_cost_basis_usd: null }]
      const body = url.includes('/transactions') ? { transactions } : { holdings: [...holdings, ...extra], prices }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    const table = await screen.findByRole('table', { name: 'Holdings by coin' })
    fireEvent.click(within(table).getByRole('button', { name: 'Remove BTC' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Bitcoin \(BTC\) for Bernardo, plus Laura’s emptied BTC holding/)).toBeInTheDocument()
  })

  it('keeps the coin order during a price outage (cost breaks the tie, not raw quantity)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const extra = [{ ...base, id: 'kas-b', symbol: 'KAS', name: 'Kaspa', owner: 'Bernardo', quantity: 18_000, avg_cost_basis_usd: 1 }]
      const body = url.includes('/transactions') ? { transactions } : { holdings: [...holdings, ...extra], prices: null }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    const table = await screen.findByRole('table', { name: 'Holdings by coin' })
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1]).getByText('BTC')).toBeInTheDocument()
    expect(within(rows[2]).getByText('KAS')).toBeInTheDocument()
    expect(within(rows[3]).getByText('SOL')).toBeInTheDocument()
    expect(screen.getByText(/values show once prices load/)).toBeInTheDocument()
  })

  it('can show zero-balance coins', async () => {
    render(<CryptoClient />)
    const toggle = await screen.findByRole('checkbox', { name: /Show empty coins \(1\)/ })
    fireEvent.click(toggle)
    expect(within(screen.getByRole('table', { name: 'Holdings by coin' })).getByText('KAS')).toBeInTheDocument()
  })

  it("removes one owner's holding after a confirm that says the transactions go too", async () => {
    render(<CryptoClient />)
    const table = await screen.findByRole('table', { name: 'Holdings by coin' })
    fireEvent.click(within(table).getByRole('button', { name: 'Remove SOL' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/1 logged transaction|2 logged transactions/)).toBeInTheDocument()
    expect(within(dialog).getByText(/can’t be undone/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('radio', { name: /Only Laura’s/ }))
    expect(within(dialog).getByText('1 logged transaction')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(true))
    const [, del] = fetchMock.mock.calls.find(([, o]) => o?.method === 'DELETE')!
    expect(JSON.parse(String(del.body))).toEqual({ ids: ['sol-l'] })
  })

  it('removes the whole coin for both owners by default', async () => {
    render(<CryptoClient />)
    const table = await screen.findByRole('table', { name: 'Holdings by coin' })
    fireEvent.click(within(table).getByRole('button', { name: 'Remove SOL' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('radio', { name: /Both — the whole coin/ })).toHaveAttribute('aria-checked', 'true')
    expect(within(dialog).getByText('2 logged transactions')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(true))
    const [, del] = fetchMock.mock.calls.find(([, o]) => o?.method === 'DELETE')!
    expect(JSON.parse(String(del.body))).toEqual({ ids: ['sol-b', 'sol-l'] })
  })

  it('adds any coin: search, pick, choose the owner, log the first buy', async () => {
    const posts: Array<{ url: string; body: Record<string, unknown> }> = []
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.startsWith('/api/finance/crypto/search')) {
        const body = { coins: [{ id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', thumb: null, market_cap_rank: 9 }] }
        return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
      }
      if (options?.method === 'POST') {
        const body = JSON.parse(String(options.body))
        posts.push({ url, body })
        const answer = url.endsWith('/transactions') ? { id: 'tx' } : { id: 'doge-l' }
        return { ok: true, status: 201, json: async () => answer, text: async () => JSON.stringify(answer) }
      }
      const body = url.includes('/transactions') ? { transactions } : { holdings, prices }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    fireEvent.click(await screen.findByRole('button', { name: /Add coin/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Search coins'), { target: { value: 'doge' } })
    fireEvent.click(await within(dialog).findByRole('button', { name: /Dogecoin/ }, { timeout: 2000 }))
    fireEvent.click(within(dialog).getByRole('radio', { name: /Laura/ }))
    fireEvent.change(within(dialog).getByLabelText('Quantity *'), { target: { value: '500' } })
    fireEvent.change(within(dialog).getByLabelText('Price per coin *'), { target: { value: '3.5' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add & log buy' }))

    await waitFor(() => expect(posts).toHaveLength(2))
    expect(posts[0]).toEqual({ url: '/api/finance/crypto', body: { symbol: 'DOGE', name: 'Dogecoin', coingecko_id: 'dogecoin', owner: 'Laura', quantity: 0 } })
    expect(posts[1].url).toBe('/api/finance/crypto/transactions')
    expect(posts[1].body).toMatchObject({ holding_id: 'doge-l', type: 'buy', quantity: 500, price_per_coin_mxn: 3.5 })
  })

  it('shows the server’s "database update pending" message when the coin can’t be added yet', async () => {
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.startsWith('/api/finance/crypto/search')) {
        const body = { coins: [{ id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', thumb: null, market_cap_rank: 9 }] }
        return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
      }
      if (options?.method === 'POST') {
        const body = { error: 'Database update pending: apply the migration', code: 'migration_pending' }
        return { ok: false, status: 409, json: async () => body, text: async () => JSON.stringify(body) }
      }
      const body = url.includes('/transactions') ? { transactions } : { holdings, prices }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    fireEvent.click(await screen.findByRole('button', { name: /Add coin/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Search coins'), { target: { value: 'doge' } })
    fireEvent.click(await within(dialog).findByRole('button', { name: /Dogecoin/ }, { timeout: 2000 }))
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Enter a balance' }))
    fireEvent.change(within(dialog).getByLabelText('Quantity *'), { target: { value: '500' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add coin' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Database update pending')
  })

  it("an owner-filtered view only ever removes that owner's coins", async () => {
    render(<CryptoClient ownerFilter="Laura" />)
    const table = await screen.findByRole('table', { name: 'Holdings by coin' })
    fireEvent.click(within(table).getByRole('button', { name: 'Remove SOL' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(true))
    const [, del] = fetchMock.mock.calls.find(([, o]) => o?.method === 'DELETE')!
    expect(JSON.parse(String(del.body))).toEqual({ ids: ['sol-l'] })
  })

  it('does not show the built-in coin’s price for a different coin sharing its ticker', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/finance/crypto/search')) {
        const body = { coins: [{ id: 'litentry', symbol: 'LIT', name: 'Litentry', thumb: null, market_cap_rank: 900 }] }
        return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
      }
      const body = url.includes('/transactions') ? { transactions } : { holdings, prices: { ...prices, LIT: { usd: 2, mxn: 36, change24h: 0 } } }
      return { ok: true, json: async (): Promise<unknown> => body, text: async (): Promise<string> => JSON.stringify(body) }
    })
    render(<CryptoClient />)
    fireEvent.click(await screen.findByRole('button', { name: /Add coin/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Search coins'), { target: { value: 'litentry' } })
    fireEvent.click(await within(dialog).findByRole('button', { name: /Litentry/ }, { timeout: 2000 }))
    expect(within(dialog).queryByText(/now/)).not.toBeInTheDocument()
  })
})
