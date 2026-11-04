'use client'

import { builtinCoin } from '@/lib/crypto-coins'

const COIN_LOGOS: Record<string, string> = {
  BTC: 'https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png?1696501400',
  ETH: 'https://coin-images.coingecko.com/coins/images/279/small/ethereum.png?1696501628',
  SOL: 'https://coin-images.coingecko.com/coins/images/4128/small/solana.png?1718769756',
  KAS: 'https://coin-images.coingecko.com/coins/images/25751/small/kaspa-icon-exchanges.png?1696524837',
  LIT: 'https://coin-images.coingecko.com/coins/images/71121/small/lighter.png?1765888098',
  AERO: 'https://coin-images.coingecko.com/coins/images/31745/small/token.png?1696530564',
  HYPE: 'https://coin-images.coingecko.com/coins/images/50882/small/hyperliquid.jpg?1729431300',
}

// Per-coin series colours from the categorical palette (both themes). Coins
// added later get a stable palette slot from their ticker.
const COIN_COLOR: Record<string, string> = {
  BTC: 'hsl(var(--cat-4))',
  ETH: 'hsl(var(--chart-3))',
  SOL: 'hsl(var(--cat-8))',
  KAS: 'hsl(var(--cat-2))',
  LIT: 'hsl(var(--cat-3))',
  AERO: 'hsl(var(--cat-6))',
  HYPE: 'hsl(var(--cat-1))',
}

/**
 * The built-in logo and colour belong to the built-in coin, not its ticker: a
 * different coin that shares the ticker (Litentry vs Lighter on LIT) gets its
 * own. `coinId` undefined means "the ticker's usual coin".
 */
function isBuiltinCoin(symbol: string, coinId: string | null | undefined): boolean {
  return coinId === undefined || builtinCoin(symbol)?.coingeckoId === coinId
}

export function coinColor(symbol: string, coinId?: string | null): string {
  if (COIN_COLOR[symbol] && isBuiltinCoin(symbol, coinId)) return COIN_COLOR[symbol]
  if (coinId) symbol = `${symbol}:${coinId}`
  let hash = 0
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return `hsl(var(--cat-${(hash % 8) + 1}))`
}

export function CoinLogo({ symbol, size = 32, src, coinId }: { symbol: string; size?: number; src?: string | null; coinId?: string | null }) {
  const url = src || (isBuiltinCoin(symbol, coinId) ? COIN_LOGOS[symbol] : undefined)
  const color = coinColor(symbol, coinId)
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
      {/* Remote CoinGecko logos are tiny static images; next/image would need a remote-host allowlist for no gain. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" width={size} height={size} loading="lazy" className="h-full w-full object-cover" /> : symbol.slice(0, 1)}
    </span>
  )
}

export const formatQty = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(n)

const qtyDigits = (n: number) => {
  const abs = Math.abs(n)
  return abs === 0 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
}

/** Short quantity ("1.71", "18,243.63", "0.0042"). */
export function formatQtyShort(n: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: qtyDigits(n) }).format(n)
}

/**
 * One precision for a coin's total and its owner parts, set by the smallest
 * part, so "2.0747 · B 1.71 · L 0.3647" visibly adds up.
 */
export function rowQtyFormatter(values: readonly number[]): (n: number) => string {
  const digits = Math.max(0, ...values.filter(v => v > 0).map(qtyDigits))
  const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: digits })
  return n => nf.format(n)
}
