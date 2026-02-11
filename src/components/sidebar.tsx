'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Home, Zap, LayoutGrid, MessageCircle, Users, BarChart3, ChevronsLeft, ChevronsRight } from 'lucide-react'

const navItems = [
  { href: '/', icon: Home, label: 'Overview' },
  { href: '/mission-control', icon: Zap, label: 'Mission Control' },
  { href: '/tasks', icon: LayoutGrid, label: 'Tasks' },
  { href: '/comms', icon: MessageCircle, label: 'Comms Log' },
  { href: '/metrics', icon: BarChart3, label: 'Metrics' },
  { href: '/agents', icon: Users, label: 'Agents' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <>
    {/* Mobile bottom nav */}
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-sm h-14 px-2">
      {navItems.slice(0, 5).map(item => (
        <Link
          key={item.href}
          href={item.href}
          className="flex flex-col items-center gap-0.5 text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--foreground))] transition-colors py-1 px-2"
        >
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
