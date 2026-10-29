'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronDown, Eye, EyeOff, LayoutGrid, Menu, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { FinanceAuthBadge } from './finance-auth-badge'
import { BrandLogo, WolffAvatar } from './brand-logo'
import { ThemeToggle } from './ui/theme-toggle'
import {
  currentFinanceNavItem,
  homeNavItem,
  isFinanceRouteActive,
  isMoreRouteActive,
  moreFinanceSection,
  primaryFinanceSections,
  requestQuickAdd,
  wolffNavItem,
  type FinanceNavItem,
} from '@/lib/finance-navigation'

const [activitySection, planSection] = primaryFinanceSections
const mobileDockItems = [homeNavItem, activitySection.items[0], wolffNavItem, planSection.items[0]]

// Per-device boolean preferences (localStorage, try/catch, SSR-safe).
const PREF_EVENT = 'mona:pref-change'

function readFlag(key: string): boolean {
  try { return window.localStorage.getItem(key) === '1' } catch { return false }
}

function subscribeFlags(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(PREF_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(PREF_EVENT, onChange)
  }
}

function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(subscribeFlags, () => readFlag(key), () => false)
  const set = useCallback((next: boolean) => {
    try { window.localStorage.setItem(key, next ? '1' : '0') } catch { /* storage blocked */ }
    window.dispatchEvent(new Event(PREF_EVENT))
  }, [key])
  return [value, set]
}

// ── Privacy blur (MOB-OPP-3): body.privacy-on blurs money (globals.css). ──
export const PRIVACY_STORAGE_KEY = 'mona:privacy'

export function usePrivacyMode(): [boolean, () => void] {
  const [on, set] = useStoredFlag(PRIVACY_STORAGE_KEY)
  useEffect(() => { document.body.classList.toggle('privacy-on', on) }, [on])
  const toggle = useCallback(() => set(!readFlag(PRIVACY_STORAGE_KEY)), [set])
  return [on, toggle]
}

function PrivacyButton({ className }: { className?: string }) {
  const [on, toggle] = usePrivacyMode()
  const Icon = on ? EyeOff : Eye
  return (
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? 'Show amounts' : 'Hide amounts'} title={on ? 'Show amounts' : 'Hide amounts'}
      className={className ?? 'flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2/60 text-fg-secondary hover:text-fg'}>
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  )
}

// ── "More" group: collapsed by default, remembered per device. ──
const MORE_STORAGE_KEY = 'mona:nav-more-open'

function useMoreOpen(pathname: string): [boolean, (open: boolean) => void] {
  const [stored, set] = useStoredFlag(MORE_STORAGE_KEY)
  return [stored || isMoreRouteActive(pathname), set]
}

function NavLink({ item, pathname, onNavigate, compact = false }: {
  item: FinanceNavItem
  pathname: string
  onNavigate?: () => void
  compact?: boolean
}) {
  const active = isFinanceRouteActive(pathname, item.href)
  const Icon = item.icon
  const mona = item.href === wolffNavItem.href
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`sidebar-link flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm md:min-h-9 ${active ? 'sidebar-link-active' : ''}`}
    >
      {mona ? <WolffAvatar className="h-5 w-5" /> : <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className={compact ? 'text-[0.8125rem] font-medium' : ''}>{item.label}</span>
    </Link>
  )
}

function NavSections({ pathname, onNavigate, compact = false }: { pathname: string; onNavigate?: () => void; compact?: boolean }) {
  return (
    <>
      <div className="flex flex-col gap-0.5"><NavLink item={homeNavItem} pathname={pathname} onNavigate={onNavigate} compact={compact} /></div>
      {primaryFinanceSections.map(section => (
        <div key={section.label} className="mt-4">
          <p className="sidebar-group-label px-3 text-micro font-semibold uppercase tracking-[0.14em]">{section.label}</p>
          <div className="mt-1 flex flex-col gap-0.5">{section.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} compact={compact} />)}</div>
        </div>
      ))}
    </>
  )
}

