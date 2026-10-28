/**
 * Unit Tests — Finance Tracker (5 pages)
 * Commit: 7288bbf
 *
 * Remainder after the Mona v2 W0 split: the legacy Overview client and the
 * architecture/seed checks. Per-page suites moved to
 * tests/pages/{transactions,budgets,subscriptions,reports}.test.tsx.
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
// FINANCE OVERVIEW
// ==========================================
describe('Finance Overview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
  })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Finance')).toBeInTheDocument())
    expect(screen.getByText('Personal spending and income overview')).toBeInTheDocument()
  })

  it('renders 4 KPI cards', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Spent')).toBeInTheDocument()
      expect(screen.getByText('Income')).toBeInTheDocument()
      expect(screen.getByText('Net Savings')).toBeInTheDocument()
      expect(screen.getByText('Savings Rate')).toBeInTheDocument()
    })
  })

  it('uses emerald for income and rose for expenses', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    const { container } = render(<Comp />)
    await waitFor(() => expect(screen.getByText('Spent')).toBeInTheDocument())
    expect(container.querySelector('.text-rose-600')).toBeInTheDocument()
    expect(container.querySelector('.text-emerald-600')).toBeInTheDocument()
  })

  it('renders month navigation', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByTestId('icon-chevronleft')).toBeInTheDocument()
      expect(screen.getByTestId('icon-chevronright')).toBeInTheDocument()
    })
  })

  it('renders Spending by Category donut', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Spending by Category')).toBeInTheDocument()
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    })
  })

  it('renders Daily Spending area chart', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Daily Spending')).toBeInTheDocument()
      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })
  })

  it('renders Budget Status section', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Budget Status')).toBeInTheDocument()
    })
  })

  it('renders Recent Transactions with "View all" link', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Recent Transactions')).toBeInTheDocument()
      // Several widgets render a "View all →" link — find the transactions one
      const links = screen.getAllByText('View all →').map(el => el.closest('a'))
      expect(links.some(a => a?.getAttribute('href') === '/finance/transactions')).toBe(true)
    })
  })

  it('renders sparklines in KPI cards', async () => {
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByTestId('sparkline').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('shows loading skeleton initially', async () => {
    // Chainable builder whose promise never settles — keeps the page in loading state
    vi.mocked(supabase.from).mockImplementation(() => {
      const pending: any = { then: () => {} }
      for (const m of ['select', 'order', 'eq', 'neq', 'gte', 'lte', 'lt', 'in', 'ilike', 'limit', 'single', 'range']) {
        pending[m] = vi.fn(() => pending)
      }
      return pending as any
    })
    const Comp = (await import('@/components/finance/overview-client')).default
    const { container } = render(<Comp />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('falls back to seed data when supabase is empty', async () => {
    setupSupabaseMock({
      finance_categories: { data: [], error: null },
      finance_transactions: { data: [], error: null },
      finance_budgets: { data: [], error: null },
    })
    const Comp = (await import('@/components/finance/overview-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Finance')).toBeInTheDocument())
  })
})

// ==========================================
// ARCHITECTURE & SEED DATA
// ==========================================
describe('Finance Architecture', () => {
  it('seed data has all expected exports', () => {
    expect(SEED_CATEGORIES.length).toBeGreaterThan(10)
    expect(SEED_TRANSACTIONS.length).toBeGreaterThan(30)
    expect(SEED_BUDGETS.length).toBeGreaterThan(5)
    expect(SEED_RECURRING.length).toBeGreaterThan(3)
  })

  it('seed categories include both expense and income types', () => {
    const types = new Set(SEED_CATEGORIES.map(c => c.type))
    expect(types.has('expense')).toBe(true)
    expect(types.has('income')).toBe(true)
  })

  it('seed transactions include both expense and income types', () => {
    const types = new Set(SEED_TRANSACTIONS.map(t => t.type))
    expect(types.has('expense')).toBe(true)
    expect(types.has('income')).toBe(true)
  })

  it('seed recurring items have all required fields', () => {
    for (const r of SEED_RECURRING) {
      expect(r.id).toBeTruthy()
      expect(r.name).toBeTruthy()
      expect(r.amount).toBeGreaterThan(0)
      expect(r.frequency).toMatch(/^(weekly|biweekly|monthly|quarterly|yearly)$/)
    }
  })

  it('all finance pages are server component wrappers', () => {
    const fs = require('fs')
    const pages = [
      'src/app/finance/page.tsx',
      'src/app/finance/transactions/page.tsx',
      'src/app/finance/budgets/page.tsx',
      'src/app/finance/subscriptions/page.tsx',
      'src/app/finance/reports/page.tsx',
    ]
    for (const page of pages) {
      const content = fs.readFileSync(page, 'utf-8')
      expect(content).not.toMatch(/^'use client'/)
      expect(content).toContain('export const metadata')
    }
  })

  it('finance loading.tsx exists with skeleton', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/finance/loading.tsx', 'utf-8')
    expect(content).toContain('animate-pulse')
  })

  it('supabase schema has all finance tables', () => {
    const fs = require('fs')
    const content = fs.readFileSync('supabase-finance-schema.sql', 'utf-8')
    expect(content).toContain('finance_categories')
    expect(content).toContain('finance_transactions')
    expect(content).toContain('finance_budgets')
    expect(content).toContain('finance_recurring')
    expect(content).toContain('ROW LEVEL SECURITY')
  })
})
