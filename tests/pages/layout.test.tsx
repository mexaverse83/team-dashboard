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
  it('waits for the session, then shows the page', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('bernardo.gza83@gmail.com') as never)
    vi.mocked(supabase.auth.getUser).mockResolvedValue({ data: { user: { email: 'bernardo.gza83@gmail.com' } }, error: null } as never)
    render(<FinanceLayout><p>Home page</p></FinanceLayout>)
    expect(screen.getByRole('status', { name: 'Checking your session' })).toBeInTheDocument()
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    // The add action lives in the dock / sidebar, never floating over page content.
    expect(screen.queryByRole('button', { name: 'Add transaction' })).not.toBeInTheDocument()
  })

  it('keeps the shell when an expired token can’t refresh on a weak network', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } } as never)
    document.cookie = `sb-test-auth-token=${encodeURIComponent(JSON.stringify({ user: { email: 'lcampomtz89@gmail.com' } }))}; path=/`
    render(<FinanceLayout><p>Still yours</p></FinanceLayout>)
    expect(await screen.findByText('Still yours')).toBeInTheDocument()
    expect(nav.replace).not.toHaveBeenCalled()
    document.cookie = 'sb-test-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  })

  it('shows an offline state, not the login page, when no stored session can be read', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null }, error: { name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' } } as never)
    render(<FinanceLayout><p>Private</p></FinanceLayout>)
    expect(await screen.findByText('Can’t reach the server')).toBeInTheDocument()
    expect(nav.replace).not.toHaveBeenCalled()
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('lcampomtz89@gmail.com') as never)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Private')).toBeInTheDocument()
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

  it('pull-to-refresh says Updated only after listeners finish, and admits failure', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue(session('lcampomtz89@gmail.com') as never)
    let settle: (ok: boolean) => void = () => {}
    const onRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ waitUntil: (p: Promise<unknown>) => void }>).detail
      detail.waitUntil(new Promise((resolve, reject) => { settle = ok => (ok ? resolve(null) : reject(new Error('x'))) }))
    }
    window.addEventListener(FINANCE_EVENTS.refresh, onRefresh)
    render(<FinanceLayout><p>Pull</p></FinanceLayout>)
    await screen.findByText('Pull')
    const pull = () => {
      for (const [type, y] of [['touchstart', 100], ['touchmove', 200], ['touchend', undefined]] as const) {
        const event = new Event(type, { bubbles: true })
        Object.defineProperty(event, 'touches', { value: y == null ? [] : [{ clientY: y }] })
        act(() => { window.dispatchEvent(event) })
      }
    }
    pull()
    expect(screen.getByText('Refreshing…')).toBeInTheDocument()
    expect(screen.queryByText(/^Updated/)).not.toBeInTheDocument()
    await act(async () => { settle(false) })
    expect(await screen.findByText('Couldn’t refresh — showing last update')).toBeInTheDocument()
    pull()
    await act(async () => { settle(true) })
    expect(await screen.findByText(/^Updated /)).toBeInTheDocument()
    window.removeEventListener(FINANCE_EVENTS.refresh, onRefresh)
  })
})