function MoreGroup({ pathname, onNavigate, compact = false }: { pathname: string; onNavigate?: () => void; compact?: boolean }) {
  const [open, setOpen] = useMoreOpen(pathname)
  return (
    <div className="mt-4 border-t border-border pt-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={compact ? 'nav-more-desktop' : 'nav-more-mobile'}
        className="sidebar-group-label flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-micro font-semibold uppercase tracking-[0.14em] hover:bg-surface-2/60 md:min-h-9">
        <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" /><span>{moreFinanceSection.label}</span>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div id={compact ? 'nav-more-desktop' : 'nav-more-mobile'} className="mt-1 flex flex-col gap-0.5">
          {moreFinanceSection.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} compact={compact} />)}
        </div>
      )}
    </div>
  )
}

// The one add affordance (MOB-01): the dock's centre slot on phones, a sidebar
// button on desktop, so nothing floats over amounts. Opens the global
// quick-add sheet; falls back to the transactions deep link while no host is mounted.
function useQuickAdd(before?: () => void) {
  const router = useRouter()
  return () => {
    before?.()
    if (!requestQuickAdd()) router.push('/finance/transactions?add=1')
  }
}

export function Sidebar() {
  // The sign-in screen shouldn't offer navigation to pages it can't open yet.
  if (usePathname() === '/finance/login') return null
  return <SidebarNav />
}

