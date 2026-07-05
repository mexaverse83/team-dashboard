import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sidebar } from '@/components/sidebar'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/finance',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

describe('Sidebar', () => {
  it('renders expanded at fixed width (collapse feature removed)', () => {
    const { container } = render(<Sidebar />)
    const aside = container.querySelector('aside')!
    expect(aside).toHaveClass('w-60')
  })

  it('renders all nav links (finance only)', () => {
    render(<Sidebar />)
    const links = screen.getAllByRole('link')
    // Mobile bottom (5) + desktop finance (17: 7 track + 5 plan + 5 analyze) = 21
    expect(links.length).toBe(22)
  })

  it('has correct finance nav hrefs', () => {
    render(<Sidebar />)
    const hrefs = screen.getAllByRole('link').map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/finance')
    expect(hrefs).toContain('/finance/transactions')
    expect(hrefs).toContain('/finance/budgets')
    expect(hrefs).toContain('/finance/subscriptions')
    expect(hrefs).toContain('/finance/income')
    expect(hrefs).toContain('/finance/investments')
    expect(hrefs).toContain('/finance/crypto')
    expect(hrefs).toContain('/finance/budget-builder')
    expect(hrefs).toContain('/finance/installments')
    expect(hrefs).toContain('/finance/debt')
    expect(hrefs).toContain('/finance/emergency-fund')
    expect(hrefs).toContain('/finance/goals')
    expect(hrefs).toContain('/finance/insights')
    expect(hrefs).toContain('/finance/audit')
    expect(hrefs).toContain('/finance/reports')
    expect(hrefs).toContain('/finance/rules')
  })

  it('has no agent nav hrefs', () => {
    render(<Sidebar />)
    const hrefs = screen.getAllByRole('link').map(l => l.getAttribute('href'))
    for (const agentHref of ['/', '/mission-control', '/tasks', '/comms', '/metrics', '/costs', '/agents']) {
      expect(hrefs).not.toContain(agentHref)
    }
  })

  it('shows visible nav labels', () => {
    render(<Sidebar />)
    expect(screen.getAllByText('Overview').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Transactions').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('MSI Tracker').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Debt Planner').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Audit').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Auto Rules').length).toBeGreaterThanOrEqual(1)
  })

  it('shows no agent nav labels', () => {
    render(<Sidebar />)
    expect(screen.queryByText('Mission Control')).not.toBeInTheDocument()
    expect(screen.queryByText('Agents')).not.toBeInTheDocument()
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument()
    expect(screen.queryByText('Comms')).not.toBeInTheDocument()
  })

  it('shows finance section group labels', () => {
    render(<Sidebar />)
    expect(screen.getAllByText('Track').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Plan').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Analyze').length).toBeGreaterThanOrEqual(1)
  })

  it('shows Finance branding (no agent team name)', () => {
    render(<Sidebar />)
    // Desktop logo + mobile top bar both say "Finance"
    expect(screen.getAllByText('Finance').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Personal Finance')).toBeInTheDocument()
    expect(screen.queryByText('Interstellar Squad')).not.toBeInTheDocument()
    expect(screen.queryByText('Squad Dashboard')).not.toBeInTheDocument()
  })

  it('shows version', () => {
    render(<Sidebar />)
    expect(screen.getByText('v2.0 · Nexaminds')).toBeInTheDocument()
  })

  it('shows connection indicator', () => {
    const { container } = render(<Sidebar />)
    const dot = container.querySelector('.bg-emerald-500.animate-pulse')
    expect(dot).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
  })

  it('mobile has top bar with hamburger', () => {
    const { container } = render(<Sidebar />)
    const topBar = container.querySelector('.md\\:hidden.fixed.top-0')
    expect(topBar).toBeInTheDocument()
    expect(topBar?.querySelector('button')).toBeInTheDocument()
    expect(topBar?.textContent).toContain('Finance')
  })

  it('mobile bottom bar has 5 quick-access links', () => {
    const { container } = render(<Sidebar />)
    const navs = container.querySelectorAll('nav')
    const bottomNav = Array.from(navs).find(n => n.className.includes('bottom-0'))
    expect(bottomNav?.querySelectorAll('a').length).toBe(5)
  })
})
