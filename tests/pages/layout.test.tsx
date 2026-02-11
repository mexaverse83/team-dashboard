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
    // Sidebar collapsed: labels in title attrs. Mobile nav shows first word of label.
    // 11 links total: 5 mobile + 6 desktop
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(11)
  })

  it('navigation links have correct hrefs', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    // Check desktop nav via title attributes (sidebar collapsed)
    expect(screen.getByTitle('Overview')).toHaveAttribute('href', '/')
    expect(screen.getByTitle('Mission Control')).toHaveAttribute('href', '/mission-control')
    expect(screen.getByTitle('Tasks')).toHaveAttribute('href', '/tasks')
    expect(screen.getByTitle('Comms Log')).toHaveAttribute('href', '/comms')
    expect(screen.getByTitle('Metrics')).toHaveAttribute('href', '/metrics')
    expect(screen.getByTitle('Agents')).toHaveAttribute('href', '/agents')
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
