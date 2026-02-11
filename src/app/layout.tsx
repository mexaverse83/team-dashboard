import type { Metadata } from "next"
import "./globals.css"
import Link from "next/link"
import { Home, Zap, LayoutGrid, MessageCircle, Users, BarChart3 } from "lucide-react"
import { Sidebar } from "@/components/sidebar"

export const metadata: Metadata = {
  title: "Team Dashboard — Interstellar Squad",
  description: "Mission control for our 6-agent AI team",
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
          <Sidebar />
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
