/**
 * Unit Tests — Mission Control Page V2 (client component with real-time)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

const mockAgents = [
  { id: 'tars', name: 'TARS', role: 'Squad Lead', status: 'online', current_task: 'Coordinating', last_seen: '2026-02-08T17:00:00Z' },
  { id: 'cooper', name: 'COOPER', role: 'Developer', status: 'busy', current_task: 'Building dashboard', last_seen: '2026-02-08T17:30:00Z' },
]

const mockTickets = [
  { id: '1', title: 'Task 1', status: 'in-progress', priority: 'high', assignee: 'cooper' },
  { id: '2', title: 'Task 2', status: 'done', priority: 'medium', assignee: 'tars' },
]

const mockMessages = [
  { id: '1', sender: 'tars', recipient: 'all', content: 'Status check', message_type: 'broadcast', created_at: '2026-02-08T17:00:00Z' },
  { id: '2', sender: 'mann', recipient: 'cooper', content: 'Tests passing', message_type: 'chat', created_at: '2026-02-08T17:30:00Z' },
]

describe('Mission Control Page', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            then: vi.fn((cb: any) => { cb({ data: table === 'messages' ? mockMessages : null }); return { catch: vi.fn() } }),
          }),
          then: vi.fn((cb: any) => { cb({ data: table === 'agents' ? mockAgents : table === 'tickets' ? mockTickets : null }); return { catch: vi.fn() } }),
        }),
        then: vi.fn((cb: any) => { cb({ data: table === 'agents' ? mockAgents : table === 'tickets' ? mockTickets : mockMessages }); return { catch: vi.fn() } }),
      }),
    } as any))

    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    } as any)
    vi.mocked(supabase.removeChannel).mockReturnValue(undefined as any)
  })

  it('renders page title', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
  })

  it('renders subtitle', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    expect(screen.getByText('Real-time agent monitoring and communications')).toBeInTheDocument()
  })

  it('renders Live Activity section', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    expect(screen.getByText('Live Activity')).toBeInTheDocument()
  })

  it('shows waiting state when no activity', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    expect(screen.getByText('Waiting for activity...')).toBeInTheDocument()
  })

  it('subscribes to mc-realtime channel', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    expect(supabase.channel).toHaveBeenCalledWith('mc-realtime')
  })

  it('displays messages in feed', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    await waitFor(() => {
      expect(screen.getByText('Status check')).toBeInTheDocument()
      expect(screen.getByText('Tests passing')).toBeInTheDocument()
    })
  })
})
