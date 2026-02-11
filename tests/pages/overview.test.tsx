/**
 * Unit Tests — Overview Page V2 (client-side with real-time)
 * Tests: KPI cards, Team Pulse, Leaderboard, Completion Rate,
 *        Recent Tasks, Live Comms, real-time subscriptions, mobile layout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

// Mock recharts (used by SparklineChart and themed-charts)
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  RadialBarChart: ({ children }: any) => <div data-testid="radial-bar-chart">{children}</div>,
  RadialBar: () => <div data-testid="radial-bar" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  Tooltip: () => null,
}))

// Mock lucide-react icons — must include all icons used across imported modules
vi.mock('lucide-react', () => {
  const icon = (name: string) => (props: any) => <svg data-testid={`icon-${name.toLowerCase()}`} {...props} />
  return {
    Users: icon('users'),
    CheckSquare: icon('checksquare'),
    MessageCircle: icon('messagecircle'),
    Activity: icon('activity'),
    Clock: icon('clock'),
    Trophy: icon('trophy'),
    Shield: icon('shield'),
    Code: icon('code'),
    Search: icon('search'),
    FileText: icon('filetext'),
    TestTube: icon('testtube'),
    Palette: icon('palette'),
    Telescope: icon('telescope'),
    Mail: icon('mail'),
    FlaskConical: icon('flaskconical'),
    LayoutDashboard: icon('layoutdashboard'),
    Radio: icon('radio'),
    Zap: icon('zap'),
    SquareCheckBig: icon('squarecheckbig'),
    Settings: icon('settings'),
    ChevronLeft: icon('chevronleft'),
    ChevronRight: icon('chevronright'),
    Minus: icon('minus'),
    Plus: icon('plus'),
    ChevronsLeft: icon('chevronsleft'),
    ChevronsRight: icon('chevronsright'),
    Home: icon('home'),
    LayoutGrid: icon('layoutgrid'),
    BarChart3: icon('barchart3'),
    TrendingUp: icon('trendingup'),
    TrendingDown: icon('trendingdown'),
  }
})

const mockAgents = [
  { id: 'tars', name: 'TARS', role: 'Squad Lead', status: 'online', current_task: 'Coordinating', last_seen: '2026-02-08T17:00:00Z' },
  { id: 'cooper', name: 'COOPER', role: 'Developer', status: 'busy', current_task: 'Building', last_seen: '2026-02-08T17:30:00Z' },
  { id: 'murph', name: 'MURPH', role: 'Research', status: 'offline', current_task: null, last_seen: '2026-02-08T16:00:00Z' },
  { id: 'brand', name: 'BRAND', role: 'Docs', status: 'online', current_task: 'Writing', last_seen: '2026-02-08T17:00:00Z' },
  { id: 'mann', name: 'MANN', role: 'QA', status: 'online', current_task: 'Testing', last_seen: '2026-02-08T17:00:00Z' },
  { id: 'tom', name: 'TOM', role: 'Design', status: 'idle', current_task: null, last_seen: '2026-02-08T16:00:00Z' },
]

const mockTickets = [
  { id: '1', title: 'Build dashboard V2', status: 'in-progress', priority: 'critical', assignee: 'cooper' },
  { id: '2', title: 'Write tests for V2', status: 'done', priority: 'high', assignee: 'mann' },
  { id: '3', title: 'Research competitors', status: 'done', priority: 'medium', assignee: 'murph' },
  { id: '4', title: 'Design tokens', status: 'done', priority: 'high', assignee: 'tom' },
  { id: '5', title: 'Groom leads sheet', status: 'todo', priority: 'low', assignee: 'brand' },
  { id: '6', title: 'Sprint planning', status: 'backlog', priority: 'medium', assignee: 'tars' },
]

const mockMessages = [
  { id: '1', sender: 'tars', recipient: 'all', content: 'Squad standup at 8', message_type: 'broadcast', created_at: '2026-02-11T14:00:00Z' },
  { id: '2', sender: 'cooper', recipient: 'mann', content: 'Phase 2 merged, go test', message_type: 'chat', created_at: '2026-02-11T02:00:00Z' },
  { id: '3', sender: 'mann', recipient: 'cooper', content: 'On it', message_type: 'chat', created_at: '2026-02-11T02:05:00Z' },
]

function setupMocks(agents = mockAgents, tickets = mockTickets, messages = mockMessages) {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  vi.mocked(supabase.channel).mockReturnValue(mockChannel as any)
  vi.mocked(supabase.removeChannel).mockReturnValue(undefined as any)

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const getData = () => table === 'agents' ? agents : table === 'tickets' ? tickets : table === 'messages' ? messages : []
    const result = Promise.resolve({ data: getData(), error: null })
    // Make the promise also have .order().limit() chain for messages query
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

describe('Overview Page V2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    setupMocks()
  })

  // ── Rendering ──

  it('renders page header', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
    expect(screen.getByText(/Interstellar Squad/)).toBeInTheDocument()
  })

  it('renders all 4 KPI card titles', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Agents Online')).toBeInTheDocument()
    })
    expect(screen.getByText('Open Tasks')).toBeInTheDocument()
    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders KPI icons', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByTestId('icon-users')).toBeInTheDocument()
    })
    expect(screen.getByTestId('icon-checksquare')).toBeInTheDocument()
    expect(screen.getByTestId('icon-messagecircle')).toBeInTheDocument()
    expect(screen.getByTestId('icon-activity')).toBeInTheDocument()
  })

  it('renders Team Pulse section with radial progress', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Team Pulse')).toBeInTheDocument()
    })
    // RadialProgress sublabel
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('renders Leaderboard section with trophy', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Leaderboard')).toBeInTheDocument()
    })
    expect(screen.getByTestId('icon-trophy')).toBeInTheDocument()
  })

  it('renders Completion Rate section', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Completion Rate')).toBeInTheDocument()
    })
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Total')).toBeInTheDocument()
  })

  it('renders Recent Tasks section', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Recent Tasks')).toBeInTheDocument()
    })
  })

  it('renders Live Comms section with pulse indicator', async () => {
    const Page = (await import('@/app/page')).default
    const { container } = render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Live Comms')).toBeInTheDocument()
    })
    // Pulse dot
    const pulseDot = container.querySelector('.animate-pulse')
    expect(pulseDot).toBeInTheDocument()
  })

  // ── Data Accuracy ──

  it('shows correct online agent count in Team Pulse', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    // 5 online (tars, cooper-busy counts as not offline, brand, mann, tom-idle not offline)
    // Actually: agents.filter(a => a.status !== 'offline') = tars(online), cooper(busy), brand(online), mann(online), tom(idle) = 5
    await waitFor(() => {
      expect(screen.getByText('5/6')).toBeInTheDocument()
    })
  })

  it('calculates correct completion rate', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    // 3 done out of 6 total = 50%
    await waitFor(() => {
      expect(screen.getByText('50%')).toBeInTheDocument()
    })
    expect(screen.getByText('Tasks Done')).toBeInTheDocument()
  })

  it('shows leaderboard medals for top 3', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('🥇')).toBeInTheDocument()
    })
    expect(screen.getByText('🥈')).toBeInTheDocument()
    expect(screen.getByText('🥉')).toBeInTheDocument()
  })

  it('renders ticket titles in Recent Tasks', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Build dashboard V2')).toBeInTheDocument()
    })
    expect(screen.getByText('Write tests for V2')).toBeInTheDocument()
  })

  it('renders ticket status badges', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('in-progress')).toBeInTheDocument()
    })
    expect(screen.getAllByText('done').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('todo')).toBeInTheDocument()
  })

  it('renders Live Comms messages with sender names', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('TARS')).toBeInTheDocument()
    })
    expect(screen.getByText('Squad standup at 8')).toBeInTheDocument()
    expect(screen.getByText('Phase 2 merged, go test')).toBeInTheDocument()
  })

  it('shows total ticket count badge', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('6 total')).toBeInTheDocument()
    })
  })

  // ── Real-time Subscriptions ──

  it('sets up real-time channel subscription on mount', async () => {
    const mockChannel = setupMocks()
    const Page = (await import('@/app/page')).default
    render(<Page />)

    await waitFor(() => {
      expect(supabase.channel).toHaveBeenCalledWith('overview-realtime')
    })
    expect(mockChannel.on).toHaveBeenCalledTimes(3) // agents, tickets, messages
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1)
  })

  it('subscribes to agents, tickets, and messages tables', async () => {
    const mockChannel = setupMocks()
    const Page = (await import('@/app/page')).default
    render(<Page />)

    await waitFor(() => {
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({ table: 'agents' }),
        expect.any(Function)
      )
    })
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'tickets' }),
      expect.any(Function)
    )
    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({ table: 'messages' }),
      expect.any(Function)
    )
  })

  // ── Edge Cases ──

  it('handles empty data gracefully', async () => {
    setupMocks([], [], [])
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
    // Live Comms shows empty state
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
    // Completion rate should be 0% (no tickets)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('handles null supabase data', async () => {
    // Override mocks to return null data
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: { message: 'fail' } })),
        }),
        then: vi.fn((cb: any) => cb({ data: null, error: { message: 'fail' } })),
      }),
    }) as any)

    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })

  it('renders all 6 agent names in leaderboard', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Leaderboard')).toBeInTheDocument()
    })
    // agentConfigs has all 6 agents
    for (const name of ['TARS', 'COOPER', 'MURPH', 'BRAND', 'MANN', 'TOM']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  // ── Priority Borders ──

  it('renders critical priority with red left border', async () => {
    const Page = (await import('@/app/page')).default
    const { container } = render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Build dashboard V2')).toBeInTheDocument()
    })
    const criticalTask = screen.getByText('Build dashboard V2').closest('[class*="border-l-"]')
    expect(criticalTask?.className).toContain('border-l-red-500')
  })

  it('renders low priority with slate left border', async () => {
    const Page = (await import('@/app/page')).default
    render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Groom leads sheet')).toBeInTheDocument()
    })
    const lowTask = screen.getByText('Groom leads sheet').closest('[class*="border-l-"]')
    expect(lowTask?.className).toContain('border-l-slate-500')
  })

  // ── Layout Structure ──

  it('KPI grid uses responsive columns (2-col mobile, 4-col lg)', async () => {
    const Page = (await import('@/app/page')).default
    const { container } = render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Agents Online')).toBeInTheDocument()
    })
    const kpiGrid = container.querySelector('[data-animate]')
    expect(kpiGrid).toBeInTheDocument()
    expect(kpiGrid?.className).toContain('grid-cols-2')
    expect(kpiGrid?.className).toContain('lg:grid-cols-4')
  })

  it('Recent Tasks spans 3 cols, Live Comms spans 2 on lg', async () => {
    const Page = (await import('@/app/page')).default
    const { container } = render(<Page />)
    await waitFor(() => {
      expect(screen.getByText('Recent Tasks')).toBeInTheDocument()
    })
    const tasksCard = screen.getByText('Recent Tasks').closest('.lg\\:col-span-3')
    expect(tasksCard).toBeInTheDocument()
    const commsCard = screen.getByText('Live Comms').closest('.lg\\:col-span-2')
    expect(commsCard).toBeInTheDocument()
  })
})
