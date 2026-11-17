'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardHeader } from '@/components/ui/card'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { formatCoinPrice, formatDateShort, formatMoney } from '@/lib/format'
import { TickerBadge, formatShares } from './ticker-badge'

export interface StockTxRow {
  id: string
  holding_id: string
  type: 'buy' | 'sell'
  shares: number
  price: number
  price_currency: 'USD' | 'MXN'
  fx_usd_mxn: number | null
  commission: number
  total: number
  broker: string | null
  notes: string | null
  transaction_date: string
  ticker: string
  owner: string
}

interface StockHistoryProps {
  transactions: readonly StockTxRow[]
  onLog: () => void
  onDelete: (tx: StockTxRow) => void
}

const money = (n: number, currency: 'USD' | 'MXN') => formatMoney(Number(n), { currency, showCurrency: true, mode: 'precise' })

export function StockHistory({ transactions, onLog, onDelete }: StockHistoryProps) {
  return (
    <>
      <CardHeader title={<span id="stock-transactions" className="scroll-mt-24">Transaction history</span>}
        action={<Button size="sm" variant="secondary" onClick={onLog}><Plus aria-hidden className="h-4 w-4" />Log</Button>} />
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm" aria-label="Stock transaction history">
          <thead>
            <tr className="border-b border-border text-label text-fg-secondary">
              <th scope="col" className="px-3 py-2.5 text-left font-medium">Date</th>
              <th scope="col" className="px-2 py-2.5 text-left font-medium">Type</th>
              <th scope="col" className="px-2 py-2.5 text-left font-medium">Stock</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Shares</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Price</th>
              <th scope="col" className="hidden px-2 py-2.5 text-right font-medium md:table-cell">Commission</th>
              <th scope="col" className="px-2 py-2.5 text-right font-medium">Total</th>
              <th scope="col" className="hidden px-2 py-2.5 text-left font-medium lg:table-cell">Broker</th>
              <th scope="col" className="px-2 py-2.5 text-left font-medium">Owner</th>
              <th scope="col" className="w-12 px-2 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-fg-secondary">{formatDateShort(tx.transaction_date, { withYear: 'auto' })}</td>
                <td className="px-2 py-2.5"><StatusPill tone={tx.type === 'buy' ? 'positive' : 'negative'}>{tx.type === 'buy' ? 'Buy' : 'Sell'}</StatusPill></td>
                <td className="px-2 py-2.5 font-medium"><span className="inline-flex items-center gap-1.5"><TickerBadge ticker={tx.ticker} size={20} /><span className="font-mono">{tx.ticker}</span></span></td>
                <td className="tabular-nums px-2 py-2.5 text-right font-mono">{formatShares(Number(tx.shares))}</td>
                <td className="tabular-nums px-2 py-2.5 text-right">{formatCoinPrice(Number(tx.price), { currency: tx.price_currency, suffix: true })}</td>
                <td className="tabular-nums hidden px-2 py-2.5 text-right text-fg-secondary md:table-cell" data-money="">{Number(tx.commission) > 0 ? money(tx.commission, tx.price_currency) : '—'}</td>
                <td className="tabular-nums px-2 py-2.5 text-right font-semibold" data-money="">
                  {money(tx.total, tx.price_currency)}
                  {tx.price_currency === 'USD' && tx.fx_usd_mxn ? <span className="block text-label font-normal text-fg-tertiary">≈ {formatMoney(Number(tx.total) * Number(tx.fx_usd_mxn))}</span> : null}
                </td>
                <td className="hidden px-2 py-2.5 text-label text-fg-secondary lg:table-cell">{tx.broker || '—'}</td>
                <td className="px-2 py-2.5"><OwnerAvatar owner={tx.owner} size={18} /></td>
                <td className="px-2 py-1 text-right">
                  <Button variant="ghost" size="icon" aria-label={`Delete ${tx.ticker} ${tx.type} on ${formatDateShort(tx.transaction_date)}`} onClick={() => onDelete(tx)}>
                    <Trash2 className="h-4 w-4 text-negative" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 sm:hidden" aria-label="Stock transaction history">
        {transactions.map(tx => (
          <li key={tx.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusPill tone={tx.type === 'buy' ? 'positive' : 'negative'}>{tx.type === 'buy' ? 'Buy' : 'Sell'}</StatusPill>
                <span className="font-mono text-sm font-medium">{tx.ticker}</span>
                <OwnerAvatar owner={tx.owner} size={16} />
                <span className="tabular-nums ml-auto text-sm font-semibold" data-money="">{money(tx.total, tx.price_currency)}</span>
              </div>
              <p className="mt-1 flex justify-between gap-2 text-label text-fg-secondary">
                <span>{formatDateShort(tx.transaction_date, { withYear: 'auto' })} · {tx.broker || 'No broker'}</span>
                <span className="tabular-nums">{formatShares(Number(tx.shares))} @ {formatCoinPrice(Number(tx.price), { currency: tx.price_currency })}</span>
              </p>
            </div>
            <Button variant="ghost" size="icon" aria-label={`Delete ${tx.ticker} ${tx.type} on ${formatDateShort(tx.transaction_date)}`} onClick={() => onDelete(tx)}>
              <Trash2 className="h-4 w-4 text-negative" />
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}
