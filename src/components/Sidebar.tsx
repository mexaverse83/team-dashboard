'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, ArrowLeftRight, PiggyBank, RefreshCw, FileBarChart, Menu, X, Calculator, Search, Search as SearchIcon, Landmark, ShieldCheck, Target, CreditCard, Sparkles, TrendingUp, Banknote, Wand2, Bitcoin, MessageCircle } from 'lucide-react'
import { FinanceAuthBadge } from './finance-auth-badge'

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

const navGroups = [
  { label: 'Track', items: financeTrack },
  { label: 'Plan', items: financePlan },
  { label: 'Analyze', items: financeAnalyze },
]

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
    <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-sm h-12 px-4">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
          <span className="text-xs">💰</span>
        </div>
        <span className="text-sm font-semibold">Finance</span>
      </div>
      <button onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" className="p-2 rounded-md hover:bg-[hsl(var(--accent))]">
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </div>

    {/* Mobile: slide-out nav overlay */}
    {mobileOpen && (
      <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileOpen(false)}>
        <div className="absolute inset-0 bg-black/50" />
        <nav className="absolute top-12 right-0 bottom-0 w-64 bg-[hsl(var(--background))] border-l border-[hsl(var(--border))] overflow-y-auto p-4 space-y-1"
          onClick={e => e.stopPropagation()}>
          {navGroups.map((group, i) => (
            <div key={group.label} className={i > 0 ? 'pt-3 mt-3 border-t border-[hsl(var(--border))]' : ''}>
              <span className="px-2 text-[10px] font-medium uppercase tracking-widest text-[hsl(var(--text-tertiary))]">{group.label}</span>
              <div className="mt-2 space-y-1">
                {group.items.map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      pathname === item.href ? 'bg-emerald-500/10 text-emerald-700 font-medium' : 'text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--accent))]'
                    }`}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>
    )}

    {/* Mobile: bottom quick-access bar */}
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-sm h-14 px-1">
      {mobileQuickAccess.map(item => (
        <Link key={item.href} href={item.href}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-md transition-colors ${
            isActive(item.href) ? 'text-emerald-600' : 'text-[hsl(var(--text-secondary))]'
          }`}>
          <item.icon className="h-5 w-5" />
          <span className="text-[10px]">{item.label.split(' ')[0]}</span>
        </Link>
      ))}
    </nav>

    {/* Desktop: always-visible sidebar */}
    <aside className="hidden md:flex flex-col border-r border-[hsl(208,22%,89%)] bg-[hsl(0,0%,100%)] min-h-screen shrink-0 sticky top-0 h-screen w-60 p-4 overflow-y-auto">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-6 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 shrink-0">
          <span className="text-base">💰</span>
        </div>
        <div>
          <h2 className="font-semibold text-sm">Finance</h2>
          <p className="text-[10px] text-[hsl(var(--text-secondary))]">Personal Finance</p>
        </div>
      </div>

      {/* Search — opens the command palette */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
        className="flex items-center gap-2 w-full mb-4 px-3 py-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--bg-surface))]/60 text-xs text-[hsl(var(--text-tertiary))] hover:border-emerald-500/40 hover:text-[hsl(var(--text-secondary))] transition-colors"
      >
        <SearchIcon className="h-3.5 w-3.5" />
        <span>Search…</span>
        <kbd className="ml-auto px-1.5 py-0.5 rounded border border-[hsl(var(--border))] bg-[hsl(var(--bg-elevated))] text-[10px] font-mono">⌘K</kbd>
      </button>

      {/* Finance nav */}
      <div>
        {navGroups.map(group => (
          <div key={group.label} className="mb-2">
            <span className="px-3 text-[10px] font-medium uppercase tracking-widest text-[hsl(var(--text-tertiary))]">{group.label}</span>
            <div className="mt-1 flex flex-col gap-0.5">
              {group.items.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md text-sm hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors px-3 py-1.5 ${
                    pathname === item.href ? 'bg-emerald-500/10 text-emerald-700 font-medium shadow-[inset_2px_0_0_0_#34d399]' : 'text-[hsl(var(--text-secondary))]'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="text-xs">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto space-y-3">
        <FinanceAuthBadge collapsed={false} />
        <div className="flex items-center gap-2 text-xs text-[hsl(var(--text-secondary))] px-2">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Connected</span>
        </div>
        <p className="text-[10px] text-[hsl(var(--text-tertiary))] text-center">v2.0 · Nexaminds</p>
      </div>
    </aside>
    </>
  )
}
