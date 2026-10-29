/**
 * Unit Tests — Budget Builder (/finance/budget-builder)
 * Split out of tests/pages/finance-v2.test.tsx (Mona v2 W0, pure move: no assertion changes).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { SEED_CATEGORIES, SEED_TRANSACTIONS, SEED_BUDGETS, SEED_RECURRING } from '../fixtures/seed-finance'
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

// Mock lucide-react (exhaustive)
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

// Salaries come from the server route (RLS hides finance_recurring_income from the browser key).
function stubRecurringIncome(rows: unknown[]) {
  vi.stubGlobal('fetch', vi.fn((url: string) => String(url).includes('/api/finance/recurring-income')
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ data: rows }), text: () => Promise.resolve('') })
    : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') })))
}

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
// BUDGET BUILDER
// ==========================================
describe('Budget Builder', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/budget-builder-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Budget Builder')).toBeInTheDocument()
      expect(screen.getByText(/Zero-based budgeting/)).toBeInTheDocument()
    })
  })

  it('renders 50/30/20 Analysis section', async () => {
    const Comp = (await import('@/components/finance/budget-builder-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('50/30/20 Analysis')).toBeInTheDocument()
    })
  })

  it('renders Income Sources section with Add button', async () => {
    const Comp = (await import('@/components/finance/budget-builder-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Income Sources')).toBeInTheDocument()
    })
  })

  it('renders Budget Allocation section', async () => {
    const Comp = (await import('@/components/finance/budget-builder-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Budget Allocation')).toBeInTheDocument()
    })
  })

  it('renders Top Actions section', async () => {
    const Comp = (await import('@/components/finance/budget-builder-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Top Actions/)).toBeInTheDocument()
    })
  })

  it('shows 50/30/20 labels (Needs/Wants/Savings)', async () => {
    const Comp = (await import('@/components/finance/budget-builder-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/Needs|Wants|Savings/).length).toBeGreaterThanOrEqual(3)
    })
  })

  it('never calls an over-budget month healthy and states gaps in points, not arrows', async () => {
    const month = monthKey(new Date())
    setupSupabaseMock({
      finance_budgets: { data: [{ id: 'b1', category_id: 'cat-groc', month: `${month}-01`, amount: 1000, owner: null }], error: null },
      finance_transactions: { data: [{ id: 'x1', type: 'expense', amount_mxn: 5000, category_id: 'cat-groc', transaction_date: `${month}-01` }], error: null },
      finance_income_sources: { data: [], error: null },
      finance_goals: { data: [], error: null },
      finance_installments: { data: [], error: null },
    })
    stubRecurringIncome([{ id: 'ri1', name: 'Freelance', amount: 100000, recurrence: 'monthly', active: true, start_date: null }])
    const Comp = (await import('@/components/finance/budget-builder-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Spending is at 500% of budget this month'))
    expect(screen.getByRole('list', { name: 'Salaries' })).toHaveTextContent('Freelance')
    expect(screen.getByText('45 pts under 50% target')).toBeInTheDocument()
    expect(screen.getAllByText('+$4,000').length).toBeGreaterThan(0)
    expect(screen.getByRole('status', { name: '' }).className).toContain('bg-negative-bg')
    expect(screen.getByText('1 category over budget')).toBeInTheDocument()
    expect(screen.getByText('Groceries $4,000 over.')).toBeInTheDocument()
    expect(screen.queryByText('Budget looks healthy!')).not.toBeInTheDocument()
  })

  it('allocates spread (coverage) rows like the Budgets page', async () => {
    const month = monthKey(new Date())
    const { addMonthsKey } = await import('@/lib/dates')
    setupSupabaseMock({
      finance_budgets: { data: [{ id: 'b1', category_id: 'cat-groc', month: `${month}-01`, amount: 2000, owner: null }], error: null },
      finance_transactions: { data: [
        { id: 'x1', type: 'expense', amount_mxn: 1500, category_id: 'cat-groc', transaction_date: `${month}-01`, coverage_start: null, coverage_end: null },
        { id: 'x2', type: 'expense', amount_mxn: 12000, category_id: 'cat-groc', transaction_date: `${addMonthsKey(month, -2)}-05`, coverage_start: `${addMonthsKey(month, -2)}-01`, coverage_end: `${addMonthsKey(month, 9)}-28` },
      ], error: null },
      finance_income_sources: { data: [], error: null },
      finance_goals: { data: [], error: null },
      finance_installments: { data: [], error: null },
    })
    stubRecurringIncome([{ amount: 100000, recurrence: 'monthly', active: true, start_date: null }])
    const Comp = (await import('@/components/finance/budget-builder-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Spending is at 125% of budget this month'))
  })
})

describe('targetGap', () => {
  it('reads as plain points against the target', async () => {
    const { targetGap } = await import('@/components/finance/budget-builder-client')
    expect(targetGap(38, 50)).toBe('12 pts under 50% target')
    expect(targetGap(41, 30)).toBe('11 pts over 30% target')
    expect(targetGap(20, 20)).toBe('On the 20% target')
  })
})
