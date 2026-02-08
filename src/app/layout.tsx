import type { Metadata } from "next"
import "./globals.css"
import Link from "next/link"
import { Home, Zap, LayoutGrid, MessageCircle, Users, BarChart3 } from "lucide-react"

export const metadata: Metadata = {
  title: "Team Dashboard — Interstellar Squad",
  description: "Mission control for our 5-agent AI team",
}

function NavLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors">
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <div className="flex">
          {/* Sidebar */}
          <aside className="w-64 border-r border-[hsl(var(--border))] min-h-screen p-4 flex flex-col gap-6">
            <div className="flex items-center gap-3 px-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                <span className="text-lg">🚀</span>
              </div>
              <div>
                <h2 className="font-semibold text-sm">Interstellar Squad</h2>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">Team Dashboard</p>
              </div>
            </div>
            <nav className="flex flex-col gap-1">
              <NavLink href="/" icon={Home} label="Overview" />
              <NavLink href="/mission-control" icon={Zap} label="Mission Control" />
              <NavLink href="/tasks" icon={LayoutGrid} label="Tasks" />
              <NavLink href="/comms" icon={MessageCircle} label="Comms Log" />
              <NavLink href="/metrics" icon={BarChart3} label="Metrics" />
              <NavLink href="/agents" icon={Users} label="Agents" />
            </nav>
            <div className="mt-auto px-2">
              <p className="text-xs text-[hsl(var(--muted-foreground))] text-center">Built by Cooper 🤖</p>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 p-8 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
