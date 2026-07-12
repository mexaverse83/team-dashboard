'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, ArrowLeftRight, PiggyBank, RefreshCw, FileBarChart, Menu, X, Calculator, Search, Search as SearchIcon, Landmark, ShieldCheck, Target, CreditCard, Sparkles, TrendingUp, Banknote, Wand2, Bitcoin, MessageCircle } from 'lucide-react'
import { FinanceAuthBadge } from './finance-auth-badge'
import { BrandLogo } from './brand-logo'

const financeTrack = [
  { href: '/finance', icon: Wallet, label: 'Overview' },
  { href: '/finance/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { href: '/finance/budgets', icon: PiggyBank, label: 'Budgets' },
  { href: '/finance/subscriptions', icon: RefreshCw, label: 'Subscriptions' },
  { href: '/finance/income', icon: Banknote, label: 'Income' },
  { href: '/finance/investments', icon: TrendingUp, label: 'Investments' },
  { href: '/finance/crypto', icon: Bitcoin, label: 'Crypto' },
]

const financePlan = [
  { href: '/finance/budget-builder', icon: Calculator, label: 'Budget Builder' },
  { href: '/finance/installments', icon: CreditCard, label: 'MSI Tracker' },
  { href: '/finance/debt', icon: Landmark, label: 'Debt Planner' },
  { href: '/finance/emergency-fund', icon: ShieldCheck, label: 'Emergency Fund' },
  { href: '/finance/goals', icon: Target, label: 'Goals' },
]

const financeAnalyze = [
  { href: '/finance/ask', icon: MessageCircle, label: 'Ask Wolff' },
  { href: '/finance/insights', icon: Sparkles, label: 'Insights' },
  { href: '/finance/audit', icon: Search, label: 'Audit' },
  { href: '/finance/reports', icon: FileBarChart, label: 'Reports' },
  { href: '/finance/rules', icon: Wand2, label: 'Auto Rules' },
]

const allNavGroups = [
  { label: 'Track', items: financeTrack },
  { label: 'Plan', items: financePlan },
  { label: 'Analyze', items: financeAnalyze },
]

const primaryHrefs = new Set([
  '/finance', '/finance/transactions', '/finance/budgets',
  '/finance/investments', '/finance/goals', '/finance/ask', '/finance/insights',
])

const navGroups = allNavGroups.map(group => ({
  ...group,
  items: group.items.filter(item => primaryHrefs.has(item.href) && item.href !== '/finance/ask'),
}))

const moreFinance = allNavGroups.flatMap(group => group.items).filter(item => !primaryHrefs.has(item.href))

const mobileQuickAccess = [
  { href: '/finance', icon: Wallet, label: 'Overview' },
  { href: '/finance/transactions', icon: ArrowLeftRight, label: 'Txns' },
  { href: '/finance/budgets', icon: PiggyBank, label: 'Budgets' },
  { href: '/finance/ask', icon: MessageCircle, label: 'Wolff' },
  { href: '/finance/insights', icon: Sparkles, label: 'Insights' },
]

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/finance' ? pathname === '/finance' : pathname.startsWith(href)

  return (
    <>
    {/* Mobile: top bar with hamburger */}
    <header className="mobile-masthead md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between h-16 px-4">
      <div className="flex items-center gap-3">
        <BrandLogo className="h-9 w-9" />
        <div>
          <span className="block text-sm font-semibold tracking-tight text-white">Finance</span>
          <span className="block text-[9px] font-medium uppercase tracking-[0.18em] text-white/50">Private wealth</span>
        </div>
      </div>
      <button onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white hover:bg-white/10">
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </header>

    {/* Mobile: slide-out nav overlay */}
    {mobileOpen && (
      <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileOpen(false)}>
        <div className="absolute inset-0 bg-[#050914]/80 backdrop-blur-sm" />
        <nav className="app-sidebar absolute top-16 right-0 bottom-0 w-[min(84vw,320px)] overflow-y-auto p-5 space-y-1 shadow-2xl"
          onClick={e => e.stopPropagation()}>
          <Link href="/finance/ask" onClick={() => setMobileOpen(false)} className="mb-4 flex items-center gap-3 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 text-blue-100">
            <BrandLogo className="h-9 w-9" />
            <div><span className="block text-sm font-semibold">Talk to Wolff</span><span className="text-[10px] text-blue-200/60">Your daily financial copilot</span></div>
            <MessageCircle className="ml-auto h-4 w-4" />
          </Link>
          {navGroups.map((group, i) => (
            <div key={group.label} className={i > 0 ? 'pt-3 mt-3 border-t border-[hsl(var(--border))]' : ''}>
              <span className="sidebar-group-label px-3 text-[10px] font-semibold uppercase tracking-[0.18em]">{group.label}</span>
              <div className="mt-2 space-y-1">
                {group.items.map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className={`sidebar-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${
                      isActive(item.href) ? 'sidebar-link-active' : ''
                    }`}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <details open={moreFinance.some(item => isActive(item.href))} className="group mt-3 border-t border-white/10 pt-3">
            <summary className="sidebar-group-label cursor-pointer list-none px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em]">More tools</summary>
            <div className="mt-1 space-y-1">
              {moreFinance.map(item => (
                <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`sidebar-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${isActive(item.href) ? 'sidebar-link-active' : ''}`}>
                  <item.icon className="h-4 w-4 shrink-0" /><span>{item.label}</span>
                </Link>
              ))}
            </div>
          </details>
        </nav>
      </div>
    )}

    {/* Mobile: bottom quick-access bar */}
    <nav className="mobile-dock md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around h-[4.25rem] px-1 pb-[env(safe-area-inset-bottom)]">
      {mobileQuickAccess.map(item => (
        <Link key={item.href} href={item.href}
          className={`mobile-dock-link flex min-w-[58px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 ${
            isActive(item.href) ? 'mobile-dock-link-active' : ''
          }`}>
          <item.icon className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-semibold">{item.label.split(' ')[0]}</span>
        </Link>
      ))}
    </nav>

    {/* Desktop: always-visible sidebar */}
    <aside className="app-sidebar hidden md:flex flex-col min-h-screen shrink-0 sticky top-0 h-screen w-60 lg:w-[264px] px-4 py-5 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-3.5 mb-7 px-2">
        <BrandLogo className="h-10 w-10" />
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-white">Finance</h2>
          <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-white/45">Personal Finance</p>
        </div>
      </div>

      {/* Search — opens the command palette */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        className="sidebar-search flex items-center gap-2 w-full mb-5 px-3 py-2.5 rounded-xl text-xs"
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <span>Search…</span>
        <kbd className="ml-auto rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
      </button>

      <Link href="/finance/ask" className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-400/20 bg-gradient-to-r from-blue-500/15 to-emerald-500/[0.07] p-3 text-blue-100 hover:border-blue-400/35 hover:bg-blue-500/20">
        <BrandLogo className="h-9 w-9" />
        <div className="min-w-0"><span className="block text-[12px] font-semibold">Talk to Wolff</span><span className="block truncate text-[9px] text-blue-200/55">Daily financial copilot</span></div>
        <MessageCircle className="ml-auto h-4 w-4 text-blue-300" />
      </Link>

      {/* Finance nav */}
      <div>
        {navGroups.map(group => (
          <div key={group.label} className="mb-3">
            <span className="sidebar-group-label px-3 text-[9px] font-semibold uppercase tracking-[0.2em]">{group.label}</span>
            <div className="mt-1.5 flex flex-col gap-0.5">
              {group.items.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link flex items-center gap-3 rounded-xl px-3 py-[7px] text-sm ${
                    isActive(item.href) ? 'sidebar-link-active' : ''
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="text-[12px] font-medium">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
        <details open={moreFinance.some(item => isActive(item.href))} className="group mt-2 border-t border-white/[0.08] pt-3">
          <summary className="sidebar-group-label cursor-pointer list-none rounded-lg px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.2em] hover:bg-white/5">More tools</summary>
          <div className="mt-1 flex flex-col gap-0.5">
            {moreFinance.map(item => (
              <Link key={item.href} href={item.href} className={`sidebar-link flex items-center gap-3 rounded-xl px-3 py-[7px] text-sm ${isActive(item.href) ? 'sidebar-link-active' : ''}`}>
                <item.icon className="h-4 w-4 shrink-0" /><span className="text-[12px] font-medium">{item.label}</span>
              </Link>
            ))}
          </div>
        </details>
      </div>

      {/* Footer */}
      <div className="sidebar-footer mt-auto space-y-3 border-t border-white/[0.08] pt-4">
        <FinanceAuthBadge collapsed={false} />
        <div className="flex items-center gap-2 px-2 text-[11px] text-white/55">
          <div className="relative h-2 w-2 rounded-full bg-emerald-500 animate-pulse before:absolute before:inset-[-3px] before:rounded-full before:border before:border-emerald-400/30" />
          <span>Connected</span>
        </div>
        <p className="px-2 text-[9px] uppercase tracking-[0.14em] text-white/25">v2.0 · Nexaminds</p>
      </div>
    </aside>
    </>
  )
}
