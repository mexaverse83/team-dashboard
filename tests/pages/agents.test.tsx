/**
 * Unit Tests — Agents Page (async server component with supabase-server)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock supabase-server (used by the server component)
vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServer: vi.fn(),
}))

import { createSupabaseServer } from '@/lib/supabase-server'

// Fresh last_seen for non-offline agents — anything silent past the staleness
// window is rendered as offline by effectiveStatus()
const NOW_ISO = new Date().toISOString()

const mockAgents = [
  { id: 'tars', name: 'TARS', role: 'Squad Lead & Coordinator', status: 'online', current_task: 'Coordinating', last_seen: NOW_ISO },
  { id: 'cooper', name: 'COOPER', role: 'Full-Stack Developer', status: 'busy', current_task: 'Building dashboard', last_seen: NOW_ISO },
  { id: 'murph', name: 'MURPH', role: 'Research & Analysis', status: 'online', current_task: null, last_seen: NOW_ISO },
  { id: 'brand', name: 'BRAND', role: 'Email Classification', status: 'offline', current_task: null, last_seen: '2026-02-08T10:00:00Z' },
  { id: 'mann', name: 'MANN', role: 'SDET / QA Engineer', status: 'online', current_task: 'Writing tests', last_seen: NOW_ISO },
]

function mockServerAgents(data: unknown, error: { message: string } | null = null) {
  vi.mocked(createSupabaseServer).mockResolvedValue({
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data, error }),
    })),
  } as any)
}

describe('Agents Page (server component)', () => {
  beforeEach(() => {
    mockServerAgents(mockAgents)
  })

  it('renders page title', async () => {
    const AgentsPage = (await import('@/app/agents/page')).default
    const result = await AgentsPage()
    render(result)
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('renders all 5 agents from Supabase data', async () => {
    const AgentsPage = (await import('@/app/agents/page')).default
    const result = await AgentsPage()
    render(result)
    expect(screen.getByText('TARS')).toBeInTheDocument()
    expect(screen.getByText('COOPER')).toBeInTheDocument()
    expect(screen.getByText('MURPH')).toBeInTheDocument()
    expect(screen.getByText('BRAND')).toBeInTheDocument()
    expect(screen.getByText('MANN')).toBeInTheDocument()
  })

  it('renders dynamic status from Supabase (not hardcoded)', async () => {
    const AgentsPage = (await import('@/app/agents/page')).default
    const result = await AgentsPage()
    render(result)
    const onlineElements = screen.getAllByText('Online')
    expect(onlineElements.length).toBe(3)
    expect(screen.getByText('Busy')).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('renders current tasks when present', async () => {
    const AgentsPage = (await import('@/app/agents/page')).default
    const result = await AgentsPage()
    render(result)
    expect(screen.getByText(/Coordinating/)).toBeInTheDocument()
    expect(screen.getByText(/Building dashboard/)).toBeInTheDocument()
    expect(screen.getByText(/Writing tests/)).toBeInTheDocument()
  })

  it('renders agent badges', async () => {
    const AgentsPage = (await import('@/app/agents/page')).default
    const result = await AgentsPage()
    render(result)
    expect(screen.getByText('LEAD')).toBeInTheDocument()
    expect(screen.getByText('DEV')).toBeInTheDocument()
    expect(screen.getByText('QA')).toBeInTheDocument()
  })

  it('handles empty Supabase response gracefully', async () => {
    mockServerAgents(null, { message: 'Failed' })
    const AgentsPage = (await import('@/app/agents/page')).default
    const result = await AgentsPage()
    render(result)
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('has revalidate set to 30 seconds', async () => {
    const mod = await import('@/app/agents/page')
    expect(mod.revalidate).toBe(30)
  })

  it('exports metadata with correct title', async () => {
    const mod = await import('@/app/agents/page')
    expect((mod.metadata as any).title).toContain('Agents')
  })
})
