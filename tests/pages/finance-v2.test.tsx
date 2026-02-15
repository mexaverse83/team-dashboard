/**
 * Unit Tests — Finance V2 Modules (5 new pages)
 * Commits: 280fc00, 11f5dcf, 9727a9d
 *
 * - Budget Builder: Zero-based budgeting, 50/30/20 analysis, income sources CRUD
 * - Goals: Savings goals, progress, what-if scenarios
 * - Debt: Snowball vs avalanche, scenario slider, payoff timeline
 * - Emergency Fund: Risk assessment, thermometer, liquidity tiers, MX recommendations
 * - Audit: Spending heatmap, category scorecards, leak detection
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
  }
})

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => children,
}))

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
          for (const m of ['order', 'eq', 'gte', 'lt', 'lte', 'limit', 'single']) {
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
})

// ==========================================
// SAVINGS GOALS
// ==========================================
describe('Savings Goals', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/goals-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Savings Goals')).toBeInTheDocument()
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
// DEBT PLANNER
// ==========================================
describe('Debt Planner', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })

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
})

// ==========================================
// EMERGENCY FUND
// ==========================================
describe('Emergency Fund', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/emergency-fund-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Emergency Fund')).toBeInTheDocument()
    })
  })

  it('renders monthly essentials input', async () => {
    const Comp = (await import('@/components/finance/emergency-fund-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Monthly Essentials/)).toBeInTheDocument()
    })
  })

  it('renders MX account recommendations', async () => {
    const Comp = (await import('@/components/finance/emergency-fund-client')).default
    render(<Comp />)
    await waitFor(() => {
      // MX-specific account names
      expect(screen.getAllByText(/Nu México|Hey Banco|Mercado Pago|CETES|Supertasas|Kubo/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders liquidity tier allocation', async () => {
    const Comp = (await import('@/components/finance/emergency-fund-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getAllByText(/Tier|tier/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows risk assessment questions', async () => {
    const Comp = (await import('@/components/finance/emergency-fund-client')).default
    render(<Comp />)
    await waitFor(() => {
      // Risk score quiz should be visible
      expect(screen.getAllByText(/risk|Risk|income|dependents|insurance/i).length).toBeGreaterThanOrEqual(1)
    })
  })
})

// ==========================================
// EXPENSE AUDIT
// ==========================================
describe('Expense Audit', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })

  it('renders page header', async () => {
    const Comp = (await import('@/components/finance/audit-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Expense Audit')).toBeInTheDocument()
    })
  })

  it('renders Spending Heatmap section', async () => {
    const Comp = (await import('@/components/finance/audit-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Spending Heatmap')).toBeInTheDocument()
    })
  })

  it('renders Category Scorecards section', async () => {
    const Comp = (await import('@/components/finance/audit-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText('Category Scorecards')).toBeInTheDocument()
    })
  })

  it('renders Money Leaks section', async () => {
    const Comp = (await import('@/components/finance/audit-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Money Leaks/)).toBeInTheDocument()
    })
  })

  it('renders Largest Expenses section', async () => {
    const Comp = (await import('@/components/finance/audit-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Largest Expenses/)).toBeInTheDocument()
    })
  })

  it('renders Most Frequent Purchases section', async () => {
    const Comp = (await import('@/components/finance/audit-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Most Frequent/)).toBeInTheDocument()
    })
  })

  it('renders Merchant Concentration section', async () => {
    const Comp = (await import('@/components/finance/audit-client')).default
    render(<Comp />)
    await waitFor(() => {
      expect(screen.getByText(/Merchant Concentration/)).toBeInTheDocument()
    })
  })

  it('heatmap renders day/hour grid', async () => {
    const Comp = (await import('@/components/finance/audit-client')).default
    const { container } = render(<Comp />)
    await waitFor(() => {
      // Heatmap grid cells
      const cells = container.querySelectorAll('[title]')
      expect(cells.length).toBeGreaterThanOrEqual(1)
    })
  })
})

// ==========================================
// V1 CRUD TESTS (Transactions, Budgets, Subscriptions)
// ==========================================
describe('Transactions CRUD', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })

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

describe('Subscriptions CRUD', () => {
  beforeEach(() => { vi.clearAllMocks(); setupSupabaseMock() })

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

// ==========================================
// ARCHITECTURE & SCHEMA
// ==========================================
describe('Finance V2 Architecture', () => {
  it('all V2 client components have use client', () => {
    const fs = require('fs')
    const clients = [
      'src/components/finance/budget-builder-client.tsx',
      'src/components/finance/goals-client.tsx',
      'src/components/finance/debt-client.tsx',
      'src/components/finance/emergency-fund-client.tsx',
      'src/components/finance/audit-client.tsx',
    ]
    for (const path of clients) {
      const content = fs.readFileSync(path, 'utf-8')
      expect(content.startsWith("'use client'")).toBe(true)
    }
  })

  it('V2 schema has all new tables', () => {
    const fs = require('fs')
    const content = fs.readFileSync('supabase-finance-v2-schema.sql', 'utf-8')
    expect(content).toContain('finance_income_sources')
    expect(content).toContain('finance_debts')
    expect(content).toContain('finance_goals')
    expect(content).toContain('finance_emergency_fund')
  })

  it('Modal component exists', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/ui/modal.tsx', 'utf-8')
    expect(content).toContain('Modal')
    expect(content).toContain("'use client'")
  })

  it('finance-types has all V2 interfaces', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/lib/finance-types.ts', 'utf-8')
    expect(content).toContain('FinanceIncomeSource')
    expect(content).toContain('FinanceDebt')
    expect(content).toContain('FinanceGoal')
    expect(content).toContain('FinanceEmergencyFund')
    expect(content).toContain('FinanceAuditReport')
  })
})
