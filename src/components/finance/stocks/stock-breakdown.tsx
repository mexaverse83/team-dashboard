'use client'

import { useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MoneyText } from '@/components/ui/money-text'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import type { MoneyDisplay } from '@/lib/crypto-display'
import { stockHolders, type StockBreakdown as Breakdown, type StockRow } from '@/lib/stock-portfolio'
import { formatCoinPrice, formatDelta, formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { TickerBadge, formatShares, formatSharesShort, tickerColor } from './ticker-badge'

interface StockBreakdownProps {
  breakdown: Breakdown
  /** Show each owner's shares (household view). */
  showOwners: boolean
  display: MoneyDisplay
  onLog: (row: StockRow) => void
  onEdit: (row: StockRow) => void
  onRemove: (row: StockRow) => void
}

const tone = (n: number | null | undefined) => (n == null ? 'text-fg-tertiary' : n > 0 ? 'text-positive' : n < 0 ? 'text-negative' : 'text-fg')

/** Small positions (a fraction of a share) need cents: precise under 10,000 in the display currency. */
export function moneyMode(display: MoneyDisplay, mxn: number): 'precise' | 'full' {
  return Math.abs(display.amount(mxn)) < 10_000 ? 'precise' : 'full'
}

function Money({ mxn, display, sign }: { mxn: number; display: MoneyDisplay; sign?: 'always' }) {
  return <MoneyText value={display.amount(mxn)} sign={sign} mode={moneyMode(display, mxn)} {...display.textProps} />
}

function PlMoney({ pl, display }: { pl: number | null; display: MoneyDisplay }) {
  if (pl === null) return <span className="text-fg-tertiary" title="No live price or no cost basis">—</span>
  return <span className={cn('tabular-nums', tone(pl))}><Money mxn={pl} display={display} sign="always" /></span>
}

function PlPct({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-fg-tertiary">—</span>
  return <span className={cn('tabular-nums', tone(pct))}>{formatDelta(pct, { unit: 'pct', decimals: 1 })}</span>
}

function DayChange({ row }: { row: StockRow }) {
  if (row.changePct === null) return <span className="text-fg-tertiary">—</span>
  return <span className={cn('tabular-nums', tone(row.changePct))}>{formatDelta(row.changePct, { unit: 'pct', decimals: 2 })}</span>
}

/** The price in the display currency, plus the listing's own price when it differs. */
function Price({ row, display }: { row: StockRow; display: MoneyDisplay }) {
  if (row.priceMXN === null) return <span className="text-fg-tertiary">—</span>
  const listing = row.currency === 'USD' ? row.priceUSD : row.priceMXN
  return (
    <>
      <span className="tabular-nums block">{display.price({ mxn: row.priceMXN, usd: row.priceUSD })}</span>
      {row.currency !== display.currency && listing && <span className="tabular-nums block text-label text-fg-tertiary">{formatCoinPrice(listing, { currency: row.currency, suffix: true })}</span>}
    </>
  )
}

function Value({ row, display }: { row: StockRow; display: MoneyDisplay }) {
  if (row.shares <= 0) return <span className="text-label font-normal text-fg-tertiary">sold</span>
  if (row.priced) return <Money mxn={row.valueMXN} display={display} />
  return (
    <span title="No live price: valued at what it cost">
      {row.valueMXN > 0 ? <Money mxn={row.valueMXN} display={display} /> : '—'}
      <span className="block text-label font-normal text-warning">no price · at cost</span>
    </span>
  )
}

function ShareBar({ row }: { row: StockRow }) {
  return (
    <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-surface-3">
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.sharePct))}%`, background: tickerColor(row.ticker) }} />
    </span>
  )
}

/** "B 0.3469 · L 2" in owner order. */
function ownerSplit(row: StockRow): string {
  return stockHolders(row).filter(o => o.shares > 0).map(o => `${o.owner.slice(0, 1).toUpperCase()} ${formatSharesShort(o.shares)}`).join(' · ')
}

export function StockBreakdown({ breakdown, showOwners, display, onLog, onEdit, onRemove }: StockBreakdownProps) {
  const [open, setOpen] = useState<string | null>(null)
  const { rows, totals } = breakdown
  const held = rows.filter(r => r.shares > 0)
  const allUnpriced = held.length > 0 && totals.unpriced.length >= held.length
  const split = (r: StockRow) => {
    if (!showOwners) return ''
    const holders = stockHolders(r).filter(o => o.shares > 0)
    return holders.length > 1 ? ownerSplit(r) : holders[0]?.owner ?? ''
  }

  return (
    <>
      {/* Desktop / tablet: one row per ticker, totals at the foot. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm" aria-label="Holdings by stock">
          <thead>
            <tr className="border-b border-border text-label text-fg-secondary">
              <th scope="col" className="px-2 py-2.5 text-left font-medium">Stock</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Shares</th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-medium lg:table-cell">Price</th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-medium md:table-cell">Day</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Value</th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-medium lg:table-cell">Cost</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">P/L</th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-medium lg:table-cell">P/L %</th>
              <th scope="col" className="hidden w-20 px-2 py-2.5 text-right font-medium md:table-cell">Share</th>
              <th scope="col" className="w-28 px-1 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const s = split(r)
              return (
                <tr key={r.ticker} className={cn('border-b border-border last:border-0 hover:bg-surface-2', r.shares <= 0 && 'text-fg-tertiary')}>
                  <td className="px-2 py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <TickerBadge ticker={r.ticker} size={30} />
                      <span className="min-w-0">
                        <span className="block font-mono font-semibold text-fg">{r.ticker}</span>
                        <span className="block max-w-[14rem] truncate text-label text-fg-tertiary">{r.name}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <span className="tabular-nums block" title={formatShares(r.shares)}>{formatSharesShort(r.shares)}</span>
                    {s && <span className="tabular-nums block text-label text-fg-tertiary">{s}</span>}
                  </td>
                  <td className="hidden px-2 py-2.5 text-right text-fg-secondary lg:table-cell"><Price row={r} display={display} /></td>
                  <td className="hidden px-2 py-2.5 text-right md:table-cell"><DayChange row={r} /></td>
                  <td className="px-2 py-2.5 text-right font-semibold"><Value row={r} display={display} /></td>
                  <td className="hidden px-2 py-2.5 text-right text-fg-secondary lg:table-cell">{r.costMXN > 0 ? <Money mxn={r.costMXN} display={display} /> : '—'}</td>
                  <td className="px-2 py-2.5 text-right"><PlMoney pl={r.pl} display={display} /></td>
                  <td className="hidden px-2 py-2.5 text-right lg:table-cell"><PlPct pct={r.plPct} /></td>
                  <td className="hidden px-2 py-2.5 text-right md:table-cell">
                    <span className="tabular-nums block">{r.shares > 0 && !allUnpriced ? formatPct(r.sharePct) : '—'}</span>
                    <ShareBar row={r} />
                  </td>
                  <td className="px-1 py-1 text-right">
                    <span className="inline-flex">
                      <Button variant="ghost" size="icon" aria-label={`Log ${r.ticker} transaction`} onClick={() => onLog(r)}><Plus className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Edit ${r.ticker}`} onClick={() => onEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${r.ticker}`} onClick={() => onRemove(r)}><Trash2 className="h-4 w-4 text-negative" /></Button>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong font-semibold">
              <th scope="row" className="px-2 py-3 text-left">Total <span className="font-normal text-fg-tertiary">· {held.length} {held.length === 1 ? 'stock' : 'stocks'}</span></th>
              <td className="px-2 py-3" />
              <td className="hidden px-2 py-3 lg:table-cell" />
              <td className="hidden px-2 py-3 text-right md:table-cell">
                {totals.dayChangeMXN !== null ? <span className={cn('tabular-nums', tone(totals.dayChangeMXN))}><Money mxn={totals.dayChangeMXN} display={display} sign="always" /></span> : <span className="text-fg-tertiary">—</span>}
              </td>
              <td className="px-2 py-3 text-right">
                <Money mxn={totals.valueMXN} display={display} />
                {totals.unpriced.length > 0 && <span className="block text-label font-normal text-warning">{totals.unpriced.join(', ')} at cost</span>}
              </td>
              <td className="hidden px-2 py-3 text-right lg:table-cell">{totals.costMXN > 0 ? <Money mxn={totals.costMXN} display={display} /> : '—'}</td>
              <td className="px-2 py-3 text-right"><PlMoney pl={totals.pl} display={display} /></td>
              <td className="hidden px-2 py-3 text-right lg:table-cell"><PlPct pct={totals.plPct} /></td>
              <td className="tabular-nums hidden px-2 py-3 text-right md:table-cell">{totals.valueMXN > 0 && !allUnpriced ? formatPct(100) : '—'}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phones: a compact row per stock that expands to the detail and actions. */}
      <ul className="-mx-1 sm:hidden" aria-label="Holdings by stock">
        {rows.map(r => {
          const expanded = open === r.ticker
          const s = split(r)
          return (
            <li key={r.ticker} className="border-b border-border last:border-0">
              <button type="button" aria-expanded={expanded} aria-controls={`stock-${r.ticker}`}
                onClick={() => setOpen(expanded ? null : r.ticker)}
                className="flex w-full items-center gap-3 rounded-xl px-1 py-3 text-left">
                <TickerBadge ticker={r.ticker} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-fg"><span className="font-mono">{r.ticker}</span> <span className="font-normal text-fg-tertiary">{r.name}</span></span>
                    <span className="shrink-0 text-right text-sm font-semibold">
                      {r.shares <= 0 ? <span className="text-label font-normal text-fg-tertiary">sold</span>
                        : r.priced ? <Money mxn={r.valueMXN} display={display} />
                          : <span className="text-label font-normal text-warning">no price</span>}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-2 text-label">
                    <span className="tabular-nums min-w-0 truncate text-fg-secondary">
                      {formatSharesShort(r.shares)} sh{s ? <span className="text-fg-tertiary"> · {s}</span> : null}
                    </span>
                    {/* Only P/L here (labelled); the day change lives in the expanded detail. */}
                    <span className="tabular-nums shrink-0">
                      {r.plPct !== null && <><span className="text-fg-tertiary">P/L </span><PlPct pct={r.plPct} /></>}
                    </span>
                  </span>
                </span>
                <ChevronDown aria-hidden className={cn('h-4 w-4 shrink-0 text-fg-tertiary transition-transform', expanded && 'rotate-180')} />
              </button>
              {expanded && (
                <div id={`stock-${r.ticker}`} className="mb-3 space-y-2 rounded-xl bg-surface-2 p-3 text-[0.8125rem]">
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Shares</dt><dd className="tabular-nums">{formatShares(r.shares)}</dd></div>
                    {showOwners && r.owners.map(o => (
                      <div key={o.owner} className="flex justify-between gap-3 pl-2">
                        <dt><OwnerAvatar owner={o.owner} size={16} showName /></dt>
                        <dd className="tabular-nums text-fg-secondary">{formatShares(o.shares)}{o.shares > 0 && <> · <Money mxn={o.valueMXN} display={display} /></>}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Price</dt><dd className="text-right"><Price row={r} display={display} /></dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Day</dt><dd><DayChange row={r} /></dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Value</dt><dd className="text-right font-semibold"><Value row={r} display={display} /></dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">Cost</dt><dd>{r.costMXN > 0 ? <Money mxn={r.costMXN} display={display} /> : '—'}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-fg-secondary">P/L</dt><dd><PlMoney pl={r.pl} display={display} />{r.plPct !== null && <span className="ml-1 text-label">(<PlPct pct={r.plPct} />)</span>}</dd></div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-fg-secondary">Share of stocks</dt>
                      <dd className="flex items-center gap-2"><span className="w-16"><ShareBar row={r} /></span><span className="tabular-nums">{r.shares > 0 && !allUnpriced ? formatPct(r.sharePct) : '—'}</span></dd>
                    </div>
                  </dl>
                  <div className="flex gap-2 pt-1">
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => onLog(r)}><Plus aria-hidden className="h-4 w-4" />Log</Button>
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => onEdit(r)}><Pencil aria-hidden className="h-4 w-4" />Edit</Button>
                    <Button variant="secondary" size="sm" className="flex-1 text-negative" onClick={() => onRemove(r)}><Trash2 aria-hidden className="h-4 w-4" />Remove</Button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
        <li className="flex items-baseline justify-between gap-3 border-t-2 border-border-strong px-1 pt-3">
          <span className="text-sm font-semibold">Total <span className="font-normal text-fg-tertiary">· {held.length} {held.length === 1 ? 'stock' : 'stocks'}</span></span>
          <span className="text-right">
            <span className="block text-sm font-semibold"><Money mxn={totals.valueMXN} display={display} /></span>
            {totals.unpriced.length > 0 && <span className="block text-label text-warning">{totals.unpriced.join(', ')} at cost</span>}
            <span className="block text-label"><PlMoney pl={totals.pl} display={display} />{totals.plPct !== null && <span className="ml-1">(<PlPct pct={totals.plPct} />)</span>}</span>
          </span>
        </li>
      </ul>
    </>
  )
}
