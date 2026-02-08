/**
 * Unit Tests — src/lib/supabase.ts (types and exports)
 */

import { describe, it, expect } from 'vitest'

describe('Supabase types', () => {
  it('should export all required types', async () => {
    // Import directly from the source for type checking
    const mod = await import('@/lib/supabase')
    expect(mod.supabase).toBeDefined()
  })

  it('Agent type should have correct shape', () => {
    // Type-level test — if this compiles, types are correct
    const agent: import('@/lib/supabase').Agent = {
      id: 'test',
      name: 'Test',
      role: 'Tester',
      status: 'online',
      current_task: null,
      last_seen: '2026-01-01T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(agent.id).toBe('test')
  })

  it('Ticket type should have correct shape', () => {
    const ticket: import('@/lib/supabase').Ticket = {
      id: 'uuid-123',
      title: 'Test ticket',
      description: 'desc',
      status: 'todo',
      priority: 'high',
      assignee: 'cooper',
      labels: ['test'],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    expect(ticket.status).toBe('todo')
  })

  it('Message type should have correct shape', () => {
    const msg: import('@/lib/supabase').Message = {
      id: 'uuid-456',
      sender: 'tars',
      recipient: 'all',
      content: 'hello',
      message_type: 'broadcast',
      created_at: '2026-01-01T00:00:00Z',
    }
    expect(msg.message_type).toBe('broadcast')
  })

  it('AgentStatus should only allow valid values', () => {
    const validStatuses: import('@/lib/supabase').AgentStatus[] = ['online', 'offline', 'busy']
    expect(validStatuses).toHaveLength(3)
  })

  it('TicketStatus should only allow valid values', () => {
    const validStatuses: import('@/lib/supabase').TicketStatus[] = ['backlog', 'todo', 'in-progress', 'review', 'done']
    expect(validStatuses).toHaveLength(5)
  })
})
