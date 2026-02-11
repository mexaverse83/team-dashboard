/**
 * Unit Tests — Mission Control Page V2 Phase 3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// Mock recharts
vi.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  Tooltip: () => null,
}))

// Mock lucide-react — all icons used by mission-control + agents.ts + sidebar
vi.mock('lucide-react', () => {
  const i = (n: string) => (props: any) => <svg data-testid={`icon-${n}`} {...props} />
  return {
    Radio: i('radio'), CheckSquare: i('checksquare'), Zap: i('zap'),
    Clock: i('clock'), User: i('user'), Shield: i('shield'), Code: i('code'),
    Telescope: i('telescope'), Mail: i('mail'), FlaskConical: i('flaskconical'),
    Palette: i('palette'), Users: i('users'), MessageCircle: i('messagecircle'),
    Activity: i('activity'), Trophy: i('trophy'), Minus: i('minus'),
    Plus: i('plus'), ChevronsLeft: i('chevronsleft'), ChevronsRight: i('chevronsright'),
    Home: i('home'), LayoutGrid: i('layoutgrid'), BarChart3: i('barchart3'),
    TrendingUp: i('trendingup'), TrendingDown: i('trendingdown'),
    SquareCheckBig: i('squarecheckbig'), Settings: i('settings'),
    Search: i('search'), LayoutDashboard: i('layoutdashboard'),
    ChevronLeft: i('chevronleft'), ChevronRight: i('chevronright'),
  }
})

const mockAgents = [
  { id: 'tars', name: 'TARS', role: 'Squad Lead', status: 'online', current_task: 'Coordinating', last_seen: '2026-02-08T17:00:00Z' },
  { id: 'cooper', name: 'COOPER', role: 'Developer', status: 'busy', current_task: 'Building dashboard', last_seen: '2026-02-08T17:30:00Z' },
  { id: 'mann', name: 'MANN', role: 'QA', status: 'online', current_task: 'Testing', last_seen: '2026-02-08T17:30:00Z' },
]

const mockTickets = [
  { id: '1', title: 'Task 1', status: 'in-progress', priority: 'high', assignee: 'cooper' },
  { id: '2', title: 'Task 2', status: 'done', priority: 'medium', assignee: 'tars' },
  { id: '3', title: 'Task 3', status: 'done', priority: 'low', assignee: 'mann' },
]

const mockMessages = [
  { id: '1', sender: 'tars', recipient: 'all', content: 'Status check', message_type: 'broadcast', created_at: '2026-02-08T17:00:00Z' },
  { id: '2', sender: 'mann', recipient: 'cooper', content: 'Tests passing', message_type: 'chat', created_at: '2026-02-08T17:30:00Z' },
]

function setupMocks() {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }

  vi.mocked(supabase.channel).mockReturnValue(mockChannel as any)
  vi.mocked(supabase.removeChannel).mockReturnValue(undefined as any)

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    const getData = () => table === 'agents' ? mockAgents : table === 'tickets' ? mockTickets : table === 'messages' ? mockMessages : []
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

describe('Mission Control Page V2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupMocks()
  })

  it('renders page title', async () => {
    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
  })

  it('renders subtitle', async () => {
    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    expect(screen.getByText('Real-time agent monitoring and communications')).toBeInTheDocument()
  })

  it('renders global status bar with online count', async () => {
    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    await waitFor(() => {
      expect(screen.getByText('Online')).toBeInTheDocument()
    })
  })

  it('renders Live Activity section', async () => {
    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    expect(screen.getByText('Live Activity')).toBeInTheDocument()
  })

  it('subscribes to mc-realtime channel', async () => {
    const mockChannel = setupMocks()
    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    expect(supabase.channel).toHaveBeenCalledWith('mc-realtime')
    expect(mockChannel.on).toHaveBeenCalledTimes(3) // agents, messages, tickets
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('renders agent cards in grid', async () => {
    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    await waitFor(() => {
      // Agent cards should show agent names — may appear in multiple places (cards + messages)
      expect(screen.getAllByText('TARS').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('COOPER').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('displays messages in feed', async () => {
    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    await waitFor(() => {
      expect(screen.getByText('Status check')).toBeInTheDocument()
      expect(screen.getByText('Tests passing')).toBeInTheDocument()
    })
  })

  it('shows status bar metrics', async () => {
    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument()
      expect(screen.getByText('Done')).toBeInTheDocument()
      expect(screen.getByText('Messages')).toBeInTheDocument()
    })
  })

  it('handles empty data gracefully', async () => {
    vi.mocked(supabase.from).mockImplementation(() => {
      const result = Promise.resolve({ data: [], error: null })
      const selectResult = Object.assign(result, {
        order: vi.fn().mockReturnValue(Object.assign(
          Promise.resolve({ data: [], error: null }),
          { limit: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })) }
        )),
      })
      return { select: vi.fn().mockReturnValue(selectResult) } as any
    })

    const MC = (await import('@/app/mission-control/page')).default
    render(<MC />)
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Waiting for activity...')).toBeInTheDocument()
    })
  })
})
