/**
 * Unit Tests — Transactions page (/finance/transactions)
 * Split out of tests/pages/finance.test.tsx and finance-v2.test.tsx (Mona v2 W0, pure move: no assertion changes).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
// TRANSACTIONS
// ==========================================
describe('Transactions Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupSupabaseMock()
  })

  it('preserves decimal-comma cents and the draft ID after a failed save', async () => {
    const insert = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ error: null })
    const original = vi.mocked(supabase.from).getMockImplementation()!
    vi.mocked(supabase.from).mockImplementation(((table: string) => ({ ...original(table), ...(table === 'finance_transactions' ? { insert } : {}) })) as unknown as typeof supabase.from)
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add transaction' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0])
    fireEvent.change(screen.getByLabelText('Amount *'), { target: { value: '12,50' } })
    fireEvent.click(screen.getByRole('button', { name: /Groceries/ }))
    fireEvent.submit(document.getElementById('tx-form')!)
    fireEvent.submit(document.getElementById('tx-form')!)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm the save'))
    expect(insert).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Amount *')).toHaveValue('12,50')
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeEnabled()
    fireEvent.submit(document.getElementById('tx-form')!)
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(2))
    expect(insert.mock.calls[0][0]).toMatchObject({ amount: 12.5, amount_mxn: 12.5 })
    expect(insert.mock.calls[0][0].id).toBe(insert.mock.calls[1][0].id)
  })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('Transactions')).toBeInTheDocument())
    expect(screen.getByText('Capture spending fast. Keep every peso accountable.')).toBeInTheDocument()
  })

  it('renders type filter (All/Out/In)', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => {
      // Compact mobile-friendly labels: "Out" (expenses) / "In" (income)
      expect(screen.getAllByText('All').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('↓ Out')).toBeInTheDocument()
      expect(screen.getByText('↑ In')).toBeInTheDocument()
    })
  })

  it('renders search input', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search merchants, notes...')).toBeInTheDocument()
    })
  })

  it('renders category dropdown', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('All Categories')).toBeInTheDocument()
    })
  })

  it('renders transaction table headers', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Date')).toBeInTheDocument()
      expect(screen.getByText('Merchant')).toBeInTheDocument()
      expect(screen.getByText('Amount')).toBeInTheDocument()
      expect(screen.getByText('Category')).toBeInTheDocument()
    })
  })

  it('shows transaction count and pagination', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/transactions/)).toBeInTheDocument()
      expect(screen.getByText(/Page \d+ of \d+/)).toBeInTheDocument()
    })
  })

  it('filters by type when clicking Out (expenses)', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByText('↓ Out')).toBeInTheDocument())
    fireEvent.click(screen.getByText('↓ Out'))
    // All visible amounts should have minus sign (expenses)
    await waitFor(() => {
      const amounts = screen.getAllByText(/^[-+]\$/)
      amounts.forEach(el => {
        expect(el.textContent).toMatch(/^-\$/)
      })
    })
  })

  it('search filters by merchant name', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getByPlaceholderText('Search merchants, notes...')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('Search merchants, notes...'), { target: { value: 'Walmart' } })
    await waitFor(() => {
      expect(screen.getAllByText('Walmart').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('uses emerald for income and rose for expenses in amounts', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    const { container } = render(<Comp />)
    await waitFor(() => {
      expect(container.querySelector('.text-rose-600')).toBeInTheDocument()
    })
  })

  it('opens a mobile-first entry flow with amount before merchant and category', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add transaction' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0])

    const amount = screen.getByLabelText('Amount *')
    const merchant = screen.getByLabelText('Where did you spend?')
    const category = screen.getByText('Category *')
    expect(amount.compareDocumentPosition(merchant) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(merchant.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Frequent first')).toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
    expect(screen.getByLabelText('Tags')).toBeInTheDocument()
  })

  it('uses a recent merchant to fill merchant and category in one tap', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add transaction' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0])
    const recentMerchant = screen.getAllByRole('button', { name: 'Walmart' })[0]
    fireEvent.click(recentMerchant)
    expect(screen.getByLabelText('Where did you spend?')).toHaveValue('Walmart')
    expect(screen.getByRole('button', { name: /Groceries/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('changes the mobile owner without opening the date picker', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add transaction' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0])

    const dateInput = screen.getByLabelText('Choose transaction date') as HTMLInputElement
    const dateClick = vi.spyOn(dateInput, 'click')
    const laura = screen.getByRole('button', { name: 'Owner: Laura' })
    fireEvent.click(laura)

    expect(laura).toHaveAttribute('aria-pressed', 'true')
    expect(dateClick).not.toHaveBeenCalled()
  })

  it('picks a custom date from the mobile calendar and shows it on the chip', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Add transaction' }).length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByRole('button', { name: 'Add transaction' })[0])

    const dateInput = screen.getByLabelText('Choose transaction date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-01-15' } })

    expect(dateInput).toHaveValue('2026-01-15')
    expect(screen.getByText('Jan 15')).toBeInTheDocument()
    expect(screen.getByLabelText('Date *')).toHaveValue('2026-01-15')
  })
})

// ==========================================
// V1 CRUD TESTS (Transactions, Budgets, Subscriptions)
// ==========================================
describe('Transactions CRUD', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMockV2() })

  it('renders Add Transaction button', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const addBtn = buttons.find(b => b.textContent?.includes('Add') || b.textContent?.includes('New'))
      expect(addBtn || screen.queryByTestId('icon-plus')).toBeDefined()
    })
  })

  it('renders edit and delete buttons on rows', async () => {
    const Comp = (await import('@/components/finance/transactions-client')).default
    render(<Comp />)
    await waitFor(() => {
      // Edit/delete icons or buttons
      const pencils = screen.queryAllByTestId('icon-pencil')
      const trash = screen.queryAllByTestId('icon-trash2')
      expect(pencils.length + trash.length).toBeGreaterThanOrEqual(1)
    })
  })
})
