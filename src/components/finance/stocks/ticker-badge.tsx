'use client'

import { useState } from 'react'

// A stock's mark: the company logo (Financial Modeling Prep's keyless logo
// CDN) on a white tile so transparent and solid logos look alike in both
// themes, or the ticker's initials on a stable palette colour when there is
// no logo (unknown ticker, offline, blocked).

const LOGO_BASE = 'https://financialmodelingprep.com/image-stock/'

export function stockLogoUrl(ticker: string): string | null {
  const t = ticker.trim().toUpperCase()
  return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t) ? `${LOGO_BASE}${encodeURIComponent(t)}.png` : null
}

export function tickerColor(ticker: string): string {
  let hash = 0
  for (const ch of ticker.toUpperCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return `hsl(var(--cat-${(hash % 8) + 1}))`
}

export function TickerBadge({ ticker, size = 32 }: { ticker: string; size?: number }) {
  const url = stockLogoUrl(ticker)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  if (url && failedUrl !== url) {
    return (
      <span aria-hidden className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-border"
        style={{ width: size, height: size, padding: Math.max(2, Math.round(size * 0.12)) }}>
        {/* Small remote logos; next/image would need a remote-host allowlist for no gain. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer"
          className="h-full w-full object-contain" onError={() => setFailedUrl(url)} />
      </span>
    )
  }
  const color = tickerColor(ticker)
  const label = ticker.replace(/\.MX$/, '').replace(/[^A-Z0-9]/gi, '').slice(0, size >= 28 ? 3 : 2)
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-lg font-mono font-bold tracking-tight"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * (label.length > 2 ? 0.3 : 0.38))), background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
      {label}
    </span>
  )
}

/** Shares to 8 decimals at most (GBM sells fractions like 0.34692423). */
export const formatShares = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(n)

/** Shorter shares for table cells: 4 decimals under 1 share, else 2–4. */
export function formatSharesShort(n: number): string {
  const abs = Math.abs(n)
  const digits = abs === 0 ? 0 : abs >= 100 ? 2 : 4
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n)
}
