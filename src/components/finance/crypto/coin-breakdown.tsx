'use client'

import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyText } from '@/components/ui/money-text'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { ownerSplitLabel, type CoinBreakdown as Breakdown, type CoinRow } from '@/lib/crypto-portfolio'
import { formatCoinPrice, formatDelta, formatMoney, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CoinLogo, coinColor, formatQty, formatQtyShort } from './coin-logo'

interface CoinBreakdownProps {
  breakdown: Breakdown
  /** Show each owner's share of the coin (household view). */
  showOwners: boolean
  onLog: (row: CoinRow) => void
  onRemove: (row: CoinRow) => void
}

const plTone = (pl: number | null) => (pl === null ? 'text-fg-tertiary' : pl >= 0 ? 'text-positive' : 'text-negative')

function PlText({ pl, pct, partial }: { pl: number | null; pct: number | null; partial?: boolean }) {
  if (pl === null) return <span className="text-fg-tertiary" title="No cost basis recorded: log the buy to see P/L">—</span>
  return (
    <span className={cn('tabular-nums', plTone(pl))} data-money="" title={partial ? 'Only the part with a cost basis' : undefined}>
      {formatMoney(pl, { sign: 'always' })}
      {pct !== null && <span className="ml-1 text-label">({formatDelta(pct, { unit: 'pct', decimals: 1 })}){partial ? '*' : ''}</span>}
    </span>
  )
}

function ShareBar({ symbol, pct }: { symbol: string; pct: number }) {
  return (
    <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-surface-3">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: coinColor(symbol) }} />
    </span>
  )
}

