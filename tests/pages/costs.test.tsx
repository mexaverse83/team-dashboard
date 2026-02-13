/**
 * Unit Tests — Costs Page (client component with real-time)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

// Mock recharts
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
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
    Settings: i('settings'), LayoutDashboard: i('layoutdashboard'),
    ChevronLeft: i('chevronleft'), ChevronRight: i('chevronright'),
    Search: i('search'),
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

function setupMocks(costs = mockCosts) {
  const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
  vi.mocked(supabase.channel).mockReturnValue(mockChannel as any)
  vi.mocked(supabase.removeChannel).mockReturnValue(undefined as any)
  vi.mocked(supabase.from).mockImplementation(() => {
    const result = Promise.resolve({ data: costs, error: null })
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

  it('renders page header', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText(/Costs/)).toBeInTheDocument()
    })
    expect(screen.getByText('Per-agent API spend and token analytics')).toBeInTheDocument()
  })

  it('renders 4 KPI cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Total Spend')).toBeInTheDocument()
    })
    expect(screen.getByText('Tokens In')).toBeInTheDocument()
    expect(screen.getByText('Tokens Out')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
  })

  it('renders time range toggle buttons', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Daily')).toBeInTheDocument()
    })
    expect(screen.getByText('Weekly')).toBeInTheDocument()
    expect(screen.getByText('Monthly')).toBeInTheDocument()
  })

  it('weekly is selected by default', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      const weeklyBtn = screen.getByText('Weekly')
      expect(weeklyBtn).toHaveClass('bg-blue-600')
    })
  })

  it('renders Daily Spend line chart', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Daily Spend')).toBeInTheDocument()
    })
    expect(screen.getByTestId('line-chart')).toBeInTheDocument()
  })

  it('renders Cost Distribution donut chart', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Cost Distribution')).toBeInTheDocument()
    })
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('renders Token Breakdown bar chart', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Token Breakdown by Agent')).toBeInTheDocument()
    })
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('renders per-agent breakdown section', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Per-Agent Breakdown')).toBeInTheDocument()
    })
  })

  it('shows agent names in breakdown cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getAllByText(/Cooper/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Tars/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Mann/i).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows model name in agent cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getAllByText('claude-opus-4-6').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('gemini-2.5-pro').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('shows token stats in agent cards', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      // Should show "Tokens In", "Tokens Out", "Cache Read", "Sessions" labels
      expect(screen.getAllByText('Tokens In').length).toBeGreaterThanOrEqual(2) // KPI + cards
    })
  })

  it('subscribes to costs-realtime channel', async () => {
    const mockChannel = setupMocks()
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    expect(supabase.channel).toHaveBeenCalledWith('costs-realtime')
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('clicking time range changes selection', async () => {
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText('Daily')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Monthly'))
    expect(screen.getByText('Monthly')).toHaveClass('bg-blue-600')
  })

  it('handles empty data gracefully', async () => {
    setupMocks([])
    const CostsClient = (await import('@/components/costs-client')).default
    render(<CostsClient />)
    await waitFor(() => {
      expect(screen.getByText(/Costs/)).toBeInTheDocument()
    })
  })

  it('page is a server component wrapper', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/costs/page.tsx', 'utf-8')
    expect(content).not.toMatch(/^'use client'/)
    expect(content).toContain('CostsClient')
    expect(content).toContain('export const metadata')
  })

  it('has loading skeleton', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/costs/loading.tsx', 'utf-8')
    expect(content).toContain('SkeletonKPI')
    expect(content).toContain('animate-pulse')
  })
})
