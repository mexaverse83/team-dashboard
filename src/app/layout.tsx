import type { Metadata } from "next"
import "./globals.css"
import Link from "next/link"
import { Home, Zap, LayoutGrid, MessageCircle, Users, BarChart3, Menu } from "lucide-react"

export const metadata: Metadata = {
  title: "Team Dashboard — Interstellar Squad",
  description: "Mission control for our 5-agent AI team",
}

function NavLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="hidden md:inline">{label}</span>
    </Link>
  )
}

const navItems = [
  { href: '/', icon: Home, label: 'Overview' },
  { href: '/mission-control', icon: Zap, label: 'Mission Control' },
  { href: '/tasks', icon: LayoutGrid, label: 'Tasks' },
  { href: '/comms', icon: MessageCircle, label: 'Comms Log' },
  { href: '/metrics', icon: BarChart3, label: 'Metrics' },
  { href: '/agents', icon: Users, label: 'Agents' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        {/* Mobile top nav */}
        <header className="md:hidden sticky top-0 z-50 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur supports-[backdrop-filter]:bg-[hsl(var(--background))]/60">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                <span className="text-sm">🚀</span>
              </div>
              <span className="font-semibold text-sm">Interstellar Squad</span>
            </div>
          </div>
          <nav className="flex items-center gap-1 px-2 pb-2 overflow-x-auto">
            {navItems.map(item => (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors whitespace-nowrap">
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </header>

        <div className="flex">
          {/* Desktop sidebar */}
          <aside className="hidden md:flex w-16 lg:w-64 border-r border-[hsl(var(--border))] min-h-screen p-3 lg:p-4 flex-col gap-6 shrink-0 sticky top-0 h-screen">
            <div className="flex items-center gap-3 px-1 lg:px-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shrink-0">
                <span className="text-lg">🚀</span>
              </div>
              <div className="hidden lg:block">
                <h2 className="font-semibold text-sm">Interstellar Squad</h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Team Dashboard</p>
              </div>
            </div>
            <nav className="flex flex-col gap-1">
              {navItems.map(item => (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-2 px-2 lg:px-3 py-2 rounded-md text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
                  title={item.label}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              ))}
            </nav>
            <div className="mt-auto px-1 lg:px-2 hidden lg:block">
              <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">Built by Cooper 🤖</p>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
