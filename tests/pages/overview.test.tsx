/**
 * Unit Tests — Overview Page (async server component)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

// Mock next/link for layout
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

const mockAgents = [
  { id: 'tars', name: 'TARS', role: 'Squad Lead', status: 'online', current_task: 'Coordinating', last_seen: '2026-02-08T17:00:00Z' },
  { id: 'cooper', name: 'COOPER', role: 'Developer', status: 'busy', current_task: 'Building', last_seen: '2026-02-08T17:30:00Z' },
  { id: 'murph', name: 'MURPH', role: 'Research', status: 'offline', current_task: null, last_seen: '2026-02-08T16:00:00Z' },
]

const mockTickets = [
  { id: '1', title: 'Task 1', status: 'in-progress', priority: 'high', assignee: 'cooper' },
  { id: '2', title: 'Task 2', status: 'done', priority: 'medium', assignee: 'mann' },
  { id: '3', title: 'Task 3', status: 'todo', priority: 'low', assignee: 'murph' },
]

const mockMessages = [
  { id: '1', sender: 'tars', recipient: 'all', content: 'Squad online', message_type: 'broadcast', created_at: '2026-02-08T17:00:00Z' },
  { id: '2', sender: 'cooper', recipient: 'mann', content: 'Tests ready?', message_type: 'chat', created_at: '2026-02-08T17:30:00Z' },
]

describe('Overview Page', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockImplementation((table: string) => ({
      select: vi.fn().mockResolvedValue({
        data: table === 'agents' ? mockAgents : table === 'tickets' ? mockTickets : mockMessages,
        error: null,
      }),
    } as any))
  })

  it('renders page title', async () => {
    const Page = (await import('@/app/page')).default
    const result = await Page()
    render(result)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('renders metric cards with correct counts', async () => {
    const Page = (await import('@/app/page')).default
    const result = await Page()
    const { container } = render(result)
    // Find all metric values (text-2xl font-bold)
    const metricValues = container.querySelectorAll('.text-2xl.font-bold')
    const values = Array.from(metricValues).map(el => el.textContent)
    expect(values).toContain('3')  // agents
    expect(values).toContain('2')  // open tasks
    expect(values).toContain('2')  // messages
    expect(values).toContain('1')  // completed
  })

  it('renders metric card labels', async () => {
    const Page = (await import('@/app/page')).default
    const result = await Page()
    render(result)
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Open Tasks')).toBeInTheDocument()
    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('renders agent status section', async () => {
    const Page = (await import('@/app/page')).default
    const result = await Page()
    render(result)
    expect(screen.getByText('Agent Status')).toBeInTheDocument()
  })

  it('renders recent messages section', async () => {
    const Page = (await import('@/app/page')).default
    const result = await Page()
    render(result)
    expect(screen.getByText('Recent Messages')).toBeInTheDocument()
    expect(screen.getByText('Squad online')).toBeInTheDocument()
    expect(screen.getByText('Tests ready?')).toBeInTheDocument()
  })

  it('has revalidate set to 30', async () => {
    const mod = await import('@/app/page')
    expect(mod.revalidate).toBe(30)
  })

  it('handles empty data gracefully', async () => {
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
    } as any))
    const Page = (await import('@/app/page')).default
    const result = await Page()
    render(result)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})
