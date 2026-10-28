/**
 * Unit Tests — Root Layout (finance-only) and the authenticated finance shell
 */

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import RootLayout from '@/app/layout'
import FinanceLayout from '@/app/finance/layout'
import { supabase } from '@/lib/supabase'
import { resetFinanceAuthForTests } from '@/components/finance-auth-guard'
import { FINANCE_EVENTS } from '@/lib/finance-events'

const nav = vi.hoisted(() => ({ pathname: '/finance', replace: vi.fn(), push: vi.fn() }))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

const session = (email: string) => ({ data: { session: { user: { email } } }, error: null })

beforeEach(() => {
  nav.pathname = '/finance'
  nav.replace.mockReset()
  nav.push.mockReset()
  resetFinanceAuthForTests()
  // By default the server confirms whatever session is stored locally.
  vi.mocked(supabase.auth.getUser).mockImplementation((async () => {
    const { data } = await supabase.auth.getSession()
    return { data: { user: data.session?.user ?? null }, error: null }
  }) as never)
})
afterEach(() => vi.mocked(supabase.auth.getSession).mockReset())

describe('Root Layout', () => {
  it('renders sidebar with household branding', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getAllByText('Bernardo + Laura').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Our goals, together').length).toBeGreaterThanOrEqual(1)
  })

  it('renders navigation links', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    expect(screen.getAllByRole('link').length).toBeGreaterThanOrEqual(15)
  })

  it('navigation links are finance-only', () => {
    render(<RootLayout><div>content</div></RootLayout>)
    const hrefs = screen.getAllByRole('link').map(l => l.getAttribute('href'))
    expect(hrefs).toContain('/finance')
    expect(hrefs).toContain('/finance/transactions')
    expect(hrefs).toContain('/finance/debt')
    expect(hrefs).toContain('/finance/reports')
    expect(hrefs).not.toContain('/')
    expect(hrefs).not.toContain('/agents')
    expect(hrefs).not.toContain('/mission-control')
    expect(hrefs).not.toContain('/tasks')
  })

  it('renders children in main area', () => {
    render(<RootLayout><div data-testid="child">Test child</div></RootLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('renders mobile header named after the page', () => {
    const { container } = render(<RootLayout><div>content</div></RootLayout>)
    expect(container.querySelector('header')?.textContent).toContain('Home')
  })
})

describe('Finance shell', () => {
  it('waits for the session, then shows the page with one quick-add FAB', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('bernardo.gza83@gmail.com') as never)
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { email: 'bernardo.gza83@gmail.com' } }, error: null } as never)
    render(<FinanceLayout><p>Home page</p></FinanceLayout>)
    expect(screen.getByRole('status', { name: 'Checking your session' })).toBeInTheDocument()
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    const fab = screen.getByRole('button', { name: 'Add transaction' })
    fireEvent.click(fab)
    expect(nav.push).toHaveBeenCalledWith('/finance/transactions?add=1')
  })

  it('lets a mounted quick-add host handle the FAB', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('lcampomtz89@gmail.com') as never)
    const host = vi.fn((event: Event) => event.preventDefault())
    window.addEventListener(FINANCE_EVENTS.quickAdd, host)
    render(<FinanceLayout><p>Budgets</p></FinanceLayout>)
    fireEvent.click(await screen.findByRole('button', { name: 'Add transaction' }))
    expect(host).toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
    window.removeEventListener(FINANCE_EVENTS.quickAdd, host)
  })

  it('hides the FAB where it would cover the composer', async () => {
    nav.pathname = '/finance/ask'
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('lcampomtz89@gmail.com') as never)
    render(<FinanceLayout><p>Ask</p></FinanceLayout>)
    await screen.findByText('Ask')
    expect(screen.queryByRole('button', { name: 'Add transaction' })).not.toBeInTheDocument()
  })

  it('keeps the app open when the background check fails on a weak network', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('lcampomtz89@gmail.com') as never)
    vi.mocked(supabase.auth.getUser).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<FinanceLayout><p>Still here</p></FinanceLayout>)
    expect(await screen.findByText('Still here')).toBeInTheDocument()
    await act(async () => { await Promise.resolve() })
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('signs out on a definite auth rejection', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('lcampomtz89@gmail.com') as never)
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: null }, error: { status: 401, name: 'AuthApiError', message: 'invalid JWT' } } as never)
    render(<FinanceLayout><p>Private</p></FinanceLayout>)
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/finance/login'))
  })

  it('redirects without a session or with a non-household email', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('stranger@example.com') as never)
    render(<FinanceLayout><p>Private</p></FinanceLayout>)
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/finance/login'))
    expect(screen.queryByText('Private')).not.toBeInTheDocument()
  })

  it('pull-to-refresh at the top dispatches finance:refresh', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('lcampomtz89@gmail.com') as never)
    const onRefresh = vi.fn()
    window.addEventListener(FINANCE_EVENTS.refresh, onRefresh)
    render(<FinanceLayout><p>Pull</p></FinanceLayout>)
    await screen.findByText('Pull')
    const touch = (type: string, y?: number) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperty(event, 'touches', { value: y == null ? [] : [{ clientY: y }] })
      act(() => { window.dispatchEvent(event) })
    }
    touch('touchstart', 100)
    touch('touchmove', 200)
    expect(screen.getByText('Release to refresh')).toBeInTheDocument()
    touch('touchend')
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Refreshing…')).toBeInTheDocument()
    window.removeEventListener(FINANCE_EVENTS.refresh, onRefresh)
  })
})
