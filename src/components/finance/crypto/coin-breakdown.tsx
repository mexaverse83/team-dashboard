'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyText } from '@/components/ui/money-text'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { holdersOf, ownerSplitLabel, type CoinBreakdown as Breakdown, type CoinRow } from '@/lib/crypto-portfolio'
import type { CryptoDisplay } from '@/lib/crypto-display'
import { formatDelta, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CoinLogo, coinColor, formatQty, rowQtyFormatter } from './coin-logo'

interface CoinBreakdownProps {
  breakdown: Breakdown
  /** Show each owner's share of the coin (household view). */
  showOwners: boolean
  /** MXN or USD view. */
  display: CryptoDisplay
  onLog: (row: CoinRow) => void
  onRemove: (row: CoinRow) => void
}

const plTone = (pl: number | null) => (pl === null ? 'text-fg-tertiary' : pl >= 0 ? 'text-positive' : 'text-negative')

function PlText({ pl, pct, partial, display }: { pl: number | null; pct: number | null; partial?: boolean; display: CryptoDisplay }) {
  if (pl === null) return <span className="text-fg-tertiary" title="No cost basis recorded: log the buy to see P/L">—</span>
  return (
    <span className={cn('tabular-nums', plTone(pl))} data-money="" title={partial ? 'Only the part with a cost basis' : undefined}>
      {display.money(pl, { sign: 'always' })}
      {pct !== null && <span className="ml-1 text-label">({formatDelta(pct, { unit: 'pct', decimals: 1 })}){partial ? '*' : ''}</span>}
    </span>
  )
}

