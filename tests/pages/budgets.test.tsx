/**
 * Unit Tests — Budgets page (/finance/budgets)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { SEED_CATEGORIES, SEED_BUDGETS } from '@/lib/seed-finance'
import { monthKey } from '@/lib/finance-utils'

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

const THIS_MONTH = monthKey(new Date())
const CURRENT_MONTH_BUDGETS = SEED_BUDGETS.map(b => ({ ...b, month: `${THIS_MONTH}-01` }))

const tx = (id: string, category_id: string, amount: number, day = '02', extra: Record<string, unknown> = {}) => ({
  id, type: 'expense', amount_mxn: amount, category_id, transaction_date: `${THIS_MONTH}-${day}`, coverage_start: null, coverage_end: null, ...extra,
})

const TRANSACTIONS = [
  tx('t1', 'cat-rent', 15000),
  tx('t2', 'cat-groc', 12000), tx('t3', 'cat-groc', 8000),
  tx('t4', 'cat-dining', 100),
  tx('t5', 'cat-gifts', 1200),
  tx('t6', 'cat-other', 24000, '03', { coverage_start: `${THIS_MONTH}-01`, coverage_end: '2099-12-31' }),
]

function makeChain(res: any, calls: string[][]) {
  const chain: any = {
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(res).then(onFulfilled, onRejected),
  }
  for (const m of ['select', 'order', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'ilike', 'limit', 'single', 'range', 'is']) {
    chain[m] = vi.fn((...args: unknown[]) => { calls.push([m, String(args[0])]); return chain })
  }
  return chain
}

let txCalls: string[][] = []

function setupSupabaseMock(transactions: any[] = TRANSACTIONS) {
  txCalls = []
  const tables: Record<string, any> = {
    finance_categories: { data: SEED_CATEGORIES, error: null },
    finance_transactions: { data: transactions, error: null },
    finance_budgets: { data: CURRENT_MONTH_BUDGETS, error: null },
  }
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const res = tables[table] || { data: [], error: null }
    return {
      select: vi.fn(() => makeChain(res, table === 'finance_transactions' ? txCalls : [])),
      insert: vi.fn().mockReturnValue(Promise.resolve({ data: [{}], error: null })),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }),
    }
  }) as unknown as typeof supabase.from)
}

async function renderBudgets() {
  const Comp = (await import('@/components/finance/budgets-client')).default
  const utils = render(<Comp />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Budgets' })).toBeInTheDocument())
  return utils
}

const card = (name: string) => screen.getByRole('link', { name: new RegExp(`^${name}:`) }).closest('li')!

describe('Budgets page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
  })
  afterEach(() => { window.history.replaceState(null, '', '/') })

  it('renders the header and month navigation', async () => {
    await renderBudgets()
    expect(screen.getByText('Monthly spending limits by category')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeInTheDocument()
  })

  it('compares budgeted spend with budgets and lists unbudgeted spend separately', async () => {
    await renderBudgets()
    expect(screen.getByText('Spent in budgeted categories')).toBeInTheDocument()
    // 15,000 rent + 20,000 groceries + 100 dining; the Gifts and Other rows are outside budgets.
    expect(screen.getByText('$35,100')).toBeInTheDocument()
    const outside = screen.getByRole('list', { name: 'Categories without a budget' })
    expect(within(outside).getByRole('link', { name: /Gifts/ })).toHaveAttribute('href', `/finance/transactions?category=cat-gifts&month=${THIS_MONTH}`)
    // The 24k Other row is spread to 2099, so only a sliver lands in this month.
    expect(within(outside).getByRole('link', { name: /Other/ })).toBeInTheDocument()
  })

  it('colours by the shared budget tone: over is red, fixed at 100% is a neutral "Paid"', async () => {
    await renderBudgets()
    expect(within(card('Groceries')).getByRole('progressbar')).toHaveAttribute('data-tone', 'negative')
    expect(within(card('Groceries')).getByText('$2,000 over')).toBeInTheDocument()
    expect(within(card('Rent/Mortgage')).getByRole('progressbar')).toHaveAttribute('data-tone', 'neutral')
    expect(within(card('Rent/Mortgage')).getAllByText('Paid').length).toBeGreaterThan(0)
    expect(within(card('Dining Out')).getByRole('progressbar')).toHaveAttribute('data-tone', 'positive')
  })

  it('shows a pace marker in the current month', async () => {
    await renderBudgets()
    expect(within(card('Dining Out')).getByTestId('progress-marker')).toBeInTheDocument()
  })

  it('links each card to its transactions for the month and labels actions in context', async () => {
    await renderBudgets()
    expect(screen.getByRole('link', { name: /^Groceries:/ })).toHaveAttribute('href', `/finance/transactions?category=cat-groc&month=${THIS_MONTH}`)
    expect(screen.getByRole('button', { name: 'Edit Groceries budget' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Groceries budget' })).toBeInTheDocument()
  })

  it('reads only the lookback window with a stable order, and refetches on month change', async () => {
    await renderBudgets()
    expect(txCalls).toContainEqual(['order', 'id'])
    expect(txCalls).toContainEqual(['gte', 'transaction_date'])
    expect(txCalls).toContainEqual(['gte', 'coverage_end'])
    const before = vi.mocked(supabase.from).mock.calls.filter(([t]) => t === 'finance_transactions').length
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(vi.mocked(supabase.from).mock.calls.filter(([t]) => t === 'finance_transactions').length).toBeGreaterThan(before))
    expect(window.location.search).toMatch(/month=\d{4}-\d{2}/)
  })

  it('opens on ?month=YYYY-MM', async () => {
    window.history.replaceState(null, '', '/finance/budgets?month=2026-02')
    await renderBudgets()
    expect(screen.getByText('February 2026')).toBeInTheDocument()
  })
})

describe('budget spend helpers', () => {
  const bill = (id: string, date: string, amount: number) => ({ id, type: 'expense' as const, amount_mxn: amount, category_id: 'cat-elec', transaction_date: date, coverage_start: null, coverage_end: null })

  it('normalises a bimonthly Electricity bill to one bill per two months, ending today', async () => {
    const { categoryMonthSpend, budgetAsOfKey } = await import('@/components/finance/budgets-client')
    // Bills every other month; the October 1 fetch used to sweep Aug–Oct (three bills) into a two-month window.
    const txs = [bill('e1', '2026-06-20', 3000), bill('e2', '2026-08-20', 3100), bill('e3', '2026-10-20', 2968)]
    expect(budgetAsOfKey('2026-10', '2026-10-28')).toBe('2026-10-28')
    expect(budgetAsOfKey('2026-09', '2026-10-28')).toBe('2026-09-30')
    expect(categoryMonthSpend(txs, 'cat-elec', 'bimonthly', '2026-10', '2026-10-28')).toBe(2968 / 2)
    expect(categoryMonthSpend(txs, 'cat-elec', 'bimonthly', '2026-09', '2026-10-28')).toBe(3100 / 2)
    // Window is (asOf − 2 months, asOf]: a bill on the lower edge belongs to the previous cycle.
    expect(categoryMonthSpend([bill('e4', '2026-08-28', 3000)], 'cat-elec', 'bimonthly', '2026-10', '2026-10-28')).toBe(0)
    // Future-dated rows in the month don't count yet.
    expect(categoryMonthSpend([bill('e5', '2026-10-30', 3000)], 'cat-elec', 'bimonthly', '2026-10', '2026-10-28')).toBe(0)
  })

  it('reads budgets for the selected month only', async () => {
    setupSupabaseMock()
    const budgetCalls: string[][] = []
    const original = vi.mocked(supabase.from).getMockImplementation()!
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const api = (original as any)(table)
      if (table !== 'finance_budgets') return api
      return { ...api, select: vi.fn(() => makeChain({ data: CURRENT_MONTH_BUDGETS, error: null }, budgetCalls)) }
    }) as unknown as typeof supabase.from)
    await renderBudgets()
    expect(budgetCalls).toContainEqual(['gte', 'month'])
    expect(budgetCalls).toContainEqual(['lte', 'month'])
  })

  it('shows an error instead of "No budgets" when a read fails', async () => {
    setupSupabaseMock()
    const original = vi.mocked(supabase.from).getMockImplementation()!
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const api = (original as any)(table)
      if (table !== 'finance_budgets') return api
      return { ...api, select: vi.fn(() => makeChain({ data: null, error: { message: 'boom' } }, [])) }
    }) as unknown as typeof supabase.from)
    await renderBudgets()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this month')
    expect(screen.queryByText('No budgets for this month')).not.toBeInTheDocument()
  })
})
