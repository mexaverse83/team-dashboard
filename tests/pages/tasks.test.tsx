/**
 * Unit Tests — Tasks Page (Kanban board, client component)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

const mockTickets = [
  { id: '1', title: 'Build dashboard', status: 'in-progress', priority: 'high', assignee: 'cooper', labels: ['frontend'], updated_at: '2026-02-08T17:00:00Z' },
  { id: '2', title: 'Write tests', status: 'todo', priority: 'medium', assignee: 'mann', labels: ['testing'], updated_at: '2026-02-08T17:30:00Z' },
  { id: '3', title: 'SSH persistence', status: 'done', priority: 'critical', assignee: 'cooper', labels: ['infra', 'bugfix'], updated_at: '2026-02-08T16:00:00Z' },
  { id: '4', title: 'Research Vercel', status: 'backlog', priority: 'low', assignee: 'murph', labels: ['research'], updated_at: '2026-02-08T15:00:00Z' },
  { id: '5', title: 'Code review', status: 'review', priority: 'medium', assignee: 'mann', labels: [], updated_at: '2026-02-08T14:00:00Z' },
]

describe('Tasks Page (Kanban)', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          then: vi.fn((cb: any) => { cb({ data: mockTickets }); return { catch: vi.fn() } }),
        }),
      }),
    } as any)

    vi.mocked(supabase.channel).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    } as any)
    vi.mocked(supabase.removeChannel).mockReturnValue(undefined as any)
  })

  it('renders page title', async () => {
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    expect(screen.getByText('Tasks')).toBeInTheDocument()
  })

  it('renders all 5 Kanban columns', async () => {
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('To Do')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders New Task button', async () => {
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    expect(screen.getByText('New Task')).toBeInTheDocument()
  })

  it('displays tickets after fetch', async () => {
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    await waitFor(() => {
      expect(screen.getByText('Build dashboard')).toBeInTheDocument()
      expect(screen.getByText('Write tests')).toBeInTheDocument()
      expect(screen.getByText('SSH persistence')).toBeInTheDocument()
      expect(screen.getByText('Research Vercel')).toBeInTheDocument()
      expect(screen.getByText('Code review')).toBeInTheDocument()
    })
  })

  it('displays priority badges', async () => {
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    await waitFor(() => {
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Critical')).toBeInTheDocument()
      expect(screen.getByText('Low')).toBeInTheDocument()
    })
  })

  it('displays assignee badges', async () => {
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    await waitFor(() => {
      expect(screen.getAllByText('COOPER').length).toBeGreaterThan(0)
      expect(screen.getAllByText('MANN').length).toBeGreaterThan(0)
      expect(screen.getByText('MURPH')).toBeInTheDocument()
    })
  })

  it('displays ticket labels', async () => {
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    await waitFor(() => {
      expect(screen.getByText('frontend')).toBeInTheDocument()
      expect(screen.getByText('testing')).toBeInTheDocument()
      expect(screen.getByText('infra')).toBeInTheDocument()
    })
  })

  it('subscribes to real-time ticket updates', async () => {
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    expect(supabase.channel).toHaveBeenCalledWith('tickets-realtime')
  })

  it('handles empty ticket list', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          then: vi.fn((cb: any) => { cb({ data: [] }); return { catch: vi.fn() } }),
        }),
      }),
    } as any)
    const TasksPage = (await import('@/app/tasks/page')).default
    render(<TasksPage />)
    // Should render columns even with no tickets
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })
})
