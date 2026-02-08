/**
 * Unit Tests — Mission Control Page (client component with dual real-time subs)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

const mockAgents = [
  { id: 'tars', name: 'TARS', role: 'Squad Lead', status: 'online', current_task: 'Coordinating', last_seen: '2026-02-08T17:00:00Z' },
  { id: 'cooper', name: 'COOPER', role: 'Developer', status: 'busy', current_task: 'Building dashboard', last_seen: '2026-02-08T17:30:00Z' },
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
          then: vi.fn((cb: any) => { cb({ data: table === 'agents' ? mockAgents : null }); return { catch: vi.fn() } }),
        }),
        then: vi.fn((cb: any) => { cb({ data: table === 'agents' ? mockAgents : mockMessages }); return { catch: vi.fn() } }),
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
    expect(screen.getByText('Real-time agent status and communications')).toBeInTheDocument()
  })

  it('renders Live Comms Feed', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    expect(screen.getByText('Live Comms Feed')).toBeInTheDocument()
  })

  it('shows default state when no agent selected', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    expect(screen.getByText('Select an agent to view details')).toBeInTheDocument()
  })

  it('subscribes to both agents and messages real-time channels', async () => {
    const MissionControl = (await import('@/app/mission-control/page')).default
    render(<MissionControl />)
    expect(supabase.channel).toHaveBeenCalledWith('agents-realtime')
    expect(supabase.channel).toHaveBeenCalledWith('messages-realtime')
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