function SidebarNav() {
  const [mobileRoute, setMobileRoute] = useState<string | null>(null)
  const pathname = usePathname()
  const mobileOpen = mobileRoute === pathname
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileNavRef = useRef<HTMLElement>(null)
  const currentItem = currentFinanceNavItem(pathname)
  const dockRoutes = mobileDockItems.map(item => item.href)
  const otherRouteActive = !dockRoutes.some(href => isFinanceRouteActive(pathname, href))

  const closeMobile = useCallback(() => setMobileRoute(null), [])
  const quickAdd = useQuickAdd(closeMobile)
  const toggleMobile = () => setMobileRoute(route => route === pathname ? null : pathname)

  useEffect(() => {
    if (!mobileOpen) return
    const desktop = window.matchMedia('(min-width: 768px)')
    const onResize = () => { if (desktop.matches) closeMobile() }
    desktop.addEventListener('change', onResize)
    onResize()
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    const main = document.querySelector('main')
    main?.setAttribute('inert', '')
    const focusFrame = window.requestAnimationFrame(() => mobileNavRef.current?.querySelector<HTMLElement>('a')?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMobile()
        menuButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.documentElement.style.overflow = previousOverflow
      main?.removeAttribute('inert')
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      desktop.removeEventListener('change', onResize)
    }
  }, [closeMobile, mobileOpen])

  return (
    <>
      <header className="mobile-masthead fixed inset-x-0 top-0 z-50 flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between px-3 pt-[env(safe-area-inset-top)] min-[360px]:px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-10 w-10" />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-fg">{currentItem?.label || 'Finance'}</span>
            <span className="block text-micro font-medium text-fg-tertiary">Bernardo + Laura</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PrivacyButton />
          <button
            ref={menuButtonRef}
            type="button"
            onClick={toggleMobile}
            aria-label={mobileOpen ? 'Close finance navigation' : 'Open finance navigation'}
            aria-expanded={mobileOpen}
            aria-controls="finance-mobile-menu"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2/60 text-fg hover:bg-surface-3"
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[45] md:hidden" role="presentation" onClick={closeMobile}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <nav
            ref={mobileNavRef}
            id="finance-mobile-menu"
            aria-label="Finance navigation"
            className="app-sidebar absolute inset-x-0 bottom-0 top-[calc(4rem+env(safe-area-inset-top))] overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl min-[360px]:px-5"
            onClick={event => event.stopPropagation()}
          >
            <NavSections pathname={pathname} onNavigate={closeMobile} />
            <MoreGroup pathname={pathname} onNavigate={closeMobile} />
            <div className="mt-5 space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-label font-medium text-fg-secondary">Theme</span>
                <ThemeToggle compact />
              </div>
              <FinanceAuthBadge collapsed={false} />
            </div>
          </nav>
        </div>
      )}

      <nav className="mobile-dock fixed inset-x-0 bottom-0 z-50 flex h-[calc(4.25rem+env(safe-area-inset-bottom))] items-start justify-around px-1 pt-1 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Quick finance navigation">
        {mobileDockItems.map((item, index) => {
          const active = isFinanceRouteActive(pathname, item.href)
          const Icon = item.icon
          const mona = item.href === wolffNavItem.href
          const link = (
            <Link
              key={item.href}
              onClick={closeMobile}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`mobile-dock-link relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 ${active ? 'mobile-dock-link-active' : ''} ${mona ? 'mobile-dock-wolff' : ''}`}
            >
              {active && !mona && <span aria-hidden="true" data-testid="dock-active-indicator" className="absolute -top-1 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-current" />}
              {mona ? <WolffAvatar className="h-7 w-7" /> : <Icon className="h-5 w-5" aria-hidden="true" />}
              <span className="text-label font-semibold">{item.shortLabel || item.label}</span>
            </Link>
          )
          if (index !== 2) return link
          return [
            <button key="add" type="button" onClick={quickAdd} aria-label="Add transaction" data-testid="quick-add"
              className="relative flex min-h-[52px] min-w-0 flex-1 items-center justify-center">
              <span className="btn-primary flex h-11 w-11 items-center justify-center rounded-full shadow-[0_8px_20px_-10px_hsl(var(--shadow-color)/0.6)] transition-transform active:scale-95">
                <Plus className="h-6 w-6" strokeWidth={2.5} aria-hidden="true" />
              </span>
            </button>,
            link,
          ]
        })}
        <button
          type="button"
          onClick={toggleMobile}
          aria-label="Open all finance tools"
          aria-expanded={mobileOpen}
          aria-controls="finance-mobile-menu"
          className={`mobile-dock-link relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 ${otherRouteActive ? 'mobile-dock-link-active' : ''}`}
        >
          {otherRouteActive && <span aria-hidden="true" className="absolute -top-1 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-current" />}
          <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          <span className="text-label font-semibold">More</span>
        </button>
      </nav>

      <aside className="app-sidebar sticky top-0 hidden h-screen min-h-screen w-60 shrink-0 flex-col overflow-y-auto px-4 py-5 md:flex lg:w-[264px]">
        <div className="mb-5 flex items-center gap-3 px-2">
          <BrandLogo className="h-12 w-12" />
          <div className="min-w-0"><h2 className="text-[15px] font-semibold tracking-tight text-fg">Bernardo + Laura</h2><p className="text-micro font-medium text-fg-tertiary">Our goals, together</p></div>
        </div>

        <button type="button" onClick={quickAdd} data-testid="quick-add-desktop"
          className="btn-primary mb-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold">
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />Add transaction
        </button>

        <div className="mb-4 flex items-center gap-2">
          <button type="button" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))} className="sidebar-search flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-xl px-3 text-xs">
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span className="truncate">Search or jump…</span><kbd className="ml-auto rounded-md border border-border px-1.5 py-0.5 font-mono text-micro">⌘K</kbd>
          </button>
          <PrivacyButton className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-fg-secondary hover:text-fg" />
        </div>

        <nav aria-label="Primary finance navigation">
          <NavSections pathname={pathname} compact />
          <MoreGroup pathname={pathname} compact />
        </nav>

        <div className="sidebar-footer mt-auto space-y-3 border-t border-border pt-4">
          <FinanceAuthBadge collapsed={false} />
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-label text-fg-secondary">Theme</span>
            <ThemeToggle compact />
          </div>
          <p className="px-2 text-micro text-fg-tertiary">v2.2 · Mona Finance</p>
        </div>
      </aside>
    </>
  )
}
