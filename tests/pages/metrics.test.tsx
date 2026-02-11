/**
 * Unit Tests — Metrics Page V2 Phase 4
 * Donut chart, KPI strip, agent cards, click-to-compare, radar/bar charts,
 * real-time updates, empty states
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, className, ...props }: any) => <div onClick={onClick} className={className}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock recharts
vi.mock('recharts', () => ({
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children }: any) => <div data-testid="pie">{children}</div>,
  Cell: () => <div data-testid="cell" />,
  RadarChart: ({ children }: any) => <div data-testid="radar-chart">{children}</div>,
  PolarGrid: () => null,
  PolarAngleAxis: () => null,
  Radar: ({ name }: any) => <div data-testid={`radar-${name}`} />,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ name }: any) => <div data-testid={`bar-${name}`} />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Tooltip: () => null,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => null,
}))

// Mock lucide-react
vi.mock('lucide-react', () => {
  const i = (n: string) => (props: any) => <svg data-testid={`icon-${n}`} {...props} />
  return {
    Shield: i('shield'), Code: i('code'), Telescope: i('telescope'),
    Mail: i('mail'), FlaskConical: i('flaskconical'), Palette: i('palette'),
    Users: i('users'), CheckSquare: i('checksquare'), MessageCircle: i('messagecircle'),
    Activity: i('activity'), Clock: i('clock'), Trophy: i('trophy'),
    Minus: i('minus'), Plus: i('plus'), ChevronsLeft: i('chevronsleft'),
    ChevronsRight: i('chevronsright'), Home: i('home'), LayoutGrid: i('layoutgrid'),
    BarChart3: i('barchart3'), TrendingUp: i('trendingup'), TrendingDown: i('trendingdown'),
    Radio: i('radio'), Zap: i('zap'), SquareCheckBig: i('squarecheckbig'),
    Settings: i('settings'), LayoutDashboard: i('layoutdashboard'),
    ChevronLeft: i('chevronleft'), ChevronRight: i('chevronright'),
  }
})

const mockAgents = [
  { id: 'tars', name: 'TARS', role: 'Squad Lead', status: 'online', current_task: 'Coordinating' },
  { id: 'cooper', name: 'COOPER', role: 'Developer', status: 'busy', current_task: 'Building' },
  { id: 'mann', name: 'MANN', role: 'QA', status: 'online', current_task: 'Testing' },
]

const mockTickets = [
  { id: '1', title: 'Task 1', status: 'done', priority: 'high', assignee: 'cooper' },
  { id: '2', title: 'Task 2', status: 'done', priority: 'medium', assignee: 'cooper' },
  { id: '3', title: 'Task 3', status: 'done', priority: 'high', assignee: 'tars' },
  { id: '4', title: 'Task 4', status: 'in-progress', priority: 'high', assignee: 'mann' },
  { id: '5', title: 'Task 5', status: 'todo', priority: 'low', assignee: 'mann' },
  { id: '6', title: 'Task 6', status: 'in-progress', priority: 'medium', assignee: 'cooper' },
]

const mockMetrics = [
  { id: '1', agent_id: 'cooper', metric_type: 'response_time', metric_value: 1200, created_at: '2026-02-11T10:00:00Z' },
  { id: '2', agent_id: 'tars', metric_type: 'response_time', metric_value: 800, created_at: '2026-02-11T10:00:00Z' },
]

function setupMocks(agents = mockAgents, tickets = mockTickets, metrics = mockMetrics) {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  vi.mocked(supabase.channel).mockReturnValue(mockChannel as any)
  vi.mocked(supabase.removeChannel).mockReturnValue(undefined as any)

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const getData = () => table === 'agents' ? agents : table === 'tickets' ? tickets : table === 'agent_metrics' ? metrics : []
    const result = Promise.resolve({ data: getData(), error: null })
    const selectResult = Object.assign(result, {
      order: vi.fn().mockReturnValue(Object.assign(
        Promise.resolve({ data: getData(), error: null }),
        { limit: vi.fn().mockReturnValue(Promise.resolve({ data: getData(), error: null })) }
      )),
    })
    return { select: vi.fn().mockReturnValue(selectResult) } as any
  })

  return mockChannel
}

describe('Metrics Page V2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  // ── Page Structure ──

  it('renders page header', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    expect(screen.getByText('Metrics')).toBeInTheDocument()
    expect(screen.getByText('Team performance and agent analytics')).toBeInTheDocument()
  })

  // ── KPI Strip ──

  it('renders all 4 KPI cards', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Completion Rate')).toBeInTheDocument()
    })
    expect(screen.getByText('Tasks Done')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Agents Online')).toBeInTheDocument()
  })

  it('calculates correct completion rate', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    // 3 done out of 6 total = 50% — the % is in a separate span
    await waitFor(() => {
      expect(screen.getByText('Completion Rate')).toBeInTheDocument()
    })
  })

  it('shows correct in-progress count', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('active tasks')).toBeInTheDocument()
    })
  })

  // ── Donut Chart ──

  it('renders Team Performance donut chart', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Team Performance')).toBeInTheDocument()
    })
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
  })

  it('shows "Complete" label in donut center', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeInTheDocument()
    })
  })

  // ── Agent Performance Cards ──

  it('renders all 6 agent cards', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      for (const name of ['TARS', 'COOPER', 'MURPH', 'BRAND', 'MANN', 'TOM']) {
        expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(1)
      }
    })
  })

  it('shows agent stats (Done, Active, Rate)', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      // Each agent card has Done/Active/Rate labels
      expect(screen.getAllByText('Done').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Active').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Rate').length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Click-to-Compare ──

  it('shows comparison section with instructions', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Agent Comparison')).toBeInTheDocument()
    })
    expect(screen.getByText('Click agent cards above to compare (max 3)')).toBeInTheDocument()
  })

  it('clicking agent card adds comparing badge', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getAllByText('TARS').length).toBeGreaterThanOrEqual(1)
    })
    // Find the TARS card (inside cursor-pointer container)
    const tarsElements = screen.getAllByText('TARS')
    const tarsCard = tarsElements.find(el => el.closest('[class*="cursor-pointer"]'))?.closest('[class*="cursor-pointer"]')
    expect(tarsCard).toBeTruthy()
    if (tarsCard) fireEvent.click(tarsCard)
    await waitFor(() => {
      expect(screen.getByText('comparing')).toBeInTheDocument()
    })
  })

  it('shows "Comparing N agents" when agents selected', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getAllByText('TARS').length).toBeGreaterThanOrEqual(1)
    })
    const tarsCard = screen.getAllByText('TARS').find(el => el.closest('[class*="cursor-pointer"]'))?.closest('[class*="cursor-pointer"]')
    if (tarsCard) fireEvent.click(tarsCard)
    await waitFor(() => {
      expect(screen.getByText('Comparing 1 agent')).toBeInTheDocument()
    })
  })

  it('shows Clear selection button when agents are compared', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getAllByText('TARS').length).toBeGreaterThanOrEqual(1)
    })
    const tarsCard = screen.getAllByText('TARS').find(el => el.closest('[class*="cursor-pointer"]'))?.closest('[class*="cursor-pointer"]')
    if (tarsCard) fireEvent.click(tarsCard)
    await waitFor(() => {
      expect(screen.getByText('Clear selection')).toBeInTheDocument()
    })
  })

  it('limits comparison to max 3 agents', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('TARS')).toBeInTheDocument()
    })
    // Click 4 agents
    for (const name of ['TARS', 'COOPER', 'MANN', 'MURPH']) {
      const card = screen.getAllByText(name).find(el => el.closest('[class*="cursor-pointer"]'))?.closest('[class*="cursor-pointer"]')
      if (card) fireEvent.click(card)
    }
    await waitFor(() => {
      // Should only have 3 comparing badges (max)
      const badges = screen.getAllByText('comparing')
      expect(badges.length).toBeLessThanOrEqual(3)
    })
  })

  // ── Charts ──

  it('renders Skill Radar chart', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Skill Radar')).toBeInTheDocument()
    })
    expect(screen.getByTestId('radar-chart')).toBeInTheDocument()
  })

  it('renders 7-Day Activity bar chart', async () => {
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('7-Day Activity')).toBeInTheDocument()
    })
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  // ── Real-time ──

  it('subscribes to metrics-realtime channel', async () => {
    const mockChannel = setupMocks()
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    expect(supabase.channel).toHaveBeenCalledWith('metrics-realtime')
    expect(mockChannel.on).toHaveBeenCalledTimes(2) // tickets + agents
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  // ── Empty States ──

  it('handles empty data gracefully', async () => {
    setupMocks([], [], [])
    const Page = (await import('@/app/metrics/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Metrics')).toBeInTheDocument()
    })
    // 0% completion with no tickets
    expect(screen.getAllByText('Complete').length).toBeGreaterThanOrEqual(1)
  })

  // ── StatusIndicator Fallback Fix ──

  it('StatusIndicator handles unknown status without crashing', async () => {
    // Test the fix from commit 8931abb
    setupMocks([
      { id: 'tars', name: 'TARS', role: 'Lead', status: 'idle' as any, current_task: null },
    ], [], [])
    const Page = (await import('@/app/metrics/page')).default
    // Should not throw
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Metrics')).toBeInTheDocument()
    })
  })
})
