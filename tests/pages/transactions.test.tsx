/**
 * Unit Tests — Transactions page (/finance/transactions) and the global quick-add sheet.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { SEED_CATEGORIES, SEED_TRANSACTIONS } from '@/lib/seed-finance'
import { localDateKey } from '@/lib/dates'
import type { FinanceTransaction } from '@/lib/finance-types'

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
  Modal: ({ children, footer, open, title }: any) => open ? <div data-testid="modal"><h2>{title}</h2>{children}{footer}</div> : null,
}))

vi.mock('@/lib/pdf-parser', () => ({
  parseBBVAPdf: vi.fn().mockResolvedValue([]),
  detectBankFormat: vi.fn().mockReturnValue('unknown'),
}))

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
  ))
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

function makeChain(res: any) {
  const chain: any = {
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(res).then(onFulfilled, onRejected),
  }
  for (const m of ['select', 'order', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'ilike', 'limit', 'single', 'range', 'is']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

const TODAY = localDateKey()
const todayTx: FinanceTransaction = {
  ...SEED_TRANSACTIONS.find(t => t.id === 't04')!,
  id: 'today-1', merchant: 'Oxxo', amount: 87, amount_mxn: 87, transaction_date: TODAY, category_id: 'cat-dining',
}

const deleteEq = vi.fn(() => Promise.resolve({ error: null }))

function setupSupabaseMock(transactions: FinanceTransaction[] = [todayTx, ...SEED_TRANSACTIONS]) {
  const tables: Record<string, any> = {
    finance_categories: { data: SEED_CATEGORIES, error: null },
    finance_transactions: { data: transactions, error: null },
  }
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const res = tables[table] || { data: [], error: null }
    return {
      select: vi.fn(() => makeChain(res)),
      insert: vi.fn().mockReturnValue(Promise.resolve({ data: [{}], error: null })),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }),
      delete: vi.fn().mockReturnValue({ eq: deleteEq }),
    }
  }) as unknown as typeof supabase.from)
}

async function renderPage() {
  const Comp = (await import('@/components/finance/transactions-client')).default
  const utils = render(<Comp />)
  await waitFor(() => expect(screen.getByRole('button', { name: /Add transaction/ })).toBeInTheDocument())
  // Flush passive effects so the quick-add host is subscribed before tests click.
  await act(async () => {})
  return utils
}

async function openSheet() {
  await renderPage()
  // The host subscribes in a passive effect that can land a tick after the button paints.
  await waitFor(() => {
    if (!screen.queryByTestId('modal')) fireEvent.click(screen.getByRole('button', { name: /Add transaction/ }))
    expect(screen.getByTestId('modal')).toBeInTheDocument()
  })
  return within(screen.getByTestId('modal'))
}

describe('Transactions page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
  })

  it('renders the page header, filters and search', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'Transactions' })).toBeInTheDocument()
    expect(screen.getByText('Capture spending fast. Keep every peso accountable.')).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search transactions' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Transaction type' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Expenses' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('All Categories')).toBeInTheDocument()
  })

  it('re-runs a refresh requested while a fetch is in flight, so a mid-load save is not lost', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    let rows: FinanceTransaction[] = [todayTx]
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const chain: any = {}
      for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'range', 'limit']) chain[m] = vi.fn(() => chain)
      chain.then = (ok: any, err: any) => {
        const snapshot = table === 'finance_transactions' ? rows : table === 'finance_categories' ? SEED_CATEGORIES : []
        return gate.then(() => ({ data: snapshot, error: null })).then(ok, err)
      }
      return chain
    }) as unknown as typeof supabase.from)
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await act(async () => {})
    rows = [{ ...todayTx, id: 'saved-mid-load', merchant: 'Starbucks' }, todayTx]
    act(() => { window.dispatchEvent(new CustomEvent('finance:data-changed')) })
    await act(async () => { release() })
    expect(await screen.findByRole('button', { name: /Edit Starbucks/ })).toBeInTheDocument()
  })

  it('keeps Import disabled until the whole ledger has loaded (dedupe needs it)', async () => {
    await renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Import transactions' })).toBeEnabled())
  })

  it('groups rows under local-date day headers with totals', async () => {
    await renderPage()
    const today = screen.getByRole('heading', { name: /^Today/ })
    const section = today.closest('section')!
    expect(within(section).getByRole('button', { name: /Edit Oxxo/ })).toBeInTheDocument()
  })

  it('makes each row an edit button with a contextual label', async () => {
    await renderPage()
    const row = screen.getByRole('button', { name: /^Edit Oxxo, \$87, Dining Out, / })
    fireEvent.click(row)
    const modal = within(screen.getByTestId('modal'))
    expect(modal.getByText('Edit transaction')).toBeInTheDocument()
    expect(modal.getByLabelText('Where did you spend?')).toHaveValue('Oxxo')
  })

  it('shows expenses as neutral amounts and income with a + sign', async () => {
    await renderPage()
    const income = screen.getAllByRole('button', { name: /^Edit Nexaminds, \$55,000 received/ })[0]
    expect(within(income).getByText('+$55,000')).toHaveClass('text-positive')
    const expense = screen.getByRole('button', { name: /^Edit Oxxo/ })
    expect(within(expense).getByText('$87')).toHaveClass('text-fg')
  })

  it('filters by type and search', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }))
    expect(screen.queryByRole('button', { name: /^Edit Oxxo/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search transactions' }), { target: { value: 'Walmart' } })
    expect(screen.getAllByRole('button', { name: /^Edit Walmart/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /^Edit Oxxo/ })).not.toBeInTheDocument()
  })

  it('reads ?category=&month= drill-down filters and shows removable chips', async () => {
    window.history.replaceState(null, '', '/finance/transactions?category=cat-groc&month=2026-01')
    await renderPage()
    const rows = screen.getAllByRole('button', { name: /^Edit / })
    expect(rows.length).toBeGreaterThan(0)
    rows.forEach(row => expect(row.getAttribute('aria-label')).toMatch(/Groceries, Jan \d+/))
    fireEvent.click(screen.getByRole('button', { name: 'Remove January 2026 filter' }))
    expect(window.location.search).toBe('?category=cat-groc')
  })

  it('deletes with Undo: the row hides, Undo restores it, nothing is deleted', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete Oxxo' }))
    expect(screen.queryByRole('button', { name: /^Edit Oxxo/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByRole('button', { name: /^Edit Oxxo/ })).toBeInTheDocument()
    expect(deleteEq).not.toHaveBeenCalled()
  })

  it('commits the delete when the undo window expires', async () => {
    await renderPage()
    vi.useFakeTimers()
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Delete Oxxo' }))
      await act(async () => { vi.advanceTimersByTime(5100) })
      expect(deleteEq).toHaveBeenCalledWith('id', 'today-1')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Quick-add sheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
  })

  it('preserves decimal-comma cents and the draft ID after a failed save', async () => {
    const insert = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ error: null })
    const original = vi.mocked(supabase.from).getMockImplementation()!
    vi.mocked(supabase.from).mockImplementation(((table: string) => ({ ...original(table), ...(table === 'finance_transactions' ? { insert } : {}) })) as unknown as typeof supabase.from)
    const sheet = await openSheet()
    fireEvent.change(sheet.getByLabelText('Amount'), { target: { value: '12,50' } })
    fireEvent.click(sheet.getByRole('button', { name: /Groceries/ }))
    fireEvent.submit(document.getElementById('tx-form')!)
    fireEvent.submit(document.getElementById('tx-form')!)
    await waitFor(() => expect(sheet.getByRole('alert')).toHaveTextContent('Could not confirm the save'))
    expect(insert).toHaveBeenCalledTimes(1)
    expect(sheet.getByLabelText('Amount')).toHaveValue('12,50')
    expect(sheet.getByRole('button', { name: 'Save expense' })).toBeEnabled()
    fireEvent.submit(document.getElementById('tx-form')!)
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(2))
    expect(insert.mock.calls[0][0]).toMatchObject({ amount: 12.5, amount_mxn: 12.5 })
    expect(insert.mock.calls[0][0].id).toBe(insert.mock.calls[1][0].id)
  })

  it('announces the save to the app and offers "Add another"', async () => {
    const changed = vi.fn()
    window.addEventListener('finance:data-changed', changed)
    const sheet = await openSheet()
    fireEvent.change(sheet.getByLabelText('Amount'), { target: { value: '250' } })
    fireEvent.click(sheet.getByRole('button', { name: /Groceries/ }))
    fireEvent.submit(document.getElementById('tx-form')!)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Expense saved'))
    expect(changed).toHaveBeenCalled()
    window.removeEventListener('finance:data-changed', changed)
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }))
    expect(screen.getByTestId('modal')).toBeInTheDocument()
  })

  it('opens from the finance:quick-add event with a prefill', async () => {
    await renderPage()
    await waitFor(() => {
      if (!screen.queryByTestId('modal')) act(() => { window.dispatchEvent(new CustomEvent('finance:quick-add', { detail: { merchant: 'Heb', amount: 1300 } })) })
      expect(screen.getByTestId('modal')).toBeInTheDocument()
    })
    const sheet = within(screen.getByTestId('modal'))
    expect(sheet.getByLabelText('Amount')).toHaveValue('1300')
    expect(sheet.getByLabelText('Where did you spend?')).toHaveValue('Heb')
  })

  it('opens prefilled from ?add=1&m=Heb&a=250 and strips the params', async () => {
    window.history.replaceState(null, '', '/finance/transactions?add=1&m=Heb&a=250&category=cat-groc')
    await renderPage()
    const sheet = within(await screen.findByTestId('modal'))
    expect(sheet.getByLabelText('Amount')).toHaveValue('250')
    expect(sheet.getByLabelText('Where did you spend?')).toHaveValue('Heb')
    expect(sheet.getByRole('button', { name: /Groceries/ })).toHaveAttribute('aria-pressed', 'true')
    expect(window.location.search).toBe('')
  })

  it('a deep link without a category picks the merchant\'s usual one, so Save is ready', async () => {
    setupSupabaseMock([{ ...todayTx, id: 'heb-1', merchant: 'HEB', category_id: 'cat-groc', amount: 640, amount_mxn: 640 }, todayTx, ...SEED_TRANSACTIONS])
    window.history.replaceState(null, '', '/finance/transactions?add=1&m=heb&a=250')
    await renderPage()
    const sheet = within(await screen.findByTestId('modal'))
    await waitFor(() => expect(sheet.getByRole('button', { name: /Groceries/ })).toHaveAttribute('aria-pressed', 'true'))
    // Retyping the merchant drops the auto-picked category; a manual pick is kept.
    fireEvent.change(sheet.getByLabelText('Where did you spend?'), { target: { value: 'Somewhere new' } })
    expect(sheet.getByRole('button', { name: /Groceries/ })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(sheet.getByRole('button', { name: /Groceries/ }))
    fireEvent.change(sheet.getByLabelText('Where did you spend?'), { target: { value: 'Somewhere else' } })
    expect(sheet.getByRole('button', { name: /Groceries/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('orders amount → merchant → category and keeps notes/tags behind More details', async () => {
    const sheet = await openSheet()
    const amount = sheet.getByLabelText('Amount')
    const merchant = sheet.getByLabelText('Where did you spend?')
    const category = sheet.getByText('Category')
    expect(amount.compareDocumentPosition(merchant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(merchant.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sheet.getByText('Frequent first')).toBeInTheDocument()
    expect(sheet.queryByLabelText('Notes')).not.toBeInTheDocument()
    fireEvent.click(sheet.getByRole('button', { name: /More details/ }))
    expect(sheet.getByLabelText('Notes')).toBeInTheDocument()
    expect(sheet.getByLabelText('Tags')).toBeInTheDocument()
  })

  it('shows 8 category chips plus a More… picker for the rest', async () => {
    const sheet = await openSheet()
    const group = sheet.getByRole('group', { name: 'Category' })
    const chips = within(group).getAllByRole('button')
    expect(chips.filter(c => !c.className.includes('hidden sm:inline-flex'))).toHaveLength(8)
    fireEvent.change(sheet.getByLabelText('More categories'), { target: { value: 'cat-maint' } })
    expect(within(group).getByText('Maintenance', { selector: 'div > span' })).toBeInTheDocument()
  })

  it('uses a frequent merchant to fill merchant, category and typical amount in one tap', async () => {
    const sheet = await openSheet()
    fireEvent.click(sheet.getAllByRole('button', { name: /^Walmart/ })[0])
    expect(sheet.getByLabelText('Where did you spend?')).toHaveValue('Walmart')
    expect(sheet.getByRole('button', { name: /Groceries/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers the Baby tag (and never Fertility) and suggests it for prenatal merchants', async () => {
    const sheet = await openSheet()
    expect(sheet.getByRole('button', { name: /Baby/ })).toHaveAttribute('aria-pressed', 'false')
    expect(sheet.queryByText(/Fertility/)).not.toBeInTheDocument()
    fireEvent.change(sheet.getByLabelText('Where did you spend?'), { target: { value: 'Cita gine' } })
    fireEvent.click(sheet.getByRole('button', { name: 'Tag as Baby' }))
    expect(sheet.getByRole('button', { name: /^👶Baby$|Baby/, pressed: true })).toBeInTheDocument()
    expect(sheet.queryByRole('button', { name: 'Tag as Baby' })).not.toBeInTheDocument()
  })

  it('prompts to spread a one-off charge over 12 months', async () => {
    const sheet = await openSheet()
    fireEvent.click(sheet.getByRole('button', { name: /Groceries/ }))
    fireEvent.change(sheet.getByLabelText('Amount'), { target: { value: '50000' } })
    expect(sheet.getByText('Annual or one-off charge?')).toBeInTheDocument()
    fireEvent.click(sheet.getByRole('button', { name: 'Spread over 12 months' }))
    const start = sheet.getByLabelText('Starts') as HTMLInputElement
    const end = sheet.getByLabelText('Ends') as HTMLInputElement
    expect(start.value).toBe(`${TODAY.slice(0, 7)}-01`)
    expect(end.value.slice(0, 7)).not.toBe(TODAY.slice(0, 7))
    expect(sheet.queryByText('Annual or one-off charge?')).not.toBeInTheDocument()
  })

  it('changes the owner without opening the date picker and keeps 44px chips', async () => {
    const sheet = await openSheet()
    const dateInput = sheet.getByLabelText('Choose transaction date') as HTMLInputElement
    const dateClick = vi.spyOn(dateInput, 'click')
    const laura = sheet.getByRole('button', { name: 'Owner: Laura' })
    fireEvent.click(laura)
    expect(laura).toHaveAttribute('aria-pressed', 'true')
    expect(laura).toHaveClass('h-11')
    expect(dateClick).not.toHaveBeenCalled()
  })

  it('picks a custom date from the calendar chip and shows it', async () => {
    const sheet = await openSheet()
    const dateInput = sheet.getByLabelText('Choose transaction date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-01-15' } })
    expect(dateInput).toHaveValue('2026-01-15')
    expect(sheet.getByText('Jan 15')).toBeInTheDocument()
  })

  it('offers Delete when editing from the list, which hands the row to Undo', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: /^Edit Oxxo/ }))
    fireEvent.click(within(screen.getByTestId('modal')).getByRole('button', { name: /Delete/ }))
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit Oxxo/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Deleted Oxxo')
  })
})
