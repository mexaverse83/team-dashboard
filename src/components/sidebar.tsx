'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Zap, LayoutGrid, MessageCircle, Users, BarChart3, DollarSign, Wallet, ArrowLeftRight, PiggyBank, RefreshCw, FileBarChart, ChevronsLeft, ChevronsRight, Menu, X, Calculator, Search, Landmark, ShieldCheck, Target } from 'lucide-react'

const navItems = [
  { href: '/', icon: Home, label: 'Overview' },
  { href: '/mission-control', icon: Zap, label: 'Mission Control' },
  { href: '/tasks', icon: LayoutGrid, label: 'Tasks' },
  { href: '/comms', icon: MessageCircle, label: 'Comms Log' },
  { href: '/metrics', icon: BarChart3, label: 'Metrics' },
  { href: '/costs', icon: DollarSign, label: 'Costs' },
  { href: '/agents', icon: Users, label: 'Agents' },
]

const financeTrack = [
  { href: '/finance', icon: Wallet, label: 'Overview' },
  { href: '/finance/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { href: '/finance/budgets', icon: PiggyBank, label: 'Budgets' },
  { href: '/finance/subscriptions', icon: RefreshCw, label: 'Subscriptions' },
]

const financePlan = [
  { href: '/finance/budget-builder', icon: Calculator, label: 'Budget Builder' },
  { href: '/finance/debt', icon: Landmark, label: 'Debt Planner' },
  { href: '/finance/emergency-fund', icon: ShieldCheck, label: 'Emergency Fund' },
  { href: '/finance/goals', icon: Target, label: 'Goals' },
]

const financeAnalyze = [
  { href: '/finance/audit', icon: Search, label: 'Audit' },
  { href: '/finance/reports', icon: FileBarChart, label: 'Reports' },
]

const financeItems = [...financeTrack, ...financePlan, ...financeAnalyze]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
    {/* Mobile: top bar with hamburger */}
    <div className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-sm h-12 px-4">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
          <span className="text-xs">🚀</span>
        </div>
        <span className="text-sm font-semibold">Squad Dashboard</span>
      </div>
      <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-md hover:bg-[hsl(var(--accent))]">
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
    </div>

    {/* Mobile: slide-out nav overlay */}
    {mobileOpen && (
      <div className="md:hidden fixed inset-0 z-40" onClick={() => setMobileOpen(false)}>
        <div className="absolute inset-0 bg-black/50" />
        <nav className="absolute top-12 right-0 bottom-0 w-64 bg-[hsl(var(--background))] border-l border-[hsl(var(--border))] overflow-y-auto p-4 space-y-1"
          onClick={e => e.stopPropagation()}>
          <span className="px-2 text-[10px] font-medium uppercase tracking-widest text-[hsl(var(--text-tertiary))]">Dashboard</span>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive(item.href) ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] font-medium' : 'text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--accent))]'
              }`}>
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
          {[
            { label: 'Track', items: financeTrack },
            { label: 'Plan', items: financePlan },
            { label: 'Analyze', items: financeAnalyze },
          ].map(group => (
            <div key={group.label} className="pt-3 mt-3 border-t border-[hsl(var(--border))]">
              <span className="px-2 text-[10px] font-medium uppercase tracking-widest text-[hsl(var(--text-tertiary))]">{group.label}</span>
              <div className="mt-2 space-y-1">
                {group.items.map(item => (
                  <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      pathname === item.href ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))] font-medium' : 'text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--accent))]'
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
      {[navItems[0], { href: '/finance', icon: Wallet, label: 'Finance' }, { href: '/finance/transactions', icon: ArrowLeftRight, label: 'Add' }, navItems[4], navItems[6]].map(item => (
        <Link key={item.href} href={item.href}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-md transition-colors ${
            isActive(item.href) && (item.href !== '/' || pathname === '/') ? 'text-blue-400' : 'text-[hsl(var(--text-secondary))]'
          }`}>
          <item.icon className="h-5 w-5" />
          <span className="text-[10px]">{item.label.split(' ')[0]}</span>
        </Link>
      ))}
    </nav>

    <aside
      className={`hidden md:flex flex-col border-r border-[hsl(var(--border))] min-h-screen shrink-0 sticky top-0 h-screen transition-all duration-200 ease-in-out ${
        collapsed ? 'w-[52px] p-2' : 'w-60 p-4'
      }`}
    >
      {/* Logo */}
      <div className={`flex items-center gap-3 mb-6 ${collapsed ? 'justify-center' : 'px-2'}`}>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shrink-0">
          <span className="text-base">🚀</span>
        </div>
        {!collapsed && (
          <div>
            <h2 className="font-semibold text-sm">Interstellar Squad</h2>
            <p className="text-[10px] text-[hsl(var(--text-secondary))]">Dashboard v2</p>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="border-b border-[hsl(var(--border))] mb-4" />

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2 rounded-md text-sm text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors ${
              collapsed ? 'justify-center p-2' : 'px-3 py-2'
            }`}
            title={item.label}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>

      {/* Finance Section */}
      <div className="mt-6 pt-4 border-t border-[hsl(var(--border))]">
        {[
          { label: 'Track', items: financeTrack },
          { label: 'Plan', items: financePlan },
          { label: 'Analyze', items: financeAnalyze },
        ].map(group => (
          <div key={group.label} className="mb-2">
            {!collapsed && (
              <span className="px-3 text-[10px] font-medium uppercase tracking-widest text-[hsl(var(--text-tertiary))]">{group.label}</span>
            )}
            <div className={`${collapsed ? '' : 'mt-1'} flex flex-col gap-0.5`}>
              {group.items.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md text-sm text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors ${
                    collapsed ? 'justify-center p-2' : 'px-3 py-1.5'
                  }`}
                  title={item.label}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="text-xs">{item.label}</span>}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto space-y-3">
        <div className={`flex items-center gap-2 text-xs text-[hsl(var(--text-secondary))] ${collapsed ? 'justify-center' : 'px-2'}`}>
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {!collapsed && <span>Connected</span>}
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle sidebar"
          className={`flex items-center gap-2 w-full rounded-md text-xs text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))] transition-colors ${
            collapsed ? 'justify-center p-2' : 'px-3 py-2'
          }`}
        >
          {collapsed ? <ChevronsRight className="h-3.5 w-3.5" aria-hidden /> : <><ChevronsLeft className="h-3.5 w-3.5" aria-hidden /><span>Collapse</span></>}
        </button>

        {!collapsed && (
          <p className="text-[10px] text-[hsl(var(--text-tertiary))] text-center">v2.0 · Nexaminds</p>
        )}
      </div>
    </aside>
    </>
  )
}
