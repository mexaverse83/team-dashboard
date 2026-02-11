import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '@/components/sidebar'

describe('Sidebar', () => {
  it('renders in collapsed state by default', () => {
    const { container } = render(<Sidebar />)
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('w-[52px]')
  })

  it('renders all 6 nav links', () => {
    render(<Sidebar />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(6)
  })

  it('has correct nav hrefs', () => {
    render(<Sidebar />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map(l => l.getAttribute('href'))
    expect(hrefs).toEqual(['/', '/mission-control', '/tasks', '/comms', '/metrics', '/agents'])
  })

  it('shows nav labels with title attribute when collapsed', () => {
    render(<Sidebar />)
    expect(screen.getByTitle('Overview')).toBeInTheDocument()
    expect(screen.getByTitle('Mission Control')).toBeInTheDocument()
    expect(screen.getByTitle('Tasks')).toBeInTheDocument()
    expect(screen.getByTitle('Comms Log')).toBeInTheDocument()
    expect(screen.getByTitle('Metrics')).toBeInTheDocument()
    expect(screen.getByTitle('Agents')).toBeInTheDocument()
  })

  it('expands on toggle click', () => {
    const { container } = render(<Sidebar />)
    const toggle = screen.getByRole('button')
    fireEvent.click(toggle)
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('w-60')
  })

  it('shows nav label text when expanded', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getAllByText('Mission Control').length).toBeGreaterThan(0)
    expect(screen.getByText('Collapse')).toBeInTheDocument()
  })

  it('shows team name when expanded', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('Interstellar Squad')).toBeInTheDocument()
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
  })

  it('shows version when expanded', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('v2.0 · Nexaminds')).toBeInTheDocument()
  })

  it('shows connection indicator', () => {
    const { container } = render(<Sidebar />)
    const dot = container.querySelector('.bg-emerald-500.animate-pulse')
    expect(dot).toBeInTheDocument()
  })

  it('collapses back on second toggle', () => {
    const { container } = render(<Sidebar />)
    const toggle = screen.getByRole('button')
    fireEvent.click(toggle) // expand
    fireEvent.click(screen.getAllByRole('button')[0]) // collapse
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('w-[52px]')
  })

  it('is hidden on mobile (md:flex)', () => {
    const { container } = render(<Sidebar />)
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('hidden', 'md:flex')
  })
})