function ShareBar({ row }: { row: CoinRow }) {
  return (
    <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-surface-3">
      {row.priceMXN !== null && <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.sharePct))}%`, background: coinColor(row.symbol, row.coingeckoId) }} />}
    </span>
  )
}

/** An MXN amount shown in the display currency. */
function Money({ mxn, display }: { mxn: number; display: CryptoDisplay }) {
  return <MoneyText value={display.amount(mxn)} {...display.textProps} />
}

/** A coin's quantity line: the total and, in the household view, whose it is. */
function qtyParts(r: CoinRow, showOwners: boolean) {
  const holders = holdersOf(r).filter(o => o.quantity > 0)
  const fmt = rowQtyFormatter([r.quantity, ...holders.map(o => o.quantity)])
  // Two holders: "B 1.71 · L 0.3647"; one: whose it is.
  const split = !showOwners ? '' : holders.length > 1 ? ownerSplitLabel(holders, fmt) : holders[0]?.owner ?? ''
  return { total: fmt(r.quantity), split }
}

/** Total value, or "—" when no coin has a price (never a $0 that reads as a loss). */
function TotalValue({ totals, heldCount, display }: { totals: Breakdown['totals']; heldCount: number; display: CryptoDisplay }) {
  if (heldCount > 0 && totals.unpriced.length >= heldCount) {
    return <span className="text-fg-tertiary" title="No live prices right now">—</span>
  }
  return (
    <>
      <Money mxn={totals.valueMXN} display={display} />
      {totals.unpriced.length > 0 && <span className="block text-label font-normal text-warning">excl. {totals.unpriced.join(', ')}</span>}
    </>
  )
}

export function CoinBreakdown({ breakdown, showOwners, display, onLog, onRemove }: CoinBreakdownProps) {
  const [open, setOpen] = useState<string | null>(null)
  const { rows, totals } = breakdown
  const heldCount = rows.filter(r => r.quantity > 0).length

  return (
    <>
      {/* Desktop / tablet: one table row per coin, totals at the foot. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm" aria-label="Holdings by coin">
          <thead>
            <tr className="border-b border-border text-label text-fg-secondary">
              <th scope="col" className="px-2 py-2.5 text-left font-medium">Coin</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Holdings</th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-medium lg:table-cell">Price</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Value</th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-medium md:table-cell">Cost basis</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">P/L</th>
              <th scope="col" className="w-24 px-2 py-2.5 text-right font-medium">Share</th>
              <th scope="col" className="w-20 px-1 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const q = qtyParts(r, showOwners)
              return (
              <tr key={r.symbol} className={cn('border-b border-border last:border-0 hover:bg-surface-2', r.quantity <= 0 && 'text-fg-tertiary')}>
                <td className="px-2 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CoinLogo symbol={r.symbol} coinId={r.coingeckoId} size={28} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-fg">{r.symbol}</span>
                      <span className="block truncate text-label text-fg-tertiary">{r.name}</span>
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="tabular-nums block">{q.total}</span>
                  {q.split && <span className="tabular-nums block text-label text-fg-tertiary">{q.split}</span>}
                </td>
                <td className="tabular-nums hidden px-2 py-2.5 text-right text-fg-secondary lg:table-cell">
                  {r.priceMXN !== null ? display.price({ mxn: r.priceMXN, usd: r.priceUSD }) : '—'}
                </td>
                <td className="px-2 py-2.5 text-right font-semibold">
                  {r.priceMXN !== null ? <Money mxn={r.valueMXN} display={display} /> : <span className="text-label font-normal text-warning">no price</span>}
                </td>
                <td className="hidden px-2 py-2.5 text-right text-fg-secondary md:table-cell">
                  {r.costMXN > 0 ? <Money mxn={r.costMXN} display={display} /> : '—'}
                </td>
                <td className="px-2 py-2.5 text-right"><PlText pl={r.pl} pct={r.plPct} partial={r.partialBasis} display={display} /></td>
                <td className="px-2 py-2.5 text-right">
                  <span className="tabular-nums block">{r.priceMXN !== null ? formatPct(r.sharePct) : '—'}</span>
                  <ShareBar row={r} />
                </td>
                <td className="px-1 py-1 text-right">
                  <span className="inline-flex">
                    <Button variant="ghost" size="icon" aria-label={`Log ${r.symbol} transaction`} onClick={() => onLog(r)}><Plus className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${r.symbol}`} onClick={() => onRemove(r)}><Trash2 className="h-4 w-4 text-negative" /></Button>
                  </span>
                </td>
              </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong font-semibold">
              <th scope="row" className="px-2 py-3 text-left">Total <span className="font-normal text-fg-tertiary">· {heldCount} {heldCount === 1 ? 'coin' : 'coins'}</span></th>
              <td className="px-2 py-3" />
              <td className="hidden px-2 py-3 lg:table-cell" />
              <td className="px-2 py-3 text-right"><TotalValue totals={totals} heldCount={heldCount} display={display} /></td>
              <td className="hidden px-2 py-3 text-right md:table-cell">{totals.costMXN > 0 ? <Money mxn={totals.costMXN} display={display} /> : '—'}</td>
              <td className="px-2 py-3 text-right"><PlText pl={totals.pl} pct={totals.plPct} display={display} /></td>
              <td className="tabular-nums px-2 py-3 text-right">{totals.valueMXN > 0 && totals.unpriced.length === 0 ? formatPct(100) : '—'}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phones: a compact row per coin that expands to the detail and actions. */}
      <ul className="-mx-1 sm:hidden" aria-label="Holdings by coin">
        {rows.map(r => {
          const expanded = open === r.symbol
          const q = qtyParts(r, showOwners)
          return (
            <li key={r.symbol} className="border-b border-border last:border-0">
              <button type="button" aria-expanded={expanded} aria-controls={`coin-${r.symbol}`}
                onClick={() => setOpen(expanded ? null : r.symbol)}
                className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left">
                <CoinLogo symbol={r.symbol} coinId={r.coingeckoId} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-fg">{r.symbol} <span className="font-normal text-fg-tertiary">{r.name}</span></span>
                    <span className="shrink-0 text-sm font-semibold">
                      {r.priceMXN !== null ? <Money mxn={r.valueMXN} display={display} /> : <span className="text-label font-normal text-warning">no price</span>}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-2 text-label">
                    <span className="tabular-nums min-w-0 truncate text-fg-secondary">
                      {q.total}{q.split ? <span className="text-fg-tertiary"> · {q.split}</span> : null}
                    </span>
                    {/* Only P/L here (labelled); the share lives in the expanded detail. */}
                    <span className="tabular-nums shrink-0">
                      {r.plPct !== null
                        ? <span className={plTone(r.pl)}><span className="text-fg-tertiary">P/L </span>{formatDelta(r.plPct, { unit: 'pct', decimals: 1 })}</span>
                        : null}
                    </span>
                  </span>
                </span>
                <ChevronDown aria-hidden className={cn('h-4 w-4 shrink-0 text-fg-tertiary transition-transform', expanded && 'rotate-180')} />
              </button>
              {expanded && (
                <div id={`coin-${r.symbol}`} className="mb-3 space-y-2 rounded-xl bg-surface-2 p-3 text-[0.8125rem]">
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Holdings</dt><dd className="tabular-nums">{formatQty(r.quantity)} {r.symbol}</dd></div>
                    {showOwners && r.owners.map(o => (
                      <div key={o.owner} className="flex justify-between gap-3 pl-2">
                        <dt><OwnerAvatar owner={o.owner} size={16} showName /></dt>
                        <dd className="tabular-nums text-fg-secondary">{formatQty(o.quantity)}{r.priceMXN !== null && <> · <Money mxn={o.valueMXN} display={display} /></>}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Price</dt><dd className="tabular-nums">{r.priceMXN !== null ? display.price({ mxn: r.priceMXN, usd: r.priceUSD }) : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Cost basis</dt><dd>{r.costMXN > 0 ? <Money mxn={r.costMXN} display={display} /> : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">P/L</dt><dd><PlText pl={r.pl} pct={r.plPct} partial={r.partialBasis} display={display} /></dd></div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-fg-secondary">Share of total</dt>
                      <dd className="flex items-center gap-2"><span className="w-16"><ShareBar row={r} /></span><span className="tabular-nums">{r.priceMXN !== null ? formatPct(r.sharePct) : '—'}</span></dd>
                    </div>
                  </dl>
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => onLog(r)}><Plus aria-hidden className="h-4 w-4" />Log</Button>
                    <Button variant="secondary" size="sm" className="flex-1 text-negative" onClick={() => onRemove(r)}><Trash2 aria-hidden className="h-4 w-4" />Remove</Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        <li className="flex items-baseline justify-between gap-3 border-t-2 border-border-strong px-1 pt-3">
          <span className="text-sm font-semibold">Total <span className="font-normal text-fg-tertiary">· {heldCount} {heldCount === 1 ? 'coin' : 'coins'}</span></span>
          <span className="text-right">
            <span className="block text-sm font-semibold"><TotalValue totals={totals} heldCount={heldCount} display={display} /></span>
            <span className="block text-label"><PlText pl={totals.pl} pct={totals.plPct} display={display} /></span>
          </span>
        </li>
      </ul>
    </>
  )
}
