'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { stockHolders, type StockRow } from '@/lib/stock-portfolio'
import { cn } from '@/lib/utils'
import { formatShares } from './ticker-badge'

export interface RemoveStockTarget {
  row: StockRow
  /** Pre-selected scope: one owner's holding id, or 'all' for the whole ticker. */
  initial: string
}

interface RemoveStockModalProps {
  target: RemoveStockTarget | null
  /** Logged transactions per holding id (from the loaded history). */
  txCount: (holdingIds: string[]) => number
  onClose: () => void
  onRemoved: () => void | Promise<void>
}

export function RemoveStockModal({ target, txCount, onClose, onRemoved }: RemoveStockModalProps) {
  return (
    <Modal open={target !== null} onClose={onClose} title={target ? `Remove ${target.row.ticker}` : 'Remove stock'}>
      {target && <RemoveBody key={`${target.row.ticker}:${target.initial}`} target={target} txCount={txCount} onClose={onClose} onRemoved={onRemoved} />}
    </Modal>
  )
}

function RemoveBody({ target, txCount, onClose, onRemoved }: { target: RemoveStockTarget } & Omit<RemoveStockModalProps, 'target'>) {
  const { row } = target
  const [scope, setScope] = useState(target.initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const holders = stockHolders(row)
  const owner = scope === 'all' ? undefined : row.owners.find(o => o.holdingId === scope)
  const ids = owner ? owner.holdingIds : row.holdingIds
  const count = txCount(ids)
  const what = owner
    ? `${owner.owner}’s ${row.ticker}`
    : `${row.name} (${row.ticker}) for ${row.owners.length > 1 ? 'both of you' : holders[0]?.owner ?? 'everyone'}`

  const remove = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/finance/investments/stocks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        // Explicit ids: one owner's removal never takes the other owner's shares with it.
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Remove failed')
      }
      await onRemoved()
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message !== 'Remove failed' ? e.message : 'Couldn’t remove it. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const options = [
    ...(row.owners.length > 1 ? row.owners.map(o => ({ value: o.holdingId, owner: o.owner as string | null, label: `Only ${o.owner}’s`, detail: o.shares > 0 ? `${formatShares(o.shares)} sh` : 'empty · history only' })) : []),
    { value: 'all', owner: null as string | null, label: row.owners.length > 1 ? 'Both — the whole stock' : `${row.owners[0]?.owner ?? ''}’s ${row.ticker}`, detail: `${formatShares(row.shares)} sh` },
  ]

  return (
    <div className="space-y-4">
      {options.length > 1 && (
        <div role="radiogroup" aria-label="What to remove" className="space-y-2">
          {options.map(o => {
            const on = scope === o.value
            return (
              <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => setScope(o.value)}
                className={cn('flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                  on ? 'border-primary bg-surface-3 font-medium text-fg ring-1 ring-primary' : 'border-border bg-surface-2 text-fg-secondary hover:text-fg')}>
                <span className="flex items-center gap-2">
                  <span aria-hidden className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2',
                    on ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong')}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  {o.owner && <OwnerAvatar owner={o.owner} size={18} aria-hidden />}{o.label}
                </span>
                <span className="tabular-nums text-label text-fg-tertiary">{o.detail}</span>
              </button>
            )
          })}
        </div>
      )}
      <p className="text-sm text-fg">
        This removes {what} from the portfolio, together with {count > 0 ? <strong>{count} logged {count === 1 ? 'transaction' : 'transactions'}</strong> : 'any logged transactions'} (its whole history).
        {' '}It can’t be undone.
      </p>
      {error && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" className="flex-1" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove'}</Button>
      </div>
    </div>
  )
}
