import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/Sidebar"
import { CommandPalette } from "@/components/command-palette"
import { PwaRegister } from "@/components/pwa-register"

// Self-hosted via next/font: no render-blocking Google Fonts request chain.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

// Display face for headings and hero numerals — gives the product a voice
// beyond default Inter-everywhere.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
})

export const metadata: Metadata = {
  title: "Finance — Autonomis",
  description: "Personal finance dashboard",
  icons: {
    icon: [
      { url: '/favicon-finance.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Finance',
  },
}

export const viewport = {
  themeColor: '#f7fafb',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen">
        <PwaRegister />
        <CommandPalette />
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-50 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 backdrop-blur-sm">
          <div className="flex items-center justify-center px-4 h-12">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
                <span className="text-xs">💰</span>
              </div>
              <span className="font-semibold text-sm">Finance</span>
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
