/**
 * Unit Tests — Root Layout
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RootLayout from '@/app/layout'

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

describe('Root Layout', () => {
  it('renders sidebar with team branding', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getByText('Squad Dashboard')).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    const links = screen.getAllByRole('link')
    expect(links.length).toBeGreaterThanOrEqual(20)
  })

  it('navigation links include main and finance', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    const hrefs = screen.getAllByRole('link').map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/')
    expect(hrefs).toContain('/agents')
    expect(hrefs).toContain('/finance')
    expect(hrefs).toContain('/finance/transactions')
    expect(hrefs).toContain('/finance/debt')
    expect(hrefs).toContain('/finance/audit')
  })

  it('renders children in main area', () => {
    render(<RootLayout><div data-testid="child">Test child</div></RootLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
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
