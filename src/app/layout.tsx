import type { Metadata } from "next"
import "./globals.css"
import { Sidebar } from "@/components/Sidebar"

export const metadata: Metadata = {
  title: "Team Dashboard — Interstellar Squad",
  description: "Mission control for our 6-agent AI team",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-50 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-sm">
          <div className="flex items-center justify-center px-4 h-12">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                <span className="text-xs">🚀</span>
              </div>
              <span className="font-semibold text-sm">Interstellar Squad</span>
            </div>
          </div>
        </header>

        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-4 pt-16 pb-20 md:pt-6 md:pb-6 md:p-6 lg:p-8 overflow-auto min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
