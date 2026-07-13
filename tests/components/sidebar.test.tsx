import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
    // Mobile dock (4 links + More button), mobile quick-add, and desktop finance (17 links)
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
    expect(screen.getAllByText('Spending Audit').length).toBeGreaterThanOrEqual(1)
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
    expect(screen.getAllByText('Daily').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Money').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Goals').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Cash flow').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Commitments').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Analysis & automation').length).toBeGreaterThanOrEqual(1)
  })

  it('shows household branding (no agent team name)', () => {
    render(<Sidebar />)
    expect(screen.getByText('Bernardo + Laura')).toBeInTheDocument()
    expect(screen.getAllByText('Our goals, together').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText('Interstellar Squad')).not.toBeInTheDocument()
    expect(screen.queryByText('Squad Dashboard')).not.toBeInTheDocument()
  })

  it('shows version', () => {
    render(<Sidebar />)
    expect(screen.getByText('v2.1 · Wolff Finance')).toBeInTheDocument()
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
    expect(topBar?.textContent).toContain('Overview')
  })

  it('keeps new transaction one tap away in the mobile header', () => {
    render(<Sidebar />)
    expect(screen.getByRole('link', { name: 'Add transaction' })).toHaveAttribute('href', '/finance/transactions?add=1')
  })

  it('mobile bottom bar has four destinations and a More menu', () => {
    const { container } = render(<Sidebar />)
    const navs = container.querySelectorAll('nav')
    const bottomNav = Array.from(navs).find(n => n.className.includes('bottom-0'))
    expect(bottomNav?.querySelectorAll('a').length).toBe(4)
    expect(bottomNav?.querySelector('button')?.textContent).toContain('More')
  })

  it('marks the current destination for assistive technology', () => {
    render(<Sidebar />)
    const overviewLinks = screen.getAllByRole('link', { name: 'Overview' })
    expect(overviewLinks.every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('opens every specialist tool from the mobile More menu', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Open all finance tools' }))
    expect(screen.getByRole('navigation', { name: 'Finance navigation' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Income' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: 'MSI Tracker' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: 'Spending Audit' }).length).toBeGreaterThanOrEqual(1)
  })
})
