/**
 * Unit Tests — Savings goals (/finance/goals)
 * Split out of tests/pages/finance-v2.test.tsx (Mona v2 W0, pure move: no assertion changes).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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

// Mock lucide-react (exhaustive)
vi.mock('lucide-react', () => {
  const i = (n: string) => ({ className, ...rest }: any) => <span data-testid={`icon-${n}`} className={className} />
  return {
    TrendingDown: i('trendingdown'), TrendingUp: i('trendingup'), Wallet: i('wallet'),
    Percent: i('percent'), ChevronLeft: i('chevronleft'), ChevronRight: i('chevronright'),
    Search: i('search'), Calendar: i('calendar'), Shield: i('shield'), Code: i('code'),
    Telescope: i('telescope'), Mail: i('mail'), FlaskConical: i('flaskconical'),
    Palette: i('palette'), Server: i('server'), Users: i('users'), DollarSign: i('dollarsign'),
    Home: i('home'), Zap: i('zap'), LayoutGrid: i('layoutgrid'),
    MessageCircle: i('messagecircle'), BarChart3: i('barchart3'),
    ChevronsLeft: i('chevronsleft'), ChevronsRight: i('chevronsright'),
    Inbox: i('inbox'), Activity: i('activity'), CheckSquare: i('checksquare'),
    ArrowLeftRight: i('arrowleftright'), PiggyBank: i('piggybank'),
    RefreshCw: i('refreshcw'), FileBarChart: i('filebarchart'),
    Radio: i('radio'), Minus: i('minus'), Plus: i('plus'),
    Pencil: i('pencil'), Trash2: i('trash2'), Calculator: i('calculator'),
    Landmark: i('landmark'), ShieldCheck: i('shieldcheck'), Target: i('target'),
    Menu: i('menu'), X: i('x'), CreditCard: i('creditcard'), Power: i('power'),
    Upload: i('upload'), Download: i('download'),
    // Icons added by newer finance components
    AlertCircle: i('alertcircle'), AlertTriangle: i('alerttriangle'),
    ArrowDownLeft: i('arrowdownleft'), ArrowRight: i('arrowright'), ArrowUpRight: i('arrowupright'),
    Bitcoin: i('bitcoin'), CalendarDays: i('calendardays'), Check: i('check'),
    CheckCircle2: i('checkcircle2'), ChevronDown: i('chevrondown'), ChevronUp: i('chevronup'),
    Clock: i('clock'), HeartPulse: i('heartpulse'), Info: i('info'), Lightbulb: i('lightbulb'),
    Scissors: i('scissors'), SlidersHorizontal: i('slidershorizontal'), Sparkles: i('sparkles'), Trophy: i('trophy'), Wand2: i('wand2'),
    MoreHorizontal: i('morehorizontal'),
  }
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
// SAVINGS GOALS
// ==========================================
describe('Savings Goals', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    // Page was renamed from "Savings Goals" to "Goals" (now covers crypto targets too)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Goals' })).toBeInTheDocument()
      expect(screen.getByText(/Track progress toward your financial & crypto targets/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Investments › Real Estate' })).toHaveAttribute('href', '/finance/investments?tab=Real%20Estate')
    })
  })

  it('renders goal cards', async () => {
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/MacBook Pro|Vacation Fund/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows Add Goal button', async () => {
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const addBtn = buttons.find(b => b.textContent?.includes('Add') || b.textContent?.includes('New'))
      expect(addBtn || screen.getByTestId('icon-plus')).toBeDefined()
    })
  })

  it('shows progress percentage on goal cards', async () => {
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => {
      // 15000/50000 = 30%, 8000/30000 = 27%
      expect(screen.getAllByText(/%/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders What-If section when goal is selected', async () => {
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/MacBook Pro/).length).toBeGreaterThanOrEqual(1)
    })
    // Click on goal to select it
    const goalCard = screen.getAllByText(/MacBook Pro/)[0].closest('[class]')
    if (goalCard) fireEvent.click(goalCard)
    await waitFor(() => {
      // What-If section or projection chart should appear
      expect(screen.getAllByText(/What-If|Projection|Monthly/).length).toBeGreaterThanOrEqual(1)
    })
  })
})

// ==========================================
// GOALS MATH (Mona v2 WS4: UX-07, VIS-13, F21)
// ==========================================
describe('Goals — shared math and layout', () => {
  const household = [
    { id: 'b', name: 'Bernardo 2026', target_amount: 755000, current_amount: 474146, target_date: '2026-12-31', is_completed: false, priority: 1, monthly_contribution: 0, scope: 'personal', owner: 'bernardo', goal_type: 'savings', crypto_symbol: null, investment_vehicle: null, milestones_json: [], created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'l', name: 'Laura 2026', target_amount: 210000, current_amount: 127388, target_date: '2026-12-31', is_completed: false, priority: 2, monthly_contribution: 0, scope: 'personal', owner: 'Laura', goal_type: 'savings', crypto_symbol: null, investment_vehicle: null, milestones_json: [], created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'c', name: '1 BTC', target_amount: 1, current_amount: 0.25, target_date: '2027-12-31', is_completed: false, priority: 3, monthly_contribution: 0, scope: 'shared', owner: null, goal_type: 'crypto', crypto_symbol: 'BTC', investment_vehicle: null, milestones_json: [], created_at: '2026-02-18', updated_at: '2026-02-18' },
  ]
  const fetchWith = (routes: Record<string, unknown>) => vi.fn((url: string) => {
    const key = Object.keys(routes).find(k => String(url).includes(k))
    const body = key ? routes[key] : {}
    return Promise.resolve({ ok: !!key, status: key ? 200 : 404, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T18:00:00Z'))
    setupSupabaseMock({ finance_goals: { data: household, error: null } })
  })
  afterEach(() => vi.useRealTimers())

  it('asks the same monthly need as home ($121k, current month counted) and keeps BTC out of pesos', async () => {
    vi.stubGlobal('fetch', fetchWith({}))
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('$121.2k')).toBeInTheDocument())
    // Saved / target are peso-only: 601,534 of 965,000 (no "$965,001").
    expect(screen.getByText('$601.5k')).toBeInTheDocument()
    expect(screen.getByText(/62% of \$965k/)).toBeInTheDocument()
    expect(screen.queryByText('No data yet')).not.toBeInTheDocument()
    expect(screen.queryByText(/#1/)).not.toBeInTheDocument()
  })

  it('tracks the BTC goal from summed holdings, falling back to the stored amount', async () => {
    vi.stubGlobal('fetch', fetchWith({ '/api/finance/crypto': { holdings: [{ symbol: 'BTC', quantity: 0.088, owner: 'Laura' }, { symbol: 'BTC', quantity: 0.19982936, owner: 'bernardo' }], prices: null } }))
    const Comp = (await import('@/components/finance/goals-client')).default
    const { unmount } = render(<Comp />)
    await waitFor(() => expect(screen.getByText('0.28782936')).toBeInTheDocument())
    unmount()

    vi.stubGlobal('fetch', fetchWith({}))
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('0.25')).toBeInTheDocument())
  })

  it('shows monthly-savings tiles only when the server route returns rows', async () => {
    vi.stubGlobal('fetch', fetchWith({ '/api/finance/monthly-savings': { data: [{ month: '2026-09-01', owner: 'total', gross_income: 206800, total_expenses: 101694, net_savings: 105106, savings_rate: 51, planned_contribution: 120000, variance: -14894 }], chart: [] } }))
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Last month net')).toBeInTheDocument())
    expect(screen.getByText('$105.1k')).toBeInTheDocument()
    expect(screen.getByText('51%')).toBeInTheDocument()
  })

  it('flags 2026 goals as past due in January and drops them from the monthly need', async () => {
    vi.setSystemTime(new Date('2027-01-02T18:00:00Z'))
    vi.stubGlobal('fetch', fetchWith({}))
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getAllByText('2 past due').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Overdue — roll over')).toHaveLength(2)
    expect(screen.getByText('no open peso goals')).toBeInTheDocument()
  })

  it('moves edit and delete into a ⋯ menu', async () => {
    vi.stubGlobal('fetch', fetchWith({}))
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByLabelText('Actions for Laura 2026')).toBeInTheDocument())
    expect(screen.queryByRole('menuitem', { name: /Delete/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Actions for Laura 2026'))
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete/ }))
    expect(screen.getByText('Delete this goal?')).toBeInTheDocument()
  })

  it('opens a goal from the keyboard and the ⋯ menu handles focus and Escape', async () => {
    vi.stubGlobal('fetch', fetchWith({}))
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    const title = await screen.findByRole('button', { name: 'Laura 2026' })
    expect(title).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(title) // a native button: Enter/Space activate it
    await waitFor(() => expect(screen.getByRole('button', { name: 'Laura 2026' })).toHaveAttribute('aria-expanded', 'true'))

    const trigger = screen.getByLabelText('Actions for Laura 2026')
    fireEvent.click(trigger)
    const edit = screen.getByRole('menuitem', { name: /Edit/ })
    await waitFor(() => expect(edit).toHaveFocus())
    fireEvent.keyDown(edit, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
