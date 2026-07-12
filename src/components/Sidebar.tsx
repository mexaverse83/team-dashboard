'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, LayoutGrid, Menu, Search, X } from 'lucide-react'
import { FinanceAuthBadge } from './finance-auth-badge'
import { BrandLogo } from './brand-logo'
import {
  currentFinanceNavItem,
  financeToolSections,
  isFinanceRouteActive,
  primaryFinanceSections,
  wolffNavItem,
  type FinanceNavItem,
} from '@/lib/finance-navigation'

const mobileDockItems = [
  primaryFinanceSections[0].items[0],
  primaryFinanceSections[1].items[0],
  wolffNavItem,
  primaryFinanceSections[2].items[0],
]
const WolffIcon = wolffNavItem.icon

function NavLink({ item, pathname, onNavigate, compact = false }: {
  item: FinanceNavItem
  pathname: string
  onNavigate?: () => void
  compact?: boolean
}) {
  const active = isFinanceRouteActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`sidebar-link flex items-center gap-3 rounded-xl px-3 ${compact ? 'py-[7px]' : 'py-2.5'} text-sm ${active ? 'sidebar-link-active' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className={compact ? 'text-[12px] font-medium' : ''}>{item.label}</span>
    </Link>
  )
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileNavRef = useRef<HTMLElement>(null)
  const currentItem = currentFinanceNavItem(pathname)
  const toolRouteActive = financeToolSections.some(section => section.items.some(item => isFinanceRouteActive(pathname, item.href)))

  const closeMobile = useCallback(() => setMobileOpen(false), [])
  const toggleMobile = () => setMobileOpen(open => !open)

  useEffect(() => {
    if (!mobileOpen) return
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
    }
  }, [closeMobile, mobileOpen])

  return (
    <>
      <header className="mobile-masthead fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="h-9 w-9" />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight text-white">{currentItem?.label || 'Finance'}</span>
            <span className="block text-[9px] font-medium uppercase tracking-[0.18em] text-white/45">Wolff Finance</span>
          </div>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={toggleMobile}
          aria-label={mobileOpen ? 'Close finance navigation' : 'Open finance navigation'}
          aria-expanded={mobileOpen}
          aria-controls="finance-mobile-menu"
          className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="presentation" onClick={closeMobile}>
          <div className="absolute inset-0 bg-[#050914]/80 backdrop-blur-sm" />
          <nav
            ref={mobileNavRef}
            id="finance-mobile-menu"
            aria-label="Finance navigation"
            className="app-sidebar absolute inset-x-0 bottom-0 top-16 overflow-y-auto px-5 pb-24 pt-5 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <Link href="/finance/ask" onClick={closeMobile} aria-current={isFinanceRouteActive(pathname, wolffNavItem.href) ? 'page' : undefined} className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-400/25 bg-gradient-to-r from-blue-500/15 to-emerald-500/[0.08] p-3 text-blue-100">
              <BrandLogo className="h-10 w-10" />
              <div className="min-w-0"><span className="block text-sm font-semibold">Talk to Wolff</span><span className="block truncate text-[10px] text-blue-200/60">Daily decisions, trade-offs, and motivation</span></div>
              <WolffIcon className="ml-auto h-4 w-4 text-blue-300" />
            </Link>

            {primaryFinanceSections.map((section, index) => (
              <div key={section.label} className={index > 0 ? 'mt-4 border-t border-white/[0.08] pt-4' : ''}>
                <p className="sidebar-group-label px-3 text-[10px] font-semibold uppercase tracking-[0.18em]">{section.label}</p>
                <div className="mt-2 space-y-1">{section.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={closeMobile} />)}</div>
              </div>
            ))}

            <div className="mt-5 border-t border-white/[0.08] pt-5">
              <div className="mb-3 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45"><LayoutGrid className="h-3.5 w-3.5" /> Specialist tools</div>
              <div className="space-y-4">
                {financeToolSections.map(section => (
                  <div key={section.label}>
                    <p className="px-3 text-[9px] font-bold uppercase tracking-[0.16em] text-blue-200/40">{section.label}</p>
                    <div className="mt-1 space-y-1">{section.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={closeMobile} />)}</div>
                  </div>
                ))}
              </div>
            </div>
          </nav>
        </div>
      )}

      <nav className="mobile-dock fixed inset-x-0 bottom-0 z-50 flex h-[4.25rem] items-center justify-around px-1 pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Quick finance navigation">
        {mobileDockItems.map(item => {
          const active = isFinanceRouteActive(pathname, item.href)
          const Icon = item.icon
          const wolff = item.href === wolffNavItem.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`mobile-dock-link flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 ${active ? 'mobile-dock-link-active' : ''} ${wolff ? 'mobile-dock-wolff' : ''}`}
            >
              {wolff ? <BrandLogo className="h-7 w-7" /> : <Icon className="h-[18px] w-[18px]" />}
              <span className="text-[9px] font-semibold">{item.shortLabel || item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={toggleMobile}
          aria-label="Open all finance tools"
          aria-expanded={mobileOpen}
          aria-controls="finance-mobile-menu"
          className={`mobile-dock-link flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 ${toolRouteActive ? 'mobile-dock-link-active' : ''}`}
        >
          <LayoutGrid className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-semibold">More</span>
        </button>
      </nav>

      <aside className="app-sidebar sticky top-0 hidden h-screen min-h-screen w-60 shrink-0 flex-col overflow-y-auto px-4 py-5 md:flex lg:w-[264px]">
        <div className="mb-6 flex items-center gap-3.5 px-2">
          <BrandLogo className="h-10 w-10" />
          <div><h2 className="text-[15px] font-semibold tracking-tight text-white">Finance</h2><p className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/45">Personal Finance</p></div>
        </div>

        <button type="button" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))} className="sidebar-search mb-4 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs">
          <Search className="h-3.5 w-3.5" /><span>Search or jump…</span><kbd className="ml-auto rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
        </button>

        <Link href="/finance/ask" aria-current={isFinanceRouteActive(pathname, wolffNavItem.href) ? 'page' : undefined} className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-400/20 bg-gradient-to-r from-blue-500/15 to-emerald-500/[0.07] p-3 text-blue-100 hover:border-blue-400/35 hover:bg-blue-500/20">
          <BrandLogo className="h-9 w-9" /><div className="min-w-0"><span className="block text-[12px] font-semibold">Talk to Wolff</span><span className="block truncate text-[9px] text-blue-200/55">Daily financial copilot</span></div><WolffIcon className="ml-auto h-4 w-4 text-blue-300" />
        </Link>

        <nav aria-label="Primary finance navigation">
          {primaryFinanceSections.map(section => (
            <div key={section.label} className="mb-3">
              <p className="sidebar-group-label px-3 text-[9px] font-semibold uppercase tracking-[0.2em]">{section.label}</p>
              <div className="mt-1.5 flex flex-col gap-0.5">{section.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} compact />)}</div>
            </div>
          ))}
        </nav>

        <details open={toolRouteActive || undefined} className="group mt-1 border-t border-white/[0.08] pt-3">
          <summary className="sidebar-group-label flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.18em] hover:bg-white/5">
            <LayoutGrid className="h-3.5 w-3.5" /><span>All tools</span><ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-3">
            {financeToolSections.map(section => (
              <div key={section.label}>
                <p className="px-3 text-[8px] font-bold uppercase tracking-[0.14em] text-blue-200/35">{section.label}</p>
                <div className="mt-0.5 flex flex-col gap-0.5">{section.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} compact />)}</div>
              </div>
            ))}
          </div>
        </details>

        <div className="sidebar-footer mt-auto space-y-3 border-t border-white/[0.08] pt-4">
          <FinanceAuthBadge collapsed={false} />
          <div className="flex items-center gap-2 px-2 text-[11px] text-white/55"><div className="relative h-2 w-2 rounded-full bg-emerald-500 animate-pulse before:absolute before:inset-[-3px] before:rounded-full before:border before:border-emerald-400/30" /><span>Connected</span></div>
          <p className="px-2 text-[9px] uppercase tracking-[0.14em] text-white/25">v2.1 · Wolff Finance</p>
        </div>
      </aside>
    </>
  )
}
