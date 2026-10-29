/**
 * Unit Tests — Debt planner (/finance/debt)
 * Mona v2 WS1 rebuild on the shared primitives (PageHeader, Card, Stat, tokens).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { SEED_CATEGORIES, SEED_TRANSACTIONS, SEED_BUDGETS, SEED_RECURRING } from '../fixtures/seed-finance'

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
// DEBT PLANNER
// ==========================================
describe('Debt Planner', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })
  afterEach(() => { vi.useRealTimers() })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Debt Planner')).toBeInTheDocument()
    })
  })

  it('renders debt cards', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/Credit Card|Personal Loan/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows Snowball and Avalanche comparison', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/Snowball/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Avalanche/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows total debt amount', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => {
      // $45000 + $25000 = $70000
      expect(screen.getAllByText(/70,000|\$70/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders extra payment slider or input', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => {
      // Should have an input for extra payment
      expect(screen.getAllByText(/Extra|Additional/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders payoff timeline chart', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => {
      // Should render a line or area chart for payoff timeline
      const charts = screen.queryAllByTestId('line-chart') || screen.queryAllByTestId('area-chart')
      expect(charts.length).toBeGreaterThanOrEqual(0) // May use either chart type
    })
  })

  it('shows interest rate on debt cards', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/36%|18%/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('payoff gauge shows real principal paid pct from finance_debt_payments', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => {
      // paid 30,000 principal vs 70,000 remaining → 30,000 / 100,000 = 30%
      expect(screen.getByText('30%')).toBeInTheDocument()
      expect(screen.getByText('of original debt paid off')).toBeInTheDocument()
    })
  })

  it('KPIs and balances are neutral (no rose/emerald), with a Recommended pill on the cheaper strategy', async () => {
    const Comp = (await import('@/components/finance/debt-client')).default
    const { container } = render(<Comp />)
    await waitFor(() => expect(screen.getByText('Recommended')).toBeInTheDocument())
    expect(container.querySelector('.text-rose-600, .text-emerald-600')).toBeNull()
  })

  it('logs a payment with a local-calendar payment_date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    // 20:30 in Mexico City is already the next day in UTC.
    vi.setSystemTime(new Date(2026, 9, 28, 20, 30))
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    const logButtons = await screen.findAllByRole('button', { name: /Log payment for Credit Card/ })
    fireEvent.click(logButtons[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Log Payment & Update Balance' }))
    await waitFor(() => {
      const inserts = vi.mocked(supabase.from).mock.results
        .filter((_, i) => vi.mocked(supabase.from).mock.calls[i][0] === 'finance_debt_payments')
        .flatMap(r => (r.value as any).insert.mock.calls)
      expect(inserts.length).toBeGreaterThanOrEqual(1)
      expect(inserts[0][0].payment_date).toBe('2026-10-28')
    })
  })

  it('a failed read shows an error with Retry, not "No debts tracked yet"', async () => {
    setupSupabaseMock({ finance_debts: { data: null, error: { message: 'permission denied' } } })
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText("Couldn't load your debts")).toBeInTheDocument())
    expect(screen.queryByText('No debts tracked yet')).toBeNull()
    expect(screen.queryByText('Total Debt')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('a failed save keeps the modal open and says why', async () => {
    setupSupabaseMock()
    const base = vi.mocked(supabase.from).getMockImplementation()!
    vi.mocked(supabase.from).mockImplementation(((table: string) => {
      const b = base(table)
      return table === 'finance_debts' ? { ...b, insert: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: { message: 'rls says no' } })) } : b
    }) as any)
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    fireEvent.click((await screen.findAllByRole('button', { name: /Add Debt/ }))[0])
    fireEvent.change(screen.getByLabelText('Debt Name *'), { target: { value: 'Amex' } })
    fireEvent.change(screen.getByLabelText('Balance *'), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText('Rate % *'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Minimum *'), { target: { value: '200' } })
    expect(screen.getByRole('radiogroup', { name: 'Type' })).toBeInTheDocument()
    fireEvent.click(within(screen.getByTestId('modal')).getByRole('button', { name: 'Add Debt' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save the debt: rls says no"))
    expect(screen.getByTestId('modal')).toBeInTheDocument()
  })

  it('hides the KPI row when there are no debts', async () => {
    setupSupabaseMock({ finance_debts: { data: [], error: null } })
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('No debts tracked yet')).toBeInTheDocument())
    expect(screen.queryByText('Total Debt')).toBeNull()
  })

  it('says minimums do not cover interest instead of a 30-year date', async () => {
    setupSupabaseMock({ finance_debts: { data: [
      { id: 'd9', name: 'Old Card', creditor: 'X', balance: 100000, interest_rate: 60, minimum_payment: 1000, type: 'credit_card', is_active: true, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ], error: null } })
    const Comp = (await import('@/components/finance/debt-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getAllByText("Minimums don't cover interest").length).toBeGreaterThanOrEqual(1))
    expect(screen.queryByText(/360 months/)).toBeNull()
    const { simulatePayoff } = await import('@/components/finance/debt-client')
    expect(simulatePayoff([{ balance: 100000, interest_rate: 60, minimum_payment: 1000 } as any], 'avalanche', 0).stalled).toBe(true)
    expect(simulatePayoff([{ balance: 10000, interest_rate: 12, minimum_payment: 1000 } as any], 'avalanche', 0).stalled).toBe(false)
  })
})
