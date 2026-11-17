'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { cn } from '@/lib/utils'
import { TickerBadge } from './ticker-badge'
import { inputClass, labelClass } from './trade-fields'

export interface EditableStock {
  id: string
  ticker: string
  name: string
  owner: string
  shares: number
  avg_cost_basis: number | null
  currency?: string | null
  broker: string | null
  notes: string | null
}

interface EditStockModalProps {
  /** One ticker's holdings (one per owner); null = closed. */
  holdings: EditableStock[] | null
  /** Logged transactions for a holding (editing shares then records the difference). */
  txCount: (holdingIds: string[]) => number
  onClose: () => void
  onSaved: () => void | Promise<void>
}

export function EditStockModal({ holdings, txCount, onClose, onSaved }: EditStockModalProps) {
  return (
    <Modal open={holdings !== null && holdings.length > 0} onClose={onClose} title={holdings?.[0] ? `Edit ${holdings[0].ticker}` : 'Edit stock'}>
      {holdings && holdings.length > 0 && <EditBody key={holdings.map(h => h.id).join(',')} holdings={holdings} txCount={txCount} onClose={onClose} onSaved={onSaved} />}
    </Modal>
  )
}

const str = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : String(n))

function EditBody({ holdings, txCount, onClose, onSaved }: { holdings: EditableStock[] } & Omit<EditStockModalProps, 'holdings'>) {
  const [id, setId] = useState(holdings[0].id)
  const h = holdings.find(x => x.id === id) ?? holdings[0]
  const [form, setForm] = useState(() => Object.fromEntries(holdings.map(x => [x.id, { shares: str(x.shares), cost: str(x.avg_cost_basis), broker: x.broker ?? '', notes: x.notes ?? '' }])))
  const f = form[h.id]
  const set = (patch: Partial<typeof f>) => setForm(prev => ({ ...prev, [h.id]: { ...prev[h.id], ...patch } }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shares = parseFloat(f.shares)
  const cost = f.cost.trim() ? parseFloat(f.cost) : null
  const valid = shares >= 0 && (cost === null || cost >= 0)
  const logged = txCount([h.id])
  const currency = h.currency === 'MXN' ? 'MXN' : 'USD'

  const save = async () => {
    if (!valid) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/investments/stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: h.id, shares, avg_cost_basis: cost, broker: f.broker, notes: f.notes }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || 'Couldn’t save. Try again.')
      }
      await onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <TickerBadge ticker={h.ticker} size={32} />
        <p className="min-w-0 truncate text-sm font-semibold">{h.name} <span className="font-mono font-normal text-fg-tertiary">{h.ticker}</span></p>
      </div>
      {holdings.length > 1 && (
        <Segmented ariaLabel="Whose holding" size="sm" fullWidth value={id} onChange={setId}
          options={holdings.map(x => ({ value: x.id, label: x.owner, icon: <OwnerAvatar owner={x.owner} size={16} aria-hidden /> }))} />
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-stock-shares" className={labelClass}>Shares held</label>
          <input id="edit-stock-shares" type="number" inputMode="decimal" step="any" min="0" value={f.shares} onChange={e => set({ shares: e.target.value })} className={cn(inputClass, 'num font-mono')} />
        </div>
        <div>
          <label htmlFor="edit-stock-cost" className={labelClass}>Average cost per share ({currency})</label>
          <input id="edit-stock-cost" type="number" inputMode="decimal" step="any" min="0" placeholder="Optional — needed for P/L" value={f.cost} onChange={e => set({ cost: e.target.value })} className={cn(inputClass, 'tabular-nums font-mono')} />
        </div>
      </div>
      {logged > 0 && (
        <p className="text-label text-fg-tertiary">
          {h.owner}’s {h.ticker} has {logged} logged {logged === 1 ? 'transaction' : 'transactions'}: they set the shares and cost, so prefer logging a buy or sell. The next transaction recalculates from them (extra shares entered here are kept as an opening balance).
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="edit-stock-broker" className={labelClass}>Broker</label>
          <input id="edit-stock-broker" type="text" value={f.broker} onChange={e => set({ broker: e.target.value })} className={inputClass} />
        </div>
        <div>
          <label htmlFor="edit-stock-notes" className={labelClass}>Notes</label>
          <input id="edit-stock-notes" type="text" placeholder="Optional" value={f.notes} onChange={e => set({ notes: e.target.value })} className={inputClass} />
        </div>
      </div>
      {error && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" onClick={save} disabled={saving || !valid}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}
