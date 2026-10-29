/**
 * Unit Tests — Emergency fund (/finance/emergency-fund)
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
// EMERGENCY FUND
// ==========================================
const FUND_ROW = {
  id: 'ef1', current_amount: 390000, target_amount: 150000, target_months: 6,
  created_at: '2026-02-16T10:00:00Z', updated_at: '2026-02-16T10:00:00Z',
  account_allocation_json: { tier1: 100000, tier2: 190000, tier3: 100000, monthly_essentials: 25000, monthly_saving: 8000, risk_answers: null },
}

function stubSummary(emergency_fund: Record<string, unknown> | null, extra: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (String(url).includes('/api/finance/summary') && emergency_fund) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ emergency_fund, ...extra }), text: () => Promise.resolve('') })
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
  }))
}

describe('Emergency Fund', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })
  afterEach(() => { vi.useRealTimers() })

  const load = async () => (await import('@/components/finance/emergency-fund-client')).default

  it('renders page header', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })
  })

  it('renders monthly essentials input inside the settings disclosure', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByLabelText(/Monthly Essentials/)).toBeInTheDocument())
    expect(screen.getByLabelText(/Monthly Essentials/).closest('details')).not.toBeNull()
    expect(screen.getByText('Fund settings')).toBeInTheDocument()
  })

  it('renders MX account recommendations without hard-coded yields', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/Nu México|Hey Banco|Mercado Pago|CETES|Supertasas|Kubo/).length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getByText(/compare today's rate in each app/)).toBeInTheDocument()
    // Stale numeric yields (e.g. "~15.0%") must not come back.
    expect(screen.queryByText(/~\d+(\.\d)?%/)).not.toBeInTheDocument()
  })

  it('renders liquidity tier allocation', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/Tier|tier/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows risk assessment questions as radio groups', async () => {
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/risk|Risk|income|dependents|insurance/i).length).toBeGreaterThanOrEqual(1)
    })
    expect(screen.getByRole('radiogroup', { name: 'Health insurance coverage?' })).toBeInTheDocument()
  })

  it('leads with months covered from the summary and badges a manual essentials basis', async () => {
    stubSummary(
      { target: 150000, current: 390000, target_months: 6, monthly_essentials: 25000, months_covered: 15.6, funded_pct: 260, gap: 0, risk_score: 10, essentials_basis: 'manual' },
      { staleness: { ef_confirmed_at: '2026-02-16', gbm_confirmed_at: null, real_estate_confirmed_at: null } },
    )
    setupSupabaseMock({ finance_emergency_fund: { data: [FUND_ROW], error: null } })
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByTestId('ef-months')).toHaveTextContent('15.6 months'))
    expect(screen.getByTestId('ef-basis')).toHaveTextContent('Manual estimate')
    expect(screen.getByText('Balance last confirmed Feb 16')).toBeInTheDocument()
    expect(screen.getByText('Surplus')).toBeInTheDocument()
  })

  it('offers the surplus as a link (no write) when the balance is freshly confirmed and essentials derived', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 12))
    stubSummary(
      { target: 150000, current: 390000, target_months: 6, monthly_essentials: 25000, months_covered: 15.6, funded_pct: 260, gap: 0, risk_score: 10, essentials_basis: 'derived' },
      { staleness: { ef_confirmed_at: '2026-10-20', gbm_confirmed_at: null, real_estate_confirmed_at: null } },
    )
    const Comp = await load()
    render(<Comp />)
    const link = await screen.findByRole('link', { name: /Plan it for WEST/ })
    expect(link).toHaveAttribute('href', '/finance/investments?tab=Real%20Estate')
    expect(screen.getByText('$240,000')).toBeInTheDocument()
    expect(vi.mocked(supabase.from).mock.results.some(r => (r.value as any).update.mock.calls.length > 0)).toBe(false)
  })

  it('asks to confirm a stale balance before suggesting where to move the surplus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 12))
    stubSummary(
      { target: 150000, current: 390000, target_months: 6, monthly_essentials: 25000, months_covered: 15.6, funded_pct: 260, gap: 0, risk_score: 10, essentials_basis: 'manual' },
      { staleness: { ef_confirmed_at: '2026-02-16T18:00:00Z', gbm_confirmed_at: null, real_estate_confirmed_at: null } },
    )
    const Comp = await load()
    render(<Comp />)
    const box = await screen.findByTestId('ef-confirm-first')
    expect(box).toHaveTextContent('last confirmed Feb 16 (8 months ago)')
    expect(box).toHaveTextContent('essentials are a manual estimate')
    expect(screen.getByRole('button', { name: 'Confirm your balance first' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Plan it for WEST/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm your balance first' }))
    expect((document.getElementById('fund-settings') as HTMLDetailsElement).open).toBe(true)
  })

  it('never labels a settings save as a balance confirmation', async () => {
    setupSupabaseMock({ finance_emergency_fund: { data: [{ ...FUND_ROW, updated_at: '2026-10-01T12:00:00Z' }], error: null } })
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByText(/Settings last saved Oct 1 · balance not confirmed/)).toBeInTheDocument())
    expect(screen.queryByText(/Balance last confirmed/)).toBeNull()
  })

  it('shows a skeleton, not placeholder money, while loading', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    vi.mocked(supabase.from).mockImplementation((() => ({
      select: () => { const p: any = new Promise(() => {}); p.order = () => p; p.limit = () => p; return p },
    })) as any)
    const Comp = await load()
    const { container } = render(<Comp />)
    expect(screen.getByTestId('ef-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('ef-months')).toBeNull()
    expect(container.textContent).not.toMatch(/\$93|\$25,000|3\.7/)
  })

  it('shows an error state when both the summary and the fund row fail', async () => {
    setupSupabaseMock({ finance_emergency_fund: { data: null, error: { message: 'rls' } } })
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByText("Couldn't load your emergency fund")).toBeInTheDocument())
    expect(screen.queryByTestId('ef-months')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows a setup prompt when there is no fund yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') })))
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('No emergency fund set up yet')).toBeInTheDocument())
    expect(screen.queryByTestId('ef-months')).toBeNull()
  })

  it('shows a derived basis and a gap when essentials come from spending', async () => {
    stubSummary({ target: 450000, current: 390000, target_months: 6, monthly_essentials: 75000, months_covered: 5.2, funded_pct: 87, gap: 60000, risk_score: 10, essentials_basis: 'derived' })
    const Comp = await load()
    render(<Comp />)
    await waitFor(() => expect(screen.getByTestId('ef-basis')).toHaveTextContent('From your spending'))
    expect(screen.getByTestId('ef-months')).toHaveTextContent('5.2 months')
    expect(screen.getByText('Gap')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Plan it for WEST/ })).toBeNull()
  })

  it('uses tokens, not indigo', async () => {
    const Comp = await load()
    const { container } = render(<Comp />)
    await waitFor(() => expect(screen.getByText('Emergency Fund')).toBeInTheDocument())
    expect(container.innerHTML).not.toMatch(/indigo|violet/)
  })
})
