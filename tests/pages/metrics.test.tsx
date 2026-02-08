/**
 * Unit Tests — Metrics Page (async server component)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { supabase } from '@/lib/supabase'

const mockAgents = [
  { id: 'tars', name: 'TARS', role: 'Squad Lead', status: 'online', current_task: 'Coordinating', last_seen: '2026-02-08T17:00:00Z' },
  { id: 'cooper', name: 'COOPER', role: 'Developer', status: 'busy', current_task: 'Building', last_seen: '2026-02-08T17:30:00Z' },
  { id: 'mann', name: 'MANN', role: 'QA', status: 'online', current_task: 'Testing', last_seen: '2026-02-08T17:45:00Z' },
]

const mockTickets = [
  { id: '1', title: 'Task 1', status: 'done', priority: 'high', assignee: 'cooper', labels: [] },
  { id: '2', title: 'Task 2', status: 'done', priority: 'medium', assignee: 'cooper', labels: [] },
  { id: '3', title: 'Task 3', status: 'in-progress', priority: 'high', assignee: 'cooper', labels: [] },
  { id: '4', title: 'Task 4', status: 'todo', priority: 'medium', assignee: 'mann', labels: [] },
  { id: '5', title: 'Task 5', status: 'done', priority: 'low', assignee: 'tars', labels: [] },
]

const mockMetrics = [
  { id: '1', agent_id: 'tars', metric_type: 'tasks_completed', metric_value: 5, period: 'daily', created_at: '2026-02-08' },
  { id: '2', agent_id: 'tars', metric_type: 'response_time_ms', metric_value: 1200, period: 'daily', created_at: '2026-02-08' },
  { id: '3', agent_id: 'cooper', metric_type: 'tasks_completed', metric_value: 3, period: 'daily', created_at: '2026-02-08' },
  { id: '4', agent_id: 'cooper', metric_type: 'response_time_ms', metric_value: 800, period: 'daily', created_at: '2026-02-08' },
  { id: '5', agent_id: 'mann', metric_type: 'tests_written', metric_value: 76, period: 'daily', created_at: '2026-02-08' },
  { id: '6', agent_id: 'mann', metric_type: 'response_time_ms', metric_value: 1500, period: 'daily', created_at: '2026-02-08' },
]

describe('Metrics Page', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockImplementation((table: string) => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          then: vi.fn((cb: any) => { cb({ data: table === 'agent_metrics' ? mockMetrics : null }); return { catch: vi.fn() } }),
        }),
        then: vi.fn((cb: any) => {
          const data = table === 'agents' ? mockAgents : table === 'tickets' ? mockTickets : mockMetrics
          cb({ data }); return { catch: vi.fn() }
        }),
      }),
    } as any))
  })

  it('renders page title', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('Metrics')).toBeInTheDocument()
  })

  it('renders subtitle', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('Agent performance and team productivity')).toBeInTheDocument()
  })

  it('renders completion rate card', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('Completion Rate')).toBeInTheDocument()
    // 3 done out of 5 = 60%
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('3/5 tasks done')).toBeInTheDocument()
  })

  it('renders in progress count', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Active tasks')).toBeInTheDocument()
  })

  it('renders agents active count', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('Agents Active')).toBeInTheDocument()
    // 2 online (tars, mann) + 1 busy (cooper) = 3 not offline, out of 3
    expect(screen.getByText('3/3')).toBeInTheDocument()
  })

  it('renders total metrics count', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('Total Metrics')).toBeInTheDocument()
    expect(screen.getByText('Data points tracked')).toBeInTheDocument()
  })

  it('renders Agent Performance section', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('Agent Performance')).toBeInTheDocument()
  })

  it('renders agent cards with names', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('TARS')).toBeInTheDocument()
    expect(screen.getByText('COOPER')).toBeInTheDocument()
    expect(screen.getByText('MANN')).toBeInTheDocument()
  })

  it('renders agent-specific metrics', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    // Mann's tests_written metric
    expect(screen.getByText('🧪 Tests Written')).toBeInTheDocument()
    expect(screen.getByText('76')).toBeInTheDocument()
    // Tasks Completed labels
    const tasksCompleted = screen.getAllByText('✅ Tasks Completed')
    expect(tasksCompleted.length).toBeGreaterThan(0)
  })

  it('renders response time badges', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('1200ms')).toBeInTheDocument()
    expect(screen.getByText('800ms')).toBeInTheDocument()
    expect(screen.getByText('1500ms')).toBeInTheDocument()
  })

  it('renders ticket stats per agent', async () => {
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    // Cooper has 2 done, 1 active, 3 total
    expect(screen.getByText('2 done')).toBeInTheDocument()
    expect(screen.getByText('1 active')).toBeInTheDocument()
  })

  it('has revalidate set to 30', async () => {
    const mod = await import('@/app/metrics/page')
    expect(mod.revalidate).toBe(30)
  })

  it('handles empty data gracefully', async () => {
    vi.mocked(supabase.from).mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          then: vi.fn((cb: any) => { cb({ data: null }); return { catch: vi.fn() } }),
        }),
        then: vi.fn((cb: any) => { cb({ data: null }); return { catch: vi.fn() } }),
      }),
    } as any))
    const MetricsPage = (await import('@/app/metrics/page')).default
    const result = await MetricsPage()
    render(result)
    expect(screen.getByText('Metrics')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
  })
})
