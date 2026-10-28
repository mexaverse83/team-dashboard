'use client'

import { useState } from 'react'
import { BarChart3, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MoneyText } from '@/components/ui/money-text'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { ErrorState } from '@/components/ui/error-state'
import { PrivateEquityCard, type PrivateEquityHolding } from '@/components/finance/private-equity-card'
import { OWNERS } from '@/lib/owners'
import { formatMoney } from '@/lib/format'
import { HoldingFormModal, type HoldingField } from './holding-form-modal'
import { OwnerSplitCards, SectionLabel } from './shared'
import { stockValueMXN, type Portfolio } from './portfolio'
import type { StockHolding } from './types'

const shares = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(n)

const STOCK_FIELDS: Array<HoldingField<StockHolding>> = [
  { kind: 'text', key: 'ticker', label: 'Ticker', placeholder: 'AAPL, VOO, BIMBOA.MX', required: true, mono: true, uppercase: true },
  { kind: 'text', key: 'name', label: 'Name', placeholder: 'Apple Inc.', required: true },
  { kind: 'segmented', key: 'exchange', label: 'Exchange', options: [{ value: 'US', label: 'US' }, { value: 'BMV', label: 'BMV' }], span: 1 },
  { kind: 'select', key: 'asset_type', label: 'Type', options: [{ value: 'stock', label: 'Stock' }, { value: 'etf', label: 'ETF' }, { value: 'fund', label: 'Fund' }], span: 1 },
  { kind: 'number', key: 'shares', label: 'Shares', required: true, span: 1 },
  { kind: 'number', key: 'avg_cost_basis', label: 'Avg cost (MXN)', required: true, span: 1 },
  { kind: 'text', key: 'broker', label: 'Broker', placeholder: 'GBM' },
  { kind: 'owner', key: 'owner', label: 'Owner' },
]

const EMPTY_STOCK: Partial<StockHolding> = { ticker: '', name: '', exchange: 'US', asset_type: 'stock', shares: 0, avg_cost_basis: 0, currency: 'MXN', broker: 'GBM', owner: OWNERS[0], notes: '' }

interface Props {
  portfolio: Portfolio
  ownerFilter: string
  failed: boolean
  onRetry: () => void
  onChanged: () => Promise<void>
}

export function StocksTab({ portfolio, ownerFilter, failed, onRetry, onChanged }: Props) {
  const [form, setForm] = useState<Partial<StockHolding> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { publicStocks, privateEquity, fxRate, totals, byOwner } = portfolio

  const save = async () => {
    if (!form) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/investments/stocks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error('Save failed')
      setForm(null)
      await onChanged()
    } catch { setError('Couldn’t save this holding. Try again.') }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this stock holding?')) return
    try {
      const res = await fetch('/api/finance/investments/stocks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error('Delete failed')
      await onChanged()
    } catch { setError('Couldn’t delete this holding.') }
  }

  if (failed) return <Card><ErrorState title="Couldn’t load stocks" body="Your holdings are safe; the list just didn’t load." onRetry={onRetry} /></Card>

  return (
    <div className="space-y-4">
      {ownerFilter === 'All' && <OwnerSplitCards split={byOwner.stocks} noun="position" />}

      {privateEquity.length > 0 && (
        <section className="space-y-3" aria-label="Private equity">
          <SectionLabel>Private equity</SectionLabel>
          {privateEquity.map(h => (
            <PrivateEquityCard key={h.id} holding={h as StockHolding & PrivateEquityHolding} fxRate={fxRate} />
          ))}
        </section>
      )}

      <section className="space-y-3" aria-label="Public stocks">
        <div className="flex items-center justify-between gap-3">
          <SectionLabel>Public stocks</SectionLabel>
          <Button size="sm" onClick={() => { setError(null); setForm(EMPTY_STOCK) }}><Plus aria-hidden className="h-4 w-4" />Add stock</Button>
        </div>
        {error && !form && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}

        {publicStocks.length === 0 ? (
          <Card variant="subtle">
            <ErrorState variant="empty" title="No public stocks yet" body="Add the stocks or ETFs you hold at GBM or another broker."
              action={<Button variant="secondary" size="sm" onClick={() => setForm(EMPTY_STOCK)}><BarChart3 aria-hidden className="h-4 w-4" />Add stock</Button>} />
          </Card>
        ) : (
          <>
            <Card padding="none" className="hidden overflow-hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-label text-fg-secondary">
                    <th scope="col" className="px-4 py-3 text-left font-medium">Ticker</th>
                    <th scope="col" className="px-3 py-3 text-left font-medium">Name</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Shares</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Avg cost</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Value</th>
                    <th scope="col" className="px-3 py-3 text-left font-medium">Broker</th>
                    <th scope="col" className="w-24 px-2 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {publicStocks.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          <OwnerAvatar owner={s.owner} size={18} />
                          <span className="font-mono font-semibold text-fg">{s.ticker}</span>
                          {s.exchange === 'BMV' && <span className="rounded bg-surface-3 px-1 text-micro text-fg-secondary">MX</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-fg-secondary">{s.name}</td>
                      <td className="tabular-nums px-3 py-3 text-right">{shares(s.shares)}</td>
                      <td className="px-3 py-3 text-right text-fg-secondary"><MoneyText value={s.avg_cost_basis} /></td>
                      <td className="px-3 py-3 text-right font-semibold"><MoneyText value={stockValueMXN(s, fxRate)} /></td>
                      <td className="px-3 py-3 text-label text-fg-secondary">{s.broker}</td>
                      <td className="px-2 py-1 text-right">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${s.ticker}`} onClick={() => setForm(s)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${s.ticker}`} onClick={() => remove(s.id)}><Trash2 className="h-4 w-4 text-negative" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <ul className="space-y-2 sm:hidden">
              {publicStocks.map(s => (
                <li key={s.id}>
                  <Card padding="none" className="flex items-center gap-3 p-3">
                    <OwnerAvatar owner={s.owner} size={20} />
                    <button type="button" onClick={() => setForm(s)} className="min-w-0 flex-1 text-left" aria-label={`Edit ${s.ticker}`}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">{s.ticker}</span>
                        <span className="text-sm font-semibold"><MoneyText value={stockValueMXN(s, fxRate)} /></span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-3 text-label text-fg-secondary">
                        <span className="min-w-0 truncate">{s.name} · {s.broker}</span>
                        <span className="tabular-nums shrink-0">{shares(s.shares)} sh</span>
                      </span>
                    </button>
                  </Card>
                </li>
              ))}
            </ul>
          </>
        )}
        {privateEquity.length > 0 && totals.privateEquity > 0 && (
          <p className="text-label text-fg-tertiary">
            Stocks total includes {formatMoney(totals.privateEquity)} of estimated private equity (illiquid until exit).
          </p>
        )}
      </section>

      <HoldingFormModal<StockHolding>
        open={form !== null}
        title={form?.id ? 'Edit stock' : 'Add stock'}
        value={form ?? {}}
        onChange={setForm}
        fields={STOCK_FIELDS}
        onSubmit={save}
        onClose={() => setForm(null)}
        saving={saving}
        submitLabel={form?.id ? 'Save' : 'Add stock'}
        error={form ? error : null}
      />
    </div>
  )
}
