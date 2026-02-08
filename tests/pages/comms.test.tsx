/**
 * Unit Tests — Comms Page (client component with real-time)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { supabase } from '@/lib/supabase'

const mockMessages = [
  { id: '1', sender: 'tars', recipient: 'all', content: 'Squad check-in', message_type: 'broadcast', created_at: '2026-02-08T17:00:00Z' },
  { id: '2', sender: 'cooper', recipient: 'mann', content: 'Dashboard shipped', message_type: 'chat', created_at: '2026-02-08T17:30:00Z' },
  { id: '3', sender: 'SYSTEM', recipient: 'all', content: 'All agents online', message_type: 'system', created_at: '2026-02-08T16:00:00Z' },
]

describe('Comms Page', () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            then: vi.fn((cb: any) => { cb({ data: mockMessages }); return { catch: vi.fn() } }),
          }),
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
    const CommsPage = (await import('@/app/comms/page')).default
    render(<CommsPage />)
    expect(screen.getByText('Comms Log')).toBeInTheDocument()
  })

  it('renders subtitle', async () => {
    const CommsPage = (await import('@/app/comms/page')).default
    render(<CommsPage />)
    expect(screen.getByText('Complete inter-agent communication history')).toBeInTheDocument()
  })

  it('renders filter tabs', async () => {
    const CommsPage = (await import('@/app/comms/page')).default
    render(<CommsPage />)
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /All/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Direct/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /Broadcast/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /System/i })).toBeInTheDocument()
    })
  })

  it('displays messages after fetch', async () => {
    const CommsPage = (await import('@/app/comms/page')).default
    render(<CommsPage />)
    await waitFor(() => {
      expect(screen.getByText('Squad check-in')).toBeInTheDocument()
      expect(screen.getByText('Dashboard shipped')).toBeInTheDocument()
      expect(screen.getByText('All agents online')).toBeInTheDocument()
    })
  })

  it('shows sender badges in uppercase', async () => {
    const CommsPage = (await import('@/app/comms/page')).default
    render(<CommsPage />)
    await waitFor(() => {
      expect(screen.getByText('TARS')).toBeInTheDocument()
      expect(screen.getByText('COOPER')).toBeInTheDocument()
    })
  })

  it('shows broadcast recipient as Everyone', async () => {
    const CommsPage = (await import('@/app/comms/page')).default
    render(<CommsPage />)
    await waitFor(() => {
      const everyoneElements = screen.getAllByText(/Everyone/)
      expect(everyoneElements.length).toBeGreaterThan(0)
    })
  })

  it('subscribes to real-time channel on mount', async () => {
    const CommsPage = (await import('@/app/comms/page')).default
    render(<CommsPage />)
    expect(supabase.channel).toHaveBeenCalledWith('comms-realtime')
  })
})
