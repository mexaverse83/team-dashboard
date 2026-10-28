/**
 * Unit Tests — Savings goals (/finance/goals)
 * Split out of tests/pages/finance-v2.test.tsx (Mona v2 W0, pure move: no assertion changes).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
      expect(screen.getByText('Track progress toward your financial & crypto targets')).toBeInTheDocument()
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
