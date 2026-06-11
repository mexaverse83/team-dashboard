import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/sidebar'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

describe('Sidebar', () => {
  it('renders expanded at fixed width (collapse feature removed)', () => {
    const { container } = render(<Sidebar />)
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('w-60')
  })

  it('renders all nav links (main + finance)', () => {
    render(<Sidebar />)
    const links = screen.getAllByRole('link')
    // Mobile bottom (5) + desktop main (7) + desktop finance (11: 4 track + 1 installments + 4 plan + 2 analyze) = 23
    expect(links.length).toBeGreaterThanOrEqual(20)
  })

  it('has correct main nav hrefs', () => {
    render(<Sidebar />)
    const hrefs = screen.getAllByRole('link').map(l => l.getAttribute('href'))
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
    const hrefs = screen.getAllByRole('link').map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/finance')
    expect(hrefs).toContain('/finance/transactions')
    expect(hrefs).toContain('/finance/budgets')
    expect(hrefs).toContain('/finance/subscriptions')
    expect(hrefs).toContain('/finance/budget-builder')
    expect(hrefs).toContain('/finance/installments')
    expect(hrefs).toContain('/finance/debt')
    expect(hrefs).toContain('/finance/emergency-fund')
    expect(hrefs).toContain('/finance/goals')
    expect(hrefs).toContain('/finance/audit')
    expect(hrefs).toContain('/finance/reports')
  })

  it('shows visible nav labels', () => {
    render(<Sidebar />)
    expect(screen.getAllByText('Overview').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Mission Control').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Agents').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('MSI Tracker').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Debt Planner').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Audit').length).toBeGreaterThanOrEqual(1)
  })

  it('shows finance section labels', () => {
    render(<Sidebar />)
    expect(screen.getAllByText('Track').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Plan').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Analyze').length).toBeGreaterThanOrEqual(1)
  })

  it('shows team name', () => {
    render(<Sidebar />)
    expect(screen.getByText('Interstellar Squad')).toBeInTheDocument()
  })

  it('shows version', () => {
    render(<Sidebar />)
    expect(screen.getByText('v2.0 · Nexaminds')).toBeInTheDocument()
  })

  it('shows connection indicator', () => {
    const { container } = render(<Sidebar />)
    const dot = container.querySelector('.bg-emerald-500.animate-pulse')
    expect(dot).toBeInTheDocument()
  })

  it('mobile has top bar with hamburger', () => {
    render(<Sidebar />)
    expect(screen.getByText('Squad Dashboard')).toBeInTheDocument()
  })

  it('mobile bottom bar has 5 quick-access links', () => {
    const { container } = render(<Sidebar />)
    // Bottom nav has 5 links
    const navs = container.querySelectorAll('nav')
    // Find the bottom nav (fixed bottom)
    const bottomLinks = Array.from(navs).find(n => n.className.includes('bottom-0'))
    expect(bottomLinks?.querySelectorAll('a').length).toBe(5)
  })
})