export function CoinBreakdown({ breakdown, showOwners, onLog, onRemove }: CoinBreakdownProps) {
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
            {rows.map(r => (
              <tr key={r.symbol} className={cn('border-b border-border last:border-0 hover:bg-surface-2', r.quantity <= 0 && 'text-fg-tertiary')}>
                <td className="px-2 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <CoinLogo symbol={r.symbol} size={28} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-fg">{r.symbol}</span>
                      <span className="block truncate text-label text-fg-tertiary">{r.name}</span>
                    </span>
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="tabular-nums block font-mono">{formatQty(r.quantity)}</span>
                  {showOwners && r.owners.some(o => o.quantity > 0) && (
                    <span className="tabular-nums block text-label text-fg-tertiary">{ownerSplitLabel(r.owners, formatQtyShort)}</span>
                  )}
                </td>
                <td className="tabular-nums hidden px-2 py-2.5 text-right text-fg-secondary lg:table-cell">
                  {r.priceMXN !== null ? formatCoinPrice(r.priceMXN, { currency: 'MXN' }) : '—'}
                </td>
                <td className="px-2 py-2.5 text-right font-semibold">
                  {r.priceMXN !== null ? <MoneyText value={r.valueMXN} /> : <span className="text-label font-normal text-warning">no price</span>}
                </td>
                <td className="hidden px-2 py-2.5 text-right text-fg-secondary md:table-cell">
                  {r.costMXN > 0 ? <MoneyText value={r.costMXN} /> : '—'}
                </td>
                <td className="px-2 py-2.5 text-right"><PlText pl={r.pl} pct={r.plPct} partial={r.partialBasis} /></td>
                <td className="px-2 py-2.5 text-right">
                  <span className="tabular-nums block">{formatPct(r.sharePct)}</span>
                  <ShareBar symbol={r.symbol} pct={r.sharePct} />
                </td>
                <td className="px-1 py-1 text-right">
                  <span className="inline-flex">
                    <Button variant="ghost" size="icon" aria-label={`Log ${r.symbol} transaction`} onClick={() => onLog(r)}><Plus className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Remove ${r.symbol}`} onClick={() => onRemove(r)}><Trash2 className="h-4 w-4 text-negative" /></Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong font-semibold">
              <th scope="row" className="px-2 py-3 text-left">Total <span className="font-normal text-fg-tertiary">· {heldCount} {heldCount === 1 ? 'coin' : 'coins'}</span></th>
              <td className="px-2 py-3" />
              <td className="hidden px-2 py-3 lg:table-cell" />
              <td className="px-2 py-3 text-right"><MoneyText value={totals.valueMXN} /></td>
              <td className="hidden px-2 py-3 text-right md:table-cell">{totals.costMXN > 0 ? <MoneyText value={totals.costMXN} /> : '—'}</td>
              <td className="px-2 py-3 text-right"><PlText pl={totals.pl} pct={totals.plPct} /></td>
              <td className="tabular-nums px-2 py-3 text-right">{totals.valueMXN > 0 ? formatPct(100) : '—'}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phones: a compact row per coin that expands to the detail and actions. */}
      <ul className="-mx-1 sm:hidden" aria-label="Holdings by coin">
        {rows.map(r => {
          const expanded = open === r.symbol
          const split = showOwners ? ownerSplitLabel(r.owners, formatQtyShort) : ''
          return (
            <li key={r.symbol} className="border-b border-border last:border-0">
              <button type="button" aria-expanded={expanded} aria-controls={`coin-${r.symbol}`}
                onClick={() => setOpen(expanded ? null : r.symbol)}
                className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left">
                <CoinLogo symbol={r.symbol} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-fg">{r.symbol} <span className="font-normal text-fg-tertiary">{r.name}</span></span>
                    <span className="shrink-0 text-sm font-semibold">
                      {r.priceMXN !== null ? <MoneyText value={r.valueMXN} /> : <span className="text-label font-normal text-warning">no price</span>}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-2 text-label">
                    <span className="tabular-nums min-w-0 truncate text-fg-secondary">
                      {formatQtyShort(r.quantity)}{split && r.owners.filter(o => o.quantity > 0).length > 1 ? <span className="text-fg-tertiary"> · {split}</span> : null}
                    </span>
                    <span className="tabular-nums shrink-0">
                      {r.plPct !== null
                        ? <span className={plTone(r.pl)}>{formatDelta(r.plPct, { unit: 'pct', decimals: 1 })}</span>
                        : <span className="text-fg-tertiary">—</span>}
                      <span className="ml-2 text-fg-tertiary">{formatPct(r.sharePct)}</span>
                    </span>
                  </span>
                </span>
                <ChevronDown aria-hidden className={cn('h-4 w-4 shrink-0 text-fg-tertiary transition-transform', expanded && 'rotate-180')} />
              </button>
              {expanded && (
                <div id={`coin-${r.symbol}`} className="mb-3 space-y-2 rounded-xl bg-surface-2 p-3 text-[0.8125rem]">
                  <ShareBar symbol={r.symbol} pct={r.sharePct} />
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Holdings</dt><dd className="tabular-nums font-mono">{formatQty(r.quantity)} {r.symbol}</dd></div>
                    {showOwners && r.owners.map(o => (
                      <div key={o.owner} className="flex justify-between gap-3 pl-2">
                        <dt><OwnerAvatar owner={o.owner} size={16} showName /></dt>
                        <dd className="tabular-nums text-fg-secondary">{formatQty(o.quantity)} · <MoneyText value={o.valueMXN} /></dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Price</dt><dd className="tabular-nums">{r.priceMXN !== null ? formatCoinPrice(r.priceMXN, { currency: 'MXN' }) : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Cost basis</dt><dd>{r.costMXN > 0 ? <MoneyText value={r.costMXN} /> : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">P/L</dt><dd><PlText pl={r.pl} pct={r.plPct} partial={r.partialBasis} /></dd></div>
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
            <span className="block text-sm font-semibold"><MoneyText value={totals.valueMXN} /></span>
            <span className="block text-label"><PlText pl={totals.pl} pct={totals.plPct} /></span>
          </span>
        </li>
      </ul>
    </>
  )
}
