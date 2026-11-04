'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { Check } from 'lucide-react'
import { holdersOf, type CoinRow, type OwnerShare } from '@/lib/crypto-portfolio'
import { cn } from '@/lib/utils'
import { formatQty } from './coin-logo'

export interface RemoveTarget {
  coin: CoinRow
  /** Pre-selected scope: one owner's holding id, or 'all' for the whole coin. */
  initial: string
}

interface RemoveCoinModalProps {
  target: RemoveTarget | null
  /** Logged transactions per holding id (from the loaded history). */
  txCount: (holdingIds: string[]) => number
  onClose: () => void
  onRemoved: () => void | Promise<void>
}

export function RemoveCoinModal({ target, txCount, onClose, onRemoved }: RemoveCoinModalProps) {
  return (
    <Modal open={target !== null} onClose={onClose} title={target ? `Remove ${target.coin.symbol}` : 'Remove coin'}>
      {target && <RemoveCoinBody key={`${target.coin.symbol}:${target.initial}`} target={target} txCount={txCount} onClose={onClose} onRemoved={onRemoved} />}
    </Modal>
  )
}

function RemoveCoinBody({ target, txCount, onClose, onRemoved }: { target: RemoveTarget } & Omit<RemoveCoinModalProps, 'target'>) {
  const { coin } = target
  const [scope, setScope] = useState(target.initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Holders = owners with some of the coin; an emptied holding (sold to 0,
  // history only) is listed only when its own card opened this window.
  const holders = holdersOf(coin)
  const held = coin.owners.filter(o => o.quantity > 0)
  const empties = held.length > 0 ? coin.owners.filter(o => o.quantity <= 0) : []
  const listed = coin.owners.filter(o => holders.includes(o) || o.holdingId === target.initial)
  const ownerChoices = coin.owners.length > 1 && (listed.length > 1 || target.initial !== 'all') ? listed : []
  const owner = scope === 'all' ? undefined : coin.owners.find(o => o.holdingId === scope)
  const ids = owner ? owner.holdingIds : coin.holdingIds
  const count = txCount(ids)
  const emptyNote = (o: OwnerShare) => `${o.owner}’s emptied ${coin.symbol} holding`
  // Name exactly the holdings that go: the whole coin also takes an emptied holding's history.
  const what = owner
    ? owner.quantity > 0 ? `${owner.owner}’s ${coin.symbol}` : emptyNote(owner)
    : `${coin.name} (${coin.symbol}) for ${holders.length > 1 ? 'both of you' : holders[0]?.owner ?? 'everyone'}${empties.length > 0 ? `, plus ${empties.map(emptyNote).join(' and ')}` : ''}`

  const remove = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/finance/crypto', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        // Explicit ids: an owner-filtered view must never take the other owner's coin with it.
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
    ...ownerChoices.map(o => ({ value: o.holdingId, owner: o.owner, label: `Only ${o.owner}’s`, detail: o.quantity > 0 ? `${formatQty(o.quantity)} ${coin.symbol}` : 'empty · history only' })),
    { value: 'all', owner: null as string | null, label: coin.owners.length > 1 ? 'Both — the whole coin' : `${holders[0]?.owner ?? ''}’s ${coin.symbol}`, detail: `${formatQty(coin.quantity)} ${coin.symbol}` },
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
        This removes {what} from the portfolio, together with {count > 0 ? <strong>{count} logged {count === 1 ? 'transaction' : 'transactions'}</strong> : 'any logged transactions'}.
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
