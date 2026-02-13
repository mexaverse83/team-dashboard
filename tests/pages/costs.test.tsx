/**
 * Unit Tests — Costs Page (commit 05f5254 + 8a72f6b)
 * Tests the rebuilt costs-client.tsx with:
 *   - Today/7d/30d date range toggle
 *   - All/Anthropic/Gemini model filter
 *   - Stacked area chart with agent toggle pills
 *   - KPIs: Total Spend, Avg/Agent/Day, Top Spender, Cost Trend
 *   - Per-agent breakdown cards with sparklines
 *   - Horizontal stacked bar (token usage by type)
 *   - Seed data fallback when Supabase table is missing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

// Mock recharts — AreaChart replaces LineChart in this version
vi.mock('recharts', () => ({
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: any) => <div data-testid="pie">{children}</div>,
  Cell: () => null,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Tooltip: () => null,
  Legend: () => null,
}))

// Mock SparklineChart
vi.mock('@/components/ui/sparkline-chart', () => ({
  SparklineChart: ({ data }: any) => <div data-testid="sparkline" data-points={data?.length || 0} />,
}))

// Mock lucide-react
vi.mock('lucide-react', () => {
  const i = (n: string) => (props: any) => <svg data-testid={`icon-${n}`} {...props} />
  return {
    Shield: i('shield'), Code: i('code'), Telescope: i('telescope'),
    Mail: i('mail'), FlaskConical: i('flaskconical'), Palette: i('palette'),
    Server: i('server'), Users: i('users'), DollarSign: i('dollarsign'),
    Home: i('home'), Zap: i('zap'), LayoutGrid: i('layoutgrid'),
    MessageCircle: i('messagecircle'), BarChart3: i('barchart3'),
    ChevronsLeft: i('chevronsleft'), ChevronsRight: i('chevronsright'),
    TrendingUp: i('trendingup'), TrendingDown: i('trendingdown'),
    Inbox: i('inbox'), Activity: i('activity'), CheckSquare: i('checksquare'),
    Trophy: i('trophy'), Minus: i('minus'), Plus: i('plus'),
    Radio: i('radio'), SquareCheckBig: i('squarecheckbig'),
  }
})

const now = new Date()
const mockCosts = [
  { id: '1', agent_name: 'cooper', timestamp: new Date(now.getTime() - 1000 * 60 * 60).toISOString(), model: 'claude-opus-4-6', tokens_in: 5000, tokens_out: 3000, cache_read: 2000, cache_write: 1000, cost_usd: 0.285, session_id: 'sess-1', created_at: now.toISOString() },
  { id: '2', agent_name: 'tars', timestamp: new Date(now.getTime() - 1000 * 60 * 120).toISOString(), model: 'claude-opus-4-6', tokens_in: 2500, tokens_out: 1200, cache_read: 1500, cache_write: 500, cost_usd: 0.135, session_id: 'sess-2', created_at: now.toISOString() },
  { id: '3', agent_name: 'mann', timestamp: new Date(now.getTime() - 1000 * 60 * 180).toISOString(), model: 'claude-opus-4-6', tokens_in: 4000, tokens_out: 2000, cache_read: 3000, cache_write: 800, cost_usd: 0.224, session_id: 'sess-3', created_at: now.toISOString() },
  { id: '4', agent_name: 'murph', timestamp: new Date(now.getTime() - 1000 * 60 * 240).toISOString(), model: 'gemini-2.5-pro', tokens_in: 6000, tokens_out: 2500, cache_read: 4000, cache_write: 0, cost_usd: 0.021, session_id: 'sess-4', created_at: now.toISOString() },
  { id: '5', agent_name: 'hashimoto', timestamp: new Date(now.getTime() - 1000 * 60 * 300).toISOString(), model: 'claude-opus-4-6', tokens_in: 3000, tokens_out: 1500, cache_read: 2000, cache_write: 600, cost_usd: 0.168, session_id: 'sess-5', created_at: now.toISOString() },
]

function setupMocks(costs = mockCosts, error: any = null) {
  const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  vi.mocked(supabase.channel).mockReturnValue(mockChannel as any)
  vi.mocked(supabase.removeChannel).mockReturnValue(undefined as any)
  vi.mocked(supabase.from).mockImplementation(() => {
    const result = Promise.resolve({ data: costs, error })
    return {
      select: vi.fn().mockReturnValue(
        Object.assign(result, {
          order: vi.fn().mockReturnValue(result),
        })
      ),
    } as any
  })
  return mockChannel
}

describe('Costs Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  // --- Header ---
  it('renders page header', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Costs')).toBeInTheDocument()
    })
    expect(screen.getByText('Agent spend and token usage')).toBeInTheDocument()
  })

  // --- KPI Strip ---
  it('renders 4 KPI cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Total Spend')).toBeInTheDocument()
    })
    expect(screen.getByText('Avg / Agent / Day')).toBeInTheDocument()
    expect(screen.getByText('Top Spender')).toBeInTheDocument()
    expect(screen.getByText('Cost Trend')).toBeInTheDocument()
  })

  it('renders KPI icons', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByTestId('icon-dollarsign')).toBeInTheDocument()
      expect(screen.getByTestId('icon-users')).toBeInTheDocument()
      expect(screen.getByTestId('icon-trendingup')).toBeInTheDocument()
      expect(screen.getByTestId('icon-activity')).toBeInTheDocument()
    })
  })

  it('shows top spender agent name and avatar', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      // Cooper has highest cost in mock data ($0.285)
      const img = screen.getAllByRole('img').find(i => (i as HTMLImageElement).alt === 'COOPER')
      expect(img).toBeDefined()
    })
  })

  it('renders sparklines in KPI cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      const sparklines = screen.getAllByTestId('sparkline')
      // At least 2 sparklines: Total Spend + Cost Trend KPIs
      expect(sparklines.length).toBeGreaterThanOrEqual(2)
    })
  })

  // --- Date Range Toggle ---
  it('renders date range toggle (Today/7d/30d)', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument()
      expect(screen.getByText('7d')).toBeInTheDocument()
      expect(screen.getByText('30d')).toBeInTheDocument()
    })
  })

  it('7d is selected by default', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('7d')).toHaveClass('bg-blue-600')
    })
  })

  it('clicking date range changes selection', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => expect(screen.getByText('30d')).toBeInTheDocument())
    fireEvent.click(screen.getByText('30d'))
    expect(screen.getByText('30d')).toHaveClass('bg-blue-600')
    expect(screen.getByText('7d')).not.toHaveClass('bg-blue-600')
  })

  // --- Model Filter ---
  it('renders model filter (All/Anthropic/Gemini)', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const filterTexts = buttons.map(b => b.textContent)
      expect(filterTexts).toContain('All')
      expect(filterTexts).toContain('🟣 Anthropic')
      expect(filterTexts).toContain('🔵 Gemini')
    })
  })

  it('clicking model filter changes selection', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      const buttons = screen.getAllByRole('button')
      const geminiBtn = buttons.find(b => b.textContent === '🔵 Gemini')
      expect(geminiBtn).toBeDefined()
      fireEvent.click(geminiBtn!)
      expect(geminiBtn!).toHaveClass('border')
    })
  })

  // --- Charts ---
  it('renders stacked area chart for Daily Spend', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Daily Spend')).toBeInTheDocument()
      expect(screen.getByTestId('area-chart')).toBeInTheDocument()
    })
  })

  it('renders agent toggle pills on area chart', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      // 7 agent toggle buttons (as small avatar images)
      const imgs = screen.getAllByRole('img')
      // At least 7 agent avatars for the toggle pills
      expect(imgs.length).toBeGreaterThanOrEqual(7)
    })
  })

  it('renders Cost Distribution donut chart', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Cost Distribution')).toBeInTheDocument()
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    })
  })

  it('renders Token Usage by Type horizontal bar chart', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Token Usage by Type')).toBeInTheDocument()
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })
  })

  it('renders token type legend (Input/Output/Cache)', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Input')).toBeInTheDocument()
      expect(screen.getByText('Output')).toBeInTheDocument()
      expect(screen.getByText('Cache')).toBeInTheDocument()
    })
  })

  // --- Per-Agent Breakdown ---
  it('renders Agent Breakdown section', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Agent Breakdown')).toBeInTheDocument()
    })
  })

  it('shows agent cards with names', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getAllByText(/COOPER/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/TARS/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/MANN/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/HASHIMOTO/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows model badges in agent cards (Opus/Gemini)', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getAllByText(/Opus 4.6/).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Gemini/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows token breakdown in agent cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Input tokens').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Output tokens').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Cache tokens').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows cost per interaction in agent cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getAllByText('Cost / interaction').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('renders sparklines in agent cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      const sparklines = screen.getAllByTestId('sparkline')
      // 2 KPI sparklines + 5 agent card sparklines (5 agents in mock data)
      expect(sparklines.length).toBeGreaterThanOrEqual(7)
    })
  })

  // --- Real-time ---
  it('subscribes to costs-realtime channel', async () => {
    const mockChannel = setupMocks()
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    expect(supabase.channel).toHaveBeenCalledWith('costs-realtime')
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('listens for INSERT events on agent_costs table', async () => {
    const mockChannel = setupMocks()
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'agent_costs' },
      expect.any(Function)
    )
  })

  // --- Seed data fallback ---
  it('falls back to seed data when supabase returns error', async () => {
    setupMocks(null as any, { message: 'relation does not exist' })
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      // Should still render — uses SEED_COSTS
      expect(screen.getByText('Costs')).toBeInTheDocument()
      expect(screen.getByText('Agent Breakdown')).toBeInTheDocument()
    })
  })

  it('falls back to seed data when supabase returns empty array', async () => {
    setupMocks([])
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Costs')).toBeInTheDocument()
      // With seed data, should have all 7 agents
      expect(screen.getByText('Agent Breakdown')).toBeInTheDocument()
    })
  })

  // --- Loading state ---
  it('shows loading skeleton initially', async () => {
    // Make supabase never resolve
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue(new Promise(() => {})),
      }),
    } as any))
    const CostsClient = (await import('@/components/costs-client')).default
    const { container } = render(<CostsClient />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  // --- Architecture ---
  it('page.tsx is a server component wrapper', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/costs/page.tsx', 'utf-8')
    expect(content).not.toMatch(/^'use client'/)
    expect(content).toContain('CostsClient')
    expect(content).toContain('export const metadata')
  })

  it('costs-client.tsx has use client directive', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/costs-client.tsx', 'utf-8')
    expect(content.startsWith("'use client'")).toBe(true)
  })

  it('loading.tsx has skeleton with animate-pulse', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/costs/loading.tsx', 'utf-8')
    expect(content).toContain('SkeletonKPI')
    expect(content).toContain('animate-pulse')
  })

  it('seed-costs.ts generates data for all 7 agents', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/lib/seed-costs.ts', 'utf-8')
    for (const agent of ['tars', 'cooper', 'murph', 'brand', 'mann', 'tom', 'hashimoto']) {
      expect(content).toContain(`'${agent}'`)
    }
  })

  it('supabase schema has agent_costs table with RLS', () => {
    const fs = require('fs')
    const content = fs.readFileSync('supabase-costs-schema.sql', 'utf-8')
    expect(content).toContain('CREATE TABLE')
    expect(content).toContain('agent_costs')
    expect(content).toContain('ENABLE ROW LEVEL SECURITY')
    expect(content).toContain('supabase_realtime')
  })
})
