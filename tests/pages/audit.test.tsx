/**
 * Unit Tests — Expense audit (/finance/audit)
 * Mona v2 WS1 rebuild on the shared primitives (PageHeader, Card, Stat, tokens).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { SEED_CATEGORIES, SEED_TRANSACTIONS, SEED_BUDGETS, SEED_RECURRING } from '@/lib/seed-finance'

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
  RadialBarChart: ({ children }: any) => <div data-testid="radial-chart">{children}</div>,
  RadialBar: () => null,
  ReferenceLine: () => null,
}))

// Mock SparklineChart
vi.mock('@/components/ui/sparkline-chart', () => ({
  SparklineChart: () => <div data-testid="sparkline" />,
}))

// Mock Modal
vi.mock('@/components/ui/modal', () => ({
  Modal: ({ children, open, title }: any) => open ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null,
}))

// Mock pdf-parser
vi.mock('@/lib/pdf-parser', () => ({
  parseBBVAPdf: vi.fn().mockResolvedValue([]),
  detectBankFormat: vi.fn().mockReturnValue('unknown'),
}))

// Mock next/navigation (audit-client uses useRouter)
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/finance',
  useSearchParams: () => new URLSearchParams(),
}))

// Real lucide icons render in jsdom; next/link as a plain anchor.
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

// Mock framer-motion
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
// so those code paths resolve and render their fallback states.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
  ))
})

function setupSupabaseMock(overrides: Record<string, any> = {}) {
  const defaults: Record<string, any> = {
    finance_categories: { data: SEED_CATEGORIES, error: null },
    finance_transactions: { data: SEED_TRANSACTIONS, error: null },
    finance_budgets: { data: SEED_BUDGETS, error: null },
    finance_recurring: { data: SEED_RECURRING, error: null },
    finance_income_sources: { data: [
      { id: 'inc1', name: 'Nexaminds Salary', type: 'salary', amount: 55000, currency: 'MXN', frequency: 'monthly', is_active: true, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'inc2', name: 'Freelance', type: 'freelance', amount: 10000, currency: 'MXN', frequency: 'monthly', is_active: true, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ], error: null },
    finance_debts: { data: [
      { id: 'd1', name: 'Credit Card', creditor: 'BBVA', balance: 45000, interest_rate: 36, minimum_payment: 2500, type: 'credit_card', start_date: '2025-06-01', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'd2', name: 'Personal Loan', creditor: 'Nu', balance: 25000, interest_rate: 18, minimum_payment: 1800, type: 'personal_loan', start_date: '2025-03-01', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ], error: null },
    finance_goals: { data: [
      { id: 'g1', name: 'MacBook Pro', target_amount: 50000, current_amount: 15000, target_date: '2026-12-01', is_completed: false, priority: 1, monthly_contribution: 5000, investment_vehicle: 'CETES', milestones_json: [], created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'g2', name: 'Vacation Fund', target_amount: 30000, current_amount: 8000, target_date: '2026-08-01', is_completed: false, priority: 2, monthly_contribution: 3000, investment_vehicle: null, milestones_json: [], created_at: '2026-01-01', updated_at: '2026-01-01' },
    ], error: null },
    finance_emergency_fund: { data: [], error: null },
    finance_debt_payments: { data: [
      { principal_portion: 10000 },
      { principal_portion: 20000 },
    ], error: null },
  }
  const merged = { ...defaults, ...overrides }

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const res = merged[table] || { data: [], error: null }
    const result = Promise.resolve(res)
    return {
      select: vi.fn().mockImplementation(() => {
        // Chainable mock — every method returns itself
        const chain: any = Object.assign(Promise.resolve(res), {})
        const addMethods = (obj: any) => {
          for (const m of ['order', 'eq', 'gte', 'lt', 'lte', 'limit', 'single', 'range']) {
            obj[m] = vi.fn().mockImplementation(() => {
              const next = Object.assign(Promise.resolve(res), {})
              addMethods(next)
              return next
            })
          }
          return obj
        }
        return addMethods(chain)
      }),
      insert: vi.fn().mockReturnValue(Promise.resolve({ data: [{}], error: null })),
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(Promise.resolve({ error: null })) }),
    } as any
  })
}
// ==========================================
// EXPENSE AUDIT
// ==========================================
describe('Expense Audit', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })
  afterEach(() => { vi.useRealTimers() })

  const load = async () => (await import('@/components/finance/audit-client'))

  it('renders page header', async () => {
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Expense Audit')).toBeInTheDocument()
    })
  })

  it('renders Spending Heatmap section', async () => {
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Spending Heatmap')).toBeInTheDocument()
    })
  })

  it('renders Category Scorecards section', async () => {
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Category Scorecards')).toBeInTheDocument()
    })
  })

  it('renders Money Leaks section', async () => {
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Money Leaks/)).toBeInTheDocument()
    })
  })

  it('renders Largest Expenses section', async () => {
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Largest Expenses/)).toBeInTheDocument()
    })
  })

  it('renders Most Frequent Purchases section', async () => {
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Most Frequent/)).toBeInTheDocument()
    })
  })

  it('renders Merchant Concentration section', async () => {
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Merchant Concentration/)).toBeInTheDocument()
    })
  })

  it('section headers use icons, not emoji', async () => {
    const Comp = (await load()).default
    const { container } = render(<Comp />)
    await waitFor(() => expect(screen.getByText(/Merchant Concentration/)).toBeInTheDocument())
    const headings = Array.from(container.querySelectorAll('h1, h2, h3')).map(h => h.textContent || '')
    expect(headings.join(' ')).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('heatmap is a weekday × week table with a Less → More legend', async () => {
    const Comp = (await load()).default
    const { container } = render(<Comp />)
    await waitFor(() => expect(screen.getByRole('table', { name: /Spending by day/ })).toBeInTheDocument())
    expect(screen.queryByRole('grid')).toBeNull()
    expect(within(screen.getByRole('table', { name: /Spending by day/ })).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(container.querySelectorAll('[data-date]').length).toBeGreaterThanOrEqual(28)
    expect(screen.getByText('Less')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it("places '2026-10-28' in the Wednesday column (local date, not UTC)", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 20))
    setupSupabaseMock({
      finance_transactions: { data: [{ ...SEED_TRANSACTIONS[3], id: 'oct28', transaction_date: '2026-10-28', amount_mxn: 1234 }], error: null },
    })
    const Comp = (await load()).default
    const { container } = render(<Comp />)
    await waitFor(() => expect(container.querySelector('[data-date="2026-10-28"]')).not.toBeNull())
    const cell = container.querySelector('[data-date="2026-10-28"]') as HTMLElement
    expect(cell.dataset.weekday).toBe('Wed')
    expect(cell.getAttribute('aria-label')).toBe('Wed Oct 28: $1,234')
    // Oct 1 2026 is a Thursday: first row has three leading blanks.
    expect((container.querySelector('[data-date="2026-10-01"]') as HTMLElement).dataset.weekday).toBe('Thu')
  })

  it('buildSpendingHeatmap sums per local day and normalises intensity', async () => {
    const { buildSpendingHeatmap } = await load()
    const { grid, byWeekday, max } = buildSpendingHeatmap('2026-10', [
      { transaction_date: '2026-10-28', amount_mxn: 300 },
      { transaction_date: '2026-10-28', amount_mxn: 100 },
      { transaction_date: '2026-10-31', amount_mxn: 200 },
    ], '2026-10-31')
    expect(max).toBe(400)
    const cells = grid.flat().filter(Boolean)
    expect(cells).toHaveLength(31)
    const oct28 = cells.find(c => c!.date === '2026-10-28')!
    expect(oct28).toMatchObject({ weekday: 'Wed', amount: 400, count: 2, intensity: 1 })
    expect(cells.find(c => c!.date === '2026-10-31')!.weekday).toBe('Sat')
    expect(byWeekday.find(d => d.label === 'Wed')!.amount).toBe(400)
  })

  it('one huge day does not flatten the rest of the heatmap; future days are marked', async () => {
    const { buildSpendingHeatmap } = await load()
    const rows = [
      { transaction_date: '2026-10-01', amount_mxn: 75000 }, // rent + WEST
      ...Array.from({ length: 20 }, (_, i) => ({ transaction_date: `2026-10-${String(i + 2).padStart(2, '0')}`, amount_mxn: 200 + i * 100 })),
    ]
    const { grid, peak } = buildSpendingHeatmap('2026-10', rows, '2026-10-28')
    const cells = grid.flat().filter(Boolean) as Array<{ date: string; intensity: number; future: boolean }>
    const small = cells.find(c => c.date === '2026-10-02')!.intensity
    const mid = cells.find(c => c.date === '2026-10-21')!.intensity
    expect(cells.find(c => c.date === '2026-10-01')!.intensity).toBe(1)
    expect(mid).toBeGreaterThan(0.5)
    expect(mid - small).toBeGreaterThan(0.3)
    expect(peak?.date).toBe('2026-10-01')
    expect(cells.filter(c => c.future).map(c => c.date)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31'])
  })

  it('isScheduledSpend separates bills from everyday spend', async () => {
    const { isScheduledSpend } = await load()
    const base = { recurring_id: null, installment_id: null, is_recurring: false, source: null, tags: [] as string[] }
    expect(isScheduledSpend(base)).toBe(false)
    expect(isScheduledSpend({ ...base, recurring_id: 'r01' })).toBe(true)
    expect(isScheduledSpend({ ...base, installment_id: 'i1' })).toBe(true)
    expect(isScheduledSpend({ ...base, tags: ['auto-msi'] })).toBe(true)
  })

  it('clamps runaway category trends instead of printing four-digit percentages', async () => {
    // Current month: a huge grocery bill; previous month: a small one → +12,400%.
    const current = [{ ...SEED_TRANSACTIONS[3], id: 'big', category_id: 'cat-groc', amount_mxn: 500000 }]
    const previous = [{ ...SEED_TRANSACTIONS[3], id: 'small', category_id: 'cat-groc', amount_mxn: 4000 }]
    setupSupabaseMock()
    const base = vi.mocked(supabase.from).getMockImplementation()!
    let txCalls = 0
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      if (table !== 'finance_transactions') return base(table)
      txCalls++
      setupSupabaseMock({ finance_transactions: { data: txCalls % 2 === 1 ? current : previous, error: null } })
      const builder = vi.mocked(supabase.from).getMockImplementation()!(table)
      vi.mocked(supabase.from).mockImplementation(self)
      return builder
    }) as any)
    const self = vi.mocked(supabase.from).getMockImplementation()!
    const Comp = (await load()).default
    const { container } = render(<Comp />)
    await waitFor(() => expect(screen.getAllByText('>10×').length).toBeGreaterThanOrEqual(1))
    expect(container.textContent).not.toMatch(/\d{4,}%/)
  })

  it('KPI values stay neutral; tone only on the comparison', async () => {
    const Comp = (await load()).default
    const { container } = render(<Comp />)
    await waitFor(() => expect(screen.getByText('Monthly Spend')).toBeInTheDocument())
    expect(container.querySelector('.text-rose-600, .text-emerald-600, .text-indigo-600')).toBeNull()
    const spend = within(screen.getByText('Monthly Spend').parentElement as HTMLElement)
    expect(spend.getByText(/^\$/).className).toContain('text-fg')
  })

  it('flag toggles expose pressed state', async () => {
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Flag / }).length).toBeGreaterThanOrEqual(1))
    const flag = screen.getAllByRole('button', { name: /^Flag / })[0]
    expect(flag).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(flag)
    expect(flag).toHaveAttribute('aria-pressed', 'true')
  })

  // Leak detection reads its own usage window (anchored to today / month end), not just the selected month.
  function mockUsage(usage: any[], { usageError = false } = {}) {
    setupSupabaseMock({ finance_recurring: { data: [SEED_RECURRING[0]], error: null }, finance_transactions: { data: [], error: null } })
    const base = vi.mocked(supabase.from).getMockImplementation()!
    const usageFilters: Array<[string, unknown[]]> = []
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const builder = base(table)
      if (table !== 'finance_transactions') return builder
      return {
        ...builder,
        select: (cols: string) => {
          if (!String(cols).includes('recurring_id')) return builder.select(cols)
          const res = usageError ? { data: null, error: { message: 'boom' } } : { data: usage, error: null }
          const chain: any = Promise.resolve(res)
          for (const m of ['eq', 'gte', 'lte', 'lt', 'order', 'range']) chain[m] = (...args: unknown[]) => { usageFilters.push([m, args]); return chain }
          return chain
        },
      }
    }) as any)
    return usageFilters
  }

  it('does not flag a monthly sub charged within 30 days but before the 1st', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 3, 12))
    const filters = mockUsage([{ id: 'u1', transaction_date: '2026-09-20', recurring_id: 'r01', merchant: 'Claude', description: null }])
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('No leaks detected')).toBeInTheDocument())
    expect(filters).toContainEqual(['lte', ['transaction_date', '2026-10-03']])
  })

  it('past months judge usage up to month end and hide the destructive triage buttons', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 12))
    const filters = mockUsage([])
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText(/Claude Pro — no usage/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() => expect(filters).toContainEqual(['lte', ['transaction_date', '2026-09-30']]))
    await waitFor(() => expect(screen.getByText(/triage from the current month/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('a failed usage read flags no subscriptions instead of all of them', async () => {
    mockUsage([], { usageError: true })
    const Comp = (await load()).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText(/couldn't check subscription usage/)).toBeInTheDocument())
    expect(screen.queryByText(/no usage this/)).toBeNull()
  })
})
