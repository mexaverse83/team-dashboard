import { beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { Sidebar } from '@/components/Sidebar'
import { allFinanceNavItems, moreFinanceSection, paletteOnlyItems, primaryFinanceSections } from '@/lib/finance-navigation'

const nav = vi.hoisted(() => ({ pathname: '/finance', push: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

const desktopNav = () => screen.getByRole('navigation', { name: 'Primary finance navigation' })

describe('Sidebar', () => {
  beforeEach(() => {
    nav.pathname = '/finance'
    nav.push.mockReset()
    window.localStorage.clear()
    document.body.classList.remove('privacy-on')
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  })

  it('groups the nav as Home / Activity / Plan / Wealth / Mona with a More group', () => {
    expect(primaryFinanceSections.map(s => s.label)).toEqual(['Activity', 'Plan', 'Wealth', 'Mona'])
    expect(Object.fromEntries(primaryFinanceSections.map(s => [s.label, s.items.map(i => i.label)]))).toEqual({
      Activity: ['Transactions', 'Budgets', 'Subscriptions', 'MSI Installments', 'Income'],
      Plan: ['Goals', 'Family & Baby', 'Emergency Fund'],
      Wealth: ['Investments', 'Debt Planner', 'Reports'],
      Mona: ['Ask Mona', 'Daily Brief'],
    })
    expect(moreFinanceSection.items.map(i => i.label)).toEqual(['Spending Audit', 'Auto Rules', 'Budget Builder'])
    render(<Sidebar />)
    for (const label of ['Activity', 'Plan', 'Wealth', 'Mona', 'More']) expect(within(desktopNav()).getByText(label)).toBeInTheDocument()
  })

  it('keeps Crypto out of the nav (palette only)', () => {
    expect(allFinanceNavItems.some(i => i.href.includes('crypto') || i.label === 'Crypto')).toBe(false)
    expect(paletteOnlyItems.find(i => i.label === 'Crypto')?.href).toBe('/finance/investments?tab=Crypto')
    render(<Sidebar />)
    expect(screen.getAllByRole('link').map(l => l.getAttribute('href'))).not.toContain('/finance/crypto')
  })

  it('collapses More by default and remembers it when opened', () => {
    const { unmount } = render(<Sidebar />)
    const toggle = within(desktopNav()).getByRole('button', { name: /More/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(desktopNav()).queryByRole('link', { name: 'Auto Rules' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(within(desktopNav()).getByRole('link', { name: 'Auto Rules' })).toHaveAttribute('href', '/finance/rules')
    expect(window.localStorage.getItem('mona:nav-more-open')).toBe('1')
    unmount()
    render(<Sidebar />)
    expect(within(desktopNav()).getByRole('button', { name: /More/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens More when the current page lives there', () => {
    nav.pathname = '/finance/audit'
    render(<Sidebar />)
    expect(within(desktopNav()).getByRole('link', { name: 'Spending Audit' })).toHaveAttribute('aria-current', 'page')
  })

  it('has no masthead quick-add; the FAB lives in the finance layout', () => {
    render(<Sidebar />)
    expect(screen.queryByRole('link', { name: 'Add transaction' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link').map(l => l.getAttribute('href'))).not.toContain('/finance/transactions?add=1')
  })

  it('mobile masthead shows the page name with 44px controls', () => {
    const { container } = render(<Sidebar />)
    const masthead = container.querySelector('header.mobile-masthead')!
    expect(masthead.textContent).toContain('Home')
    const buttons = [...masthead.querySelectorAll('button')]
    // The automation status pill is text-width but keeps the 44px tap height.
    const status = buttons.find(b => b.closest('[class*="inline-block"]') && b.getAttribute('aria-controls') && !b.getAttribute('aria-label')?.includes('navigation'))
    for (const button of buttons) {
      if (button === status) expect(button).toHaveClass('min-h-[var(--tap-min)]')
      else expect(button).toHaveClass('h-11', 'w-11')
    }
  })

  it('toggles the privacy blur and remembers it', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Hide amounts' })[0])
    expect(document.body).toHaveClass('privacy-on')
    expect(window.localStorage.getItem('mona:privacy')).toBe('1')
    fireEvent.click(screen.getAllByRole('button', { name: 'Show amounts' })[0])
    expect(document.body).not.toHaveClass('privacy-on')
  })

  it('offers the theme toggle in the sidebar footer', () => {
    render(<Sidebar />)
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
  })

  it('mobile dock: Home, Activity, Mona, Goals and More, with 12px labels and an active indicator', () => {
    render(<Sidebar />)
    const dock = screen.getByRole('navigation', { name: 'Quick finance navigation' })
    expect([...dock.querySelectorAll('a')].map(a => a.textContent)).toEqual(['Home', 'Activity', 'Mona', 'Goals'])
    expect(within(dock).getByRole('button', { name: 'Open all finance tools' })).toHaveTextContent('More')
    expect(dock.querySelector('a span.text-label')).toBeInTheDocument()
    expect(within(dock).getByTestId('dock-active-indicator')).toBeInTheDocument()
  })

  it('marks the current destination for assistive technology', () => {
    render(<Sidebar />)
    const homeLinks = screen.getAllByRole('link', { name: 'Home' })
    expect(homeLinks.every(link => link.getAttribute('aria-current') === 'page')).toBe(true)
  })

  it('releases the page when navigating through the mobile dock', () => {
    const { container } = render(<><main>Finance content</main><Sidebar /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Open all finance tools' }))
    expect(container.querySelector('main')).toHaveAttribute('inert')
    fireEvent.click(screen.getByRole('navigation', { name: 'Quick finance navigation' }).querySelector('a')!)
    expect(container.querySelector('main')).not.toHaveAttribute('inert')
    expect(screen.queryByRole('navigation', { name: 'Finance navigation' })).not.toBeInTheDocument()
  })

  it('opens every group from the mobile menu', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Open all finance tools' }))
    const menu = screen.getByRole('navigation', { name: 'Finance navigation' })
    expect(within(menu).getByRole('link', { name: 'Income' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'MSI Installments' })).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('button', { name: /More/ }))
    expect(within(menu).getByRole('link', { name: 'Spending Audit' })).toBeInTheDocument()
  })

  it('has no agent nav hrefs', () => {
    render(<Sidebar />)
    const hrefs = screen.getAllByRole('link').map(l => l.getAttribute('href'))
    for (const agentHref of ['/', '/mission-control', '/tasks', '/comms', '/metrics', '/costs', '/agents']) {
      expect(hrefs).not.toContain(agentHref)
    }
  })

  it('shows household branding', () => {
    render(<Sidebar />)
    expect(screen.getByText('Bernardo + Laura', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByText('v2.2 · Mona Finance')).toBeInTheDocument()
  })

  it('hides on the login page', () => {
    nav.pathname = '/finance/login'
    const { container } = render(<Sidebar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('puts the one add action in the dock and the desktop sidebar, not over content', () => {
    render(<Sidebar />)
    const dock = screen.getByRole('navigation', { name: 'Quick finance navigation' })
    const add = within(dock).getByRole('button', { name: 'Add transaction' })
    // Centre-left slot: Home, Activity, Add, Mona, Plan, More.
    expect([...dock.children].indexOf(add)).toBe(2)
    fireEvent.click(add)
    expect(nav.push).toHaveBeenCalledWith('/finance/transactions?add=1')
    expect(screen.getByTestId('quick-add-desktop')).toHaveTextContent('Add transaction')
  })

  it('lets a mounted quick-add host handle the add action', () => {
    const host = vi.fn((event: Event) => event.preventDefault())
    window.addEventListener('finance:quick-add', host)
    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('quick-add-desktop'))
    expect(host).toHaveBeenCalled()
    expect(nav.push).not.toHaveBeenCalled()
    window.removeEventListener('finance:quick-add', host)
  })

  it('layers the open mobile menu above page content', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Open finance navigation' }))
    expect(document.getElementById('finance-mobile-menu')?.parentElement).toHaveClass('z-[45]')
  })
})
