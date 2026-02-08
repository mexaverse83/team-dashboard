/**
 * Unit Tests — Root Layout (sidebar navigation)
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RootLayout from '@/app/layout'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

describe('Root Layout', () => {
  it('renders sidebar with team name', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getByText('Interstellar Squad')).toBeInTheDocument()
  })

  it('renders all navigation links', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('Comms Log')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('navigation links have correct hrefs', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getByText('Overview').closest('a')).toHaveAttribute('href', '/')
    expect(screen.getByText('Mission Control').closest('a')).toHaveAttribute('href', '/mission-control')
    expect(screen.getByText('Tasks').closest('a')).toHaveAttribute('href', '/tasks')
    expect(screen.getByText('Comms Log').closest('a')).toHaveAttribute('href', '/comms')
    expect(screen.getByText('Agents').closest('a')).toHaveAttribute('href', '/agents')
  })

  it('renders children in main area', () => {
    render(<RootLayout><div data-testid="child">Test child</div></RootLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Test child')).toBeInTheDocument()
  })

  it('renders footer credit', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getByText('Built by Cooper 🤖')).toBeInTheDocument()
  })

  it('uses dark mode', () => {
    const { container } = render(<RootLayout><div>content</div></RootLayout>)
    const html = container.closest('html')
    // Layout sets className="dark" on html
    expect(container.innerHTML).toContain('min-h-screen')
  })
})
