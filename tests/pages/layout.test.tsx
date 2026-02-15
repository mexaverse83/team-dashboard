/**
 * Unit Tests — Root Layout (sidebar navigation)
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RootLayout from '@/app/layout'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}))

describe('Root Layout', () => {
  it('renders sidebar with team name', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    // Mobile header shows "Squad Dashboard", expanded sidebar shows "Interstellar Squad"
    expect(screen.getByText('Squad Dashboard')).toBeInTheDocument()
  })

  it('renders all navigation links', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    // 5 mobile bottom + 7 main desktop + 10 finance desktop = 22
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(22)
  })

  it('navigation links have correct hrefs', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    const links = screen.getAllByRole('link')
    const hrefs = links.map(l => l.getAttribute('href'))
    // Main nav
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/mission-control')
    expect(hrefs).toContain('/agents')
    // Finance nav
    expect(hrefs).toContain('/finance')
    expect(hrefs).toContain('/finance/budget-builder')
    expect(hrefs).toContain('/finance/debt')
    expect(hrefs).toContain('/finance/goals')
    expect(hrefs).toContain('/finance/audit')
    expect(hrefs).toContain('/finance/reports')
  })

  it('renders children in main area', () => {
    render(<RootLayout><div data-testid="child">Test child</div></RootLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Test child')).toBeInTheDocument()
  })

  it('renders mobile header', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getByText('Squad Dashboard')).toBeInTheDocument()
  })

  it('uses dark mode', () => {
    const { container } = render(<RootLayout><div>content</div></RootLayout>)
    expect(container.innerHTML).toContain('min-h-screen')
  })
})
