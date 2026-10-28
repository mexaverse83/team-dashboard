/**
 * Unit Tests — Reports page (/finance/reports)
 * Mona v2 WS1: period picker (default last full month), token charts, strict ledger reads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { SEED_CATEGORIES, SEED_TRANSACTIONS, SEED_BUDGETS, SEED_RECURRING } from '@/lib/seed-finance'
import { monthKey } from '@/lib/finance-utils'

// Mock recharts
vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: any) => <>{children}</>,
  Cell: () => null,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Tooltip: () => null,
  Legend: () => null,
  ReferenceLine: () => null,
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

// Mock Modal
vi.mock('@/components/ui/modal', () => ({
  Modal: ({ children, footer, open, title }: any) => open ? <div data-testid="modal"><h2>{title}</h2>{children}{footer}</div> : null,
}))

// Mock pdf-parser
vi.mock('@/lib/pdf-parser', () => ({
  parseBBVAPdf: vi.fn().mockResolvedValue([]),
  detectBankFormat: vi.fn().mockReturnValue('unknown'),
}))

// Mock framer-motion (for budget bars / savings rate / svg gauges)
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    circle: (props: any) => <circle />,
  },
  AnimatePresence: ({ children }: any) => children,
}))

// Components call fetch() against /api/finance/* — return a graceful "not ok"
// so widgets that depend on those endpoints render their fallback/null states.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
  ))
})

// Pages filter budgets/transactions by the currently displayed month, so pin
// the seed budgets to this month (computed the same way the components do —
// monthKey uses local time, not toISOString/UTC).
const THIS_MONTH = monthKey(new Date())
const CURRENT_MONTH_BUDGETS = SEED_BUDGETS.map(b => ({ ...b, month: `${THIS_MONTH}-01` }))

// Generic chainable query builder: every filter/modifier returns the chain,
// awaiting it resolves the table's mock result.
function makeChain(res: any) {
  const chain: any = {
    then: (onFulfilled: any, onRejected: any) => Promise.resolve(res).then(onFulfilled, onRejected),
  }
  for (const m of ['select', 'order', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'ilike', 'limit', 'single', 'range', 'is']) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

function setupSupabaseMock(overrides: Record<string, any> = {}) {
  const defaults: Record<string, any> = {
    finance_categories: { data: SEED_CATEGORIES, error: null },
    finance_transactions: { data: SEED_TRANSACTIONS, error: null },
    finance_budgets: { data: CURRENT_MONTH_BUDGETS, error: null },
    finance_recurring: { data: SEED_RECURRING, error: null },
  }
  const merged = { ...defaults, ...overrides }

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const res = merged[table] || { data: [], error: null }
    return {
      select: vi.fn(() => makeChain(res)),
      insert: vi.fn().mockReturnValue(Promise.resolve({ data: [{}], error: null })),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }),
    } as any
  })
}

// ==========================================
// REPORTS
// ==========================================
// Seed data covers Jan–Feb 2026; pin "today" to mid-March so the default
// period (last full month) is February 2026.
const sumSeed = (type: 'income' | 'expense', month: string) =>
  SEED_TRANSACTIONS.filter(t => t.type === type && t.transaction_date.startsWith(month)).reduce((s, t) => s + t.amount_mxn, 0)
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

describe('Reports Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 2, 15, 12))
    setupSupabaseMock()
  })
  afterEach(() => { vi.useRealTimers() })

  const load = async () => (await import('@/components/finance/reports-client')).default

  it('renders page header', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Reports')).toBeInTheDocument())
    expect(screen.getByText('Financial trends and analytics')).toBeInTheDocument()
  })

  it('defaults to the last full month and prints the period', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByTestId('report-period')).toHaveTextContent('February 2026'))
    expect(screen.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByText(money(sumSeed('expense', '2026-02'))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(money(sumSeed('income', '2026-02'))).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('vs Jan').length).toBe(2)
  })

  it('renders 4 KPI stats with neutral values (colour only on deltas)', async () => {
    const Comp = await load()
    const { container } = render(<Comp />)
    await waitFor(() => {
      for (const label of ['Income', 'Spending', 'Net saved', 'Savings rate']) expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1)
    })
    expect(container.querySelector('.text-emerald-600, .text-rose-600')).toBeNull()
    container.querySelectorAll('.num-metric').forEach(el => expect(el.className).toContain('text-fg'))
  })

  it('switches to All time and to a previous month', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByTestId('report-period')).toHaveTextContent('February 2026'))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByTestId('report-period')).toHaveTextContent('January 2026')
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'All time' }))
    expect(screen.getByTestId('report-period')).toHaveTextContent('All time · since Jan 2026')
    const all = sumSeed('expense', '2026-01') + sumSeed('expense', '2026-02')
    expect(screen.getAllByText(money(all)).length).toBeGreaterThanOrEqual(1)
  })

  it('renders Income vs Spending line chart with a legend', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Income vs Spending')).toBeInTheDocument()
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Income').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Expenses').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Category Trends area chart with a category legend', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Category Trends')).toBeInTheDocument()
      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })
    expect(screen.getAllByText('Groceries').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Top Merchants for the period with transaction counts', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Top Merchants')).toBeInTheDocument())
    const card = screen.getByText('Top Merchants').closest('[data-variant]') as HTMLElement
    expect(within(card).getAllByText(/Walmart|HEB/).length).toBeGreaterThanOrEqual(1)
    expect(within(card).getAllByText(/txns/).length).toBeGreaterThanOrEqual(1)
  })

  it('reads the ledger strictly with an id tiebreaker and narrow columns', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Top Merchants')).toBeInTheDocument())
    const txCall = vi.mocked(supabase.from).mock.results.find((_, i) => vi.mocked(supabase.from).mock.calls[i][0] === 'finance_transactions')
    const select = (txCall!.value as any).select
    expect(select).toHaveBeenCalledWith('id,type,amount_mxn,category_id,merchant,transaction_date,owner')
    const chain = select.mock.results[0].value
    expect(chain.order).toHaveBeenCalledWith('id', { ascending: true })
  })

  it('shows an error state instead of $0 totals when the ledger read fails', async () => {
    setupSupabaseMock({ finance_transactions: { data: null, error: { message: 'boom' } } })
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByText("Couldn't load your transactions")).toBeInTheDocument())
    expect(screen.queryByText('Net saved')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
