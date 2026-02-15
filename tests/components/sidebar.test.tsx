import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sidebar } from '@/components/sidebar'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('Sidebar', () => {
  it('renders in collapsed state by default', () => {
    const { container } = render(<Sidebar />)
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('w-[52px]')
  })

  it('renders all nav links (main + finance sections)', () => {
    render(<Sidebar />)
    const links = screen.getAllByRole('link')
    // Mobile bottom bar (5) + desktop main (7) + desktop finance track (4) + plan (4) + analyze (2) = 22
    expect(links).toHaveLength(22)
  })

  it('has correct main nav hrefs', () => {
    render(<Sidebar />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map(l => l.getAttribute('href'))
    // Main nav items appear in desktop aside
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/mission-control')
    expect(hrefs).toContain('/tasks')
    expect(hrefs).toContain('/comms')
    expect(hrefs).toContain('/metrics')
    expect(hrefs).toContain('/costs')
    expect(hrefs).toContain('/agents')
  })

  it('has correct finance nav hrefs', () => {
    render(<Sidebar />)
    const links = screen.getAllByRole('link')
    const hrefs = links.map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/finance')
    expect(hrefs).toContain('/finance/transactions')
    expect(hrefs).toContain('/finance/budgets')
    expect(hrefs).toContain('/finance/subscriptions')
    expect(hrefs).toContain('/finance/budget-builder')
    expect(hrefs).toContain('/finance/debt')
    expect(hrefs).toContain('/finance/emergency-fund')
    expect(hrefs).toContain('/finance/goals')
    expect(hrefs).toContain('/finance/audit')
    expect(hrefs).toContain('/finance/reports')
  })

  it('shows nav labels with title attribute when collapsed', () => {
    render(<Sidebar />)
    // Main nav
    expect(screen.getAllByTitle('Overview').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTitle('Mission Control')).toBeInTheDocument()
    expect(screen.getByTitle('Agents')).toBeInTheDocument()
    // Finance nav
    expect(screen.getByTitle('Transactions')).toBeInTheDocument()
    expect(screen.getByTitle('Budget Builder')).toBeInTheDocument()
    expect(screen.getByTitle('Debt Planner')).toBeInTheDocument()
    expect(screen.getByTitle('Emergency Fund')).toBeInTheDocument()
    expect(screen.getByTitle('Goals')).toBeInTheDocument()
    expect(screen.getByTitle('Audit')).toBeInTheDocument()
    expect(screen.getByTitle('Reports')).toBeInTheDocument()
  })

  it('expands on toggle click', () => {
    const { container } = render(<Sidebar />)
    const toggleBtn = screen.getByLabelText('Toggle sidebar')
    fireEvent.click(toggleBtn)
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('w-60')
  })

  it('shows section labels when expanded', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByLabelText('Toggle sidebar'))
    expect(screen.getByText('Track')).toBeInTheDocument()
    expect(screen.getByText('Plan')).toBeInTheDocument()
    expect(screen.getByText('Analyze')).toBeInTheDocument()
  })

  it('shows team name when expanded', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByLabelText('Toggle sidebar'))
    expect(screen.getByText('Interstellar Squad')).toBeInTheDocument()
  })

  it('shows version when expanded', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByLabelText('Toggle sidebar'))
    expect(screen.getByText('v2.0 · Nexaminds')).toBeInTheDocument()
  })

  it('shows connection indicator', () => {
    const { container } = render(<Sidebar />)
    const dot = container.querySelector('.bg-emerald-500.animate-pulse')
    expect(dot).toBeInTheDocument()
  })

  it('collapses back on second toggle', () => {
    const { container } = render(<Sidebar />)
    const toggleBtn = screen.getByLabelText('Toggle sidebar')
    fireEvent.click(toggleBtn) // expand
    fireEvent.click(screen.getByLabelText('Toggle sidebar')) // collapse
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('w-[52px]')
  })

  it('mobile has top bar with hamburger', () => {
    render(<Sidebar />)
    expect(screen.getByText('Squad Dashboard')).toBeInTheDocument()
  })

  it('mobile bottom bar has 5 quick-access links', () => {
    const { container } = render(<Sidebar />)
    // Bottom nav is the last <nav> inside the component
    const bottomNav = container.querySelectorAll('nav')
    const mobileNav = bottomNav[0] // first nav is mobile bottom
    const mobileLinks = mobileNav.querySelectorAll('a')
    expect(mobileLinks).toHaveLength(5)
  })
})
