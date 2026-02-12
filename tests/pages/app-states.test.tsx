/**
 * Unit Tests — App-level states: error boundary, 404, loading skeletons
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

describe('Error Boundary (error.tsx)', () => {
  it('renders error message', async () => {
    const ErrorPage = (await import('@/app/error')).default
    const error = new Error('Test error')
    const reset = vi.fn()
    render(<ErrorPage error={error} reset={reset} />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Test error')).toBeInTheDocument()
  })

  it('renders retry button that calls reset', async () => {
    const ErrorPage = (await import('@/app/error')).default
    const reset = vi.fn()
    render(<ErrorPage error={new Error('fail')} reset={reset} />)
    const btn = screen.getByText('Try again')
    fireEvent.click(btn)
    expect(reset).toHaveBeenCalledOnce()
  })

  it('handles error without message', async () => {
    const ErrorPage = (await import('@/app/error')).default
    render(<ErrorPage error={new Error()} reset={vi.fn()} />)
    expect(screen.getByText('An unexpected error occurred')).toBeInTheDocument()
  })
})

describe('Not Found (not-found.tsx)', () => {
  it('renders 404 content', async () => {
    const NotFound = (await import('@/app/not-found')).default
    render(<NotFound />)
    expect(screen.getByText('Lost in Space')).toBeInTheDocument()
    expect(screen.getByText(/doesn.t exist/)).toBeInTheDocument()
  })

  it('has link back to home', async () => {
    const NotFound = (await import('@/app/not-found')).default
    render(<NotFound />)
    const link = screen.getByText('Return to Base')
    expect(link.closest('a')).toHaveAttribute('href', '/')
  })
})

describe('Loading Skeletons', () => {
  it('root loading renders skeletons', async () => {
    const Loading = (await import('@/app/loading')).default
    const { container } = render(<Loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('agents loading renders skeletons', async () => {
    const Loading = (await import('@/app/agents/loading')).default
    const { container } = render(<Loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('comms loading renders skeletons', async () => {
    const Loading = (await import('@/app/comms/loading')).default
    const { container } = render(<Loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('metrics loading renders skeletons', async () => {
    const Loading = (await import('@/app/metrics/loading')).default
    const { container } = render(<Loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('mission-control loading renders skeletons', async () => {
    const Loading = (await import('@/app/mission-control/loading')).default
    const { container } = render(<Loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('tasks loading renders kanban-like skeleton', async () => {
    const Loading = (await import('@/app/tasks/loading')).default
    const { container } = render(<Loading />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

describe('Server Component Architecture', () => {
  it('page files are server components (no use client)', () => {
    const fs = require('fs')
    const pages = [
      'src/app/page.tsx',
      'src/app/comms/page.tsx',
      'src/app/metrics/page.tsx',
      'src/app/mission-control/page.tsx',
      'src/app/tasks/page.tsx',
      'src/app/agents/page.tsx',
    ]
    for (const page of pages) {
      const content = fs.readFileSync(page, 'utf-8')
      expect(content).not.toMatch(/^'use client'/)
    }
  })

  it('client components have use client directive', () => {
    const fs = require('fs')
    const clients = [
      'src/components/overview-client.tsx',
      'src/components/comms-client.tsx',
      'src/components/metrics-client.tsx',
      'src/components/mission-control-client.tsx',
      'src/components/tasks-client.tsx',
    ]
    for (const client of clients) {
      const content = fs.readFileSync(client, 'utf-8')
      expect(content.startsWith("'use client'")).toBe(true)
    }
  })

  it('all pages export metadata', () => {
    const fs = require('fs')
    const pages = [
      'src/app/page.tsx',
      'src/app/comms/page.tsx',
      'src/app/metrics/page.tsx',
      'src/app/mission-control/page.tsx',
      'src/app/tasks/page.tsx',
      'src/app/agents/page.tsx',
    ]
    for (const page of pages) {
      const content = fs.readFileSync(page, 'utf-8')
      expect(content).toContain('export const metadata')
      expect(content).toContain('title:')
    }
  })

  it('supabase-server exists and exports client', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/lib/supabase-server.ts', 'utf-8')
    expect(content).toContain('supabaseServer')
    expect(content).toContain('persistSession: false')
    expect(content).not.toContain("'use client'")
  })
})
