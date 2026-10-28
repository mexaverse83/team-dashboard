/**
 * Unit Tests — Reports page (/finance/reports)
 * Split out of tests/pages/finance.test.tsx (Mona v2 W0, pure move: no assertion changes).
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

// ==========================================
// REPORTS
// ==========================================
describe('Reports Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
  })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/reports-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Reports')).toBeInTheDocument())
    expect(screen.getByText('Financial trends and analytics')).toBeInTheDocument()
  })

  it('renders 4 KPI cards', async () => {
    const Comp = (await import('@/components/finance/reports-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Total Income')).toBeInTheDocument()
      expect(screen.getByText('Total Expenses')).toBeInTheDocument()
      expect(screen.getByText('Net')).toBeInTheDocument()
      expect(screen.getByText('Savings Rate')).toBeInTheDocument()
    })
  })

  it('income is emerald, expenses is rose', async () => {
    const Comp = (await import('@/components/finance/reports-client')).default
    const { container } = render(<Comp />)
    await waitFor(() => {
      expect(container.querySelector('.text-emerald-600')).toBeInTheDocument()
      expect(container.querySelector('.text-rose-600')).toBeInTheDocument()
    })
  })

  it('renders Income vs Expenses line chart', async () => {
    const Comp = (await import('@/components/finance/reports-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Income vs Expenses')).toBeInTheDocument()
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })
  })

  it('renders Category Trends area chart', async () => {
    const Comp = (await import('@/components/finance/reports-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Category Trends')).toBeInTheDocument()
      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })
  })

  it('renders Top Merchants section', async () => {
    const Comp = (await import('@/components/finance/reports-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Top Merchants')).toBeInTheDocument()
      // Check some merchants from seed data
      expect(screen.getAllByText(/Walmart|HEB|Starbucks/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows Income/Expenses legend', async () => {
    const Comp = (await import('@/components/finance/reports-client')).default
    render(<Comp />)
    await waitFor(() => {
      // Legend below Income vs Expenses chart
      const incomeLabels = screen.getAllByText('Income')
      const expenseLabels = screen.getAllByText('Expenses')
      expect(incomeLabels.length).toBeGreaterThanOrEqual(1)
      expect(expenseLabels.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows transaction count per merchant', async () => {
    const Comp = (await import('@/components/finance/reports-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/txns/).length).toBeGreaterThanOrEqual(1)
    })
  })
})
