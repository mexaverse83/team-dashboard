import type { Metadata } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/Sidebar"
import { CommandPalette } from "@/components/command-palette"
import { PwaRegister } from "@/components/pwa-register"
import { ThemeSync } from "@/components/ui/theme-toggle"
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme"

// Self-hosted via next/font: no render-blocking Google Fonts request chain.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

// Display face for headings and hero numerals (VIS-19: kept until the couple
// decides; numerals in tables use Inter tabular figures via .num).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
})

export const metadata: Metadata = {
  title: "Mona Finance — Bernardo + Laura",
  description: "Household financial plan for Bernardo and Laura",
  icons: {
    icon: [
      { url: '/icons/favicon-64.png', sizes: '64x64', type: 'image/png' },
    ],
    shortcut: '/icons/favicon-64.png',
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Mona Finance',
  },
}

export const viewport = {
  // Default (dark) chrome; the init script swaps it for a saved Light choice.
  themeColor: THEME_COLORS.dark,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme / color-scheme are set by the init script before paint, so the
    // server markup intentionally differs from the hydrated <html> attributes.
    <html lang="en" data-theme="dark" className={`${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="finance-app min-h-screen">
        <a href="#main-content" className="btn-primary sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:p-3">Skip to content</a>
        <ThemeSync />
        <PwaRegister />
        <CommandPalette />
        <div className="flex min-h-screen min-w-0">
          <Sidebar />
          <main id="main-content" tabIndex={-1} className="min-h-screen min-w-0 flex-1 overflow-x-hidden px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] min-[360px]:px-4 sm:px-5 md:p-7 lg:p-9 xl:p-10">
            <div className="mx-auto w-full max-w-[1560px]">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}
