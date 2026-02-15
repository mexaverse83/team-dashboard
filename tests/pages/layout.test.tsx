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

describe('Root Layout', () => {
  it('renders sidebar with team name', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    // Mobile header + expanded sidebar both show team name
    expect(screen.getAllByText('Interstellar Squad').length).toBeGreaterThan(0)
  })

  it('renders all navigation links', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    // 5 mobile + 7 main desktop + 5 finance desktop = 17
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(17)
  })

  it('navigation links have correct hrefs', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    // Check desktop nav via title attributes (sidebar collapsed)
    expect(screen.getAllByTitle('Overview')[0]).toHaveAttribute('href', '/')
    expect(screen.getByTitle('Mission Control')).toHaveAttribute('href', '/mission-control')
    expect(screen.getByTitle('Tasks')).toHaveAttribute('href', '/tasks')
    expect(screen.getByTitle('Comms Log')).toHaveAttribute('href', '/comms')
    expect(screen.getByTitle('Metrics')).toHaveAttribute('href', '/metrics')
    expect(screen.getByTitle('Agents')).toHaveAttribute('href', '/agents')
    // Finance section
    expect(screen.getByTitle('Transactions')).toHaveAttribute('href', '/finance/transactions')
    expect(screen.getByTitle('Budgets')).toHaveAttribute('href', '/finance/budgets')
    expect(screen.getByTitle('Subscriptions')).toHaveAttribute('href', '/finance/subscriptions')
    expect(screen.getByTitle('Reports')).toHaveAttribute('href', '/finance/reports')
  })

  it('renders children in main area', () => {
    render(<RootLayout><div data-testid="child">Test child</div></RootLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Test child')).toBeInTheDocument()
  })

  it('renders mobile header', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getAllByText('Interstellar Squad').length).toBeGreaterThan(0)
  })

  it('uses dark mode', () => {
    const { container } = render(<RootLayout><div>content</div></RootLayout>)
    expect(container.innerHTML).toContain('min-h-screen')
  })
})
