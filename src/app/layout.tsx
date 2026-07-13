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
  title: "Wolff Finance — Bernardo + Laura",
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
    title: 'Wolff Finance',
  },
}

export const viewport = {
  themeColor: '#080d19',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="finance-app min-h-screen">
        <PwaRegister />
        <CommandPalette />
        <div className="flex min-h-screen min-w-0">
          <Sidebar />
          <main className="min-h-screen min-w-0 flex-1 overflow-x-hidden px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(5rem+env(safe-area-inset-top))] min-[360px]:px-4 sm:px-5 md:p-7 lg:p-9 xl:p-10">
            <div className="mx-auto w-full max-w-[1560px]">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}
