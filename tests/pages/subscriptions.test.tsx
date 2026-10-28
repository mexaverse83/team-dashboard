/**
 * Unit Tests — Subscriptions page (/finance/subscriptions)
 * Split out of tests/pages/finance.test.tsx and finance-v2.test.tsx (Mona v2 W0, pure move: no assertion changes).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

// Mock SparklineChart
vi.mock('@/components/ui/sparkline-chart', () => ({
  SparklineChart: () => <div data-testid="sparkline" />,
}))

// Mock lucide-react
vi.mock('lucide-react', () => {
  const i = (n: string) => (props: any) => <svg data-testid={`icon-${n}`} {...props} />
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
    Pencil: i('pencil'), Trash2: i('trash2'), Power: i('power'), Upload: i('upload'), Download: i('download'),
    CreditCard: i('creditcard'), Calculator: i('calculator'),
    Landmark: i('landmark'), ShieldCheck: i('shieldcheck'), Target: i('target'),
    Menu: i('menu'), X: i('x'),
    // Icons added by newer finance components (weekend budget, rules, insights, etc.)
    AlertCircle: i('alertcircle'), AlertTriangle: i('alerttriangle'),
    ArrowDownLeft: i('arrowdownleft'), ArrowRight: i('arrowright'), ArrowUpRight: i('arrowupright'),
    Bitcoin: i('bitcoin'), CalendarDays: i('calendardays'), Check: i('check'),
    CheckCircle2: i('checkcircle2'), ChevronDown: i('chevrondown'), ChevronUp: i('chevronup'),
    Clock: i('clock'), HeartPulse: i('heartpulse'), Info: i('info'), Lightbulb: i('lightbulb'),
    Scissors: i('scissors'), SlidersHorizontal: i('slidershorizontal'), Sparkles: i('sparkles'), Trophy: i('trophy'), Wand2: i('wand2'),
  }
})

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

// The Finance V2 suite's mock: budgets not pinned to the current month, extra tables.
function setupSupabaseMockV2(overrides: Record<string, any> = {}) {
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
// SUBSCRIPTIONS
// ==========================================
describe('Subscriptions Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
  })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Subscriptions')).toBeInTheDocument())
    expect(screen.getByText('Recurring charges and subscription tracking')).toBeInTheDocument()
  })

  it('renders 3 KPI cards', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Monthly Burn')).toBeInTheDocument()
      expect(screen.getByText('Annual Projection')).toBeInTheDocument()
      // "Active" appears as both KPI label and status — check both exist
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders subscription table with headers', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument()
      expect(screen.getByText('Amount')).toBeInTheDocument()
      expect(screen.getByText('Frequency')).toBeInTheDocument()
      expect(screen.getByText('Next Due')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
    })
  })

  it('shows subscription names from seed data', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    render(<Comp />)
    await waitFor(() => {
      // Names may appear in table + upcoming section
      expect(screen.getAllByText('Claude Pro').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Spotify Premium').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Netflix').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows active/cancelled status indicators', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders Upcoming section', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Upcoming/)).toBeInTheDocument()
    })
  })

  it('monthly burn is in rose color', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    const { container } = render(<Comp />)
    await waitFor(() => {
      expect(container.querySelector('.text-rose-600')).toBeInTheDocument()
    })
  })
})

describe('Subscriptions CRUD', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMockV2() })

  it('renders Add Subscription button', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    render(<Comp />)
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders toggle/status controls', async () => {
    const Comp = (await import('@/components/finance/subscriptions-client')).default
    render(<Comp />)
    await waitFor(() => {
      // Active/cancelled status toggles
      expect(screen.getAllByText(/Active|Cancelled/i).length).toBeGreaterThanOrEqual(1)
    })
  })
})
