'use client'

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

export function coinColor(symbol: string): string {
  if (COIN_COLOR[symbol]) return COIN_COLOR[symbol]
  let hash = 0
  for (const ch of symbol) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return `hsl(var(--cat-${(hash % 8) + 1}))`
}

export function CoinLogo({ symbol, size = 32, src }: { symbol: string; size?: number; src?: string | null }) {
  const url = src || COIN_LOGOS[symbol]
  return (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${coinColor(symbol)} 18%, transparent)`, color: coinColor(symbol) }}>
      {/* Remote CoinGecko logos are tiny static images; next/image would need a remote-host allowlist for no gain. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" width={size} height={size} loading="lazy" className="h-full w-full object-cover" /> : symbol.slice(0, 1)}
    </span>
  )
}

export const formatQty = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(n)

/** Short quantity for the owner split ("1.71", "2,440", "0.0042"). */
export function formatQtyShort(n: number): string {
  const abs = Math.abs(n)
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n)
}
