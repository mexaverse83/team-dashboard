'use client'

import { useState } from 'react'
import { Home, Pencil, Plus, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/stat'
import { MoneyText } from '@/components/ui/money-text'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { ErrorState } from '@/components/ui/error-state'
import { formatDelta, formatMoney, formatPct } from '@/lib/format'
import { diffDaysKey, localDateKey } from '@/lib/dates'
import { OWNERS } from '@/lib/owners'
import { WestTracker } from '@/components/finance/west-tracker'
import { HoldingFormModal, type HoldingField } from './holding-form-modal'
import { KV, OwnerSplitCards } from './shared'
import { propertyEquity, type Portfolio } from './portfolio'
import type { RealEstateProperty } from './types'


const RE_FIELDS: Array<HoldingField<RealEstateProperty>> = [
  { kind: 'text', key: 'name', label: 'Name', placeholder: 'Departamento Monterrey', required: true },
  {
    kind: 'select', key: 'property_type', label: 'Type', options: [
      { value: 'apartment', label: 'Apartment' }, { value: 'pre_sale', label: 'Pre-sale' }, { value: 'sale_pending', label: 'Sale pending' },
      { value: 'house', label: 'House' }, { value: 'land', label: 'Land' }, { value: 'commercial', label: 'Commercial' },
    ],
  },
  { kind: 'number', key: 'purchase_price', label: 'Purchase price', span: 1 },
  { kind: 'number', key: 'current_value', label: 'Current value', required: true, span: 1 },
  { kind: 'number', key: 'mortgage_balance', label: 'Mortgage balance', nullable: true, span: 1 },
  { kind: 'number', key: 'monthly_mortgage', label: 'Monthly mortgage', nullable: true, span: 1 },
  { kind: 'number', key: 'mortgage_rate', label: 'Mortgage rate', step: '0.0001', placeholder: '0.093', nullable: true, hint: 'Decimal: 0.093 = 9.3%', span: 1 },
  { kind: 'text', key: 'mortgage_bank', label: 'Mortgage bank', placeholder: 'BBVA', nullable: true, span: 1 },
  { kind: 'number', key: 'rental_income', label: 'Rental income', nullable: true, span: 1 },
  { kind: 'number', key: 'monthly_expenses', label: 'Monthly expenses', nullable: true, span: 1 },
  { kind: 'owner', key: 'owner', label: 'Owner' },
]

const EMPTY_RE: Partial<RealEstateProperty> = { name: '', property_type: 'apartment', purchase_price: 0, current_value: 0, owner: OWNERS[0] }

const TYPE_LABEL: Record<string, string> = { pre_sale: 'Pre-sale', sale_pending: 'Sale pending', apartment: 'Apartment', house: 'House', land: 'Land', commercial: 'Commercial' }

interface Props {
  portfolio: Portfolio
  ownerFilter: string
  failed: boolean
  onRetry: () => void
  onChanged: () => Promise<void>
}

export function RealEstateTab({ portfolio, ownerFilter, failed, onRetry, onChanged }: Props) {
  const [form, setForm] = useState<Partial<RealEstateProperty> | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { realEstate, byOwner } = portfolio
  const today = localDateKey()

  const save = async () => {
    if (!form) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/finance/investments/real-estate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (!res.ok) throw new Error('Save failed')
      setForm(null)
      await onChanged()
    } catch { setError('Couldn’t save this property. Try again.') }
    finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this property?')) return
    try {
      const res = await fetch('/api/finance/investments/real-estate', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error('Delete failed')
      await onChanged()
    } catch { setError('Couldn’t delete this property.') }
  }

  return (
    <div className="space-y-4">
      {/* WEST target tracker: the household's #1 goal lives with the property */}
      <WestTracker />

      {failed ? (
        <Card><ErrorState title="Couldn’t load properties" body="Property values didn’t load; nothing was changed." onRetry={onRetry} /></Card>
      ) : (
        <>
          {ownerFilter === 'All' && (
            <OwnerSplitCards split={byOwner.realEstate} noun="property" plural="properties"
              extraB={byOwner.realEstate.bCount === 0 ? <span> · Infonavit in Retirement</span> : null} />
          )}

          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[0.9375rem] font-semibold">Properties</h2>
            <Button size="sm" onClick={() => { setError(null); setForm(EMPTY_RE) }}><Plus aria-hidden className="h-4 w-4" />Add property</Button>
          </div>
          {error && !form && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}

          {realEstate.length === 0 ? (
            <Card variant="subtle">
              <ErrorState variant="empty" title="No properties yet" body="Add a home, pre-sale or land to track its equity."
                action={<Button variant="secondary" size="sm" onClick={() => setForm(EMPTY_RE)}><Home aria-hidden className="h-4 w-4" />Add property</Button>} />
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {realEstate.map(prop => {
                const isPreSale = prop.property_type === 'pre_sale'
                const isSalePending = prop.property_type === 'sale_pending'
                const equity = propertyEquity(prop)
                const appreciation = prop.purchase_price > 0 ? ((prop.current_value - prop.purchase_price) / prop.purchase_price) * 100 : null
                const cashFlow = (prop.rental_income || 0) - (prop.monthly_mortgage || 0) - (prop.monthly_expenses || 0)
                const staleDays = prop.last_valuation_date ? diffDaysKey(prop.last_valuation_date.slice(0, 10), today) : null
                return (
                  <Card key={prop.id}>
                    <div className="flex items-start gap-3">
                      <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--cat-3)/0.14)] text-[hsl(var(--cat-3))]">
                        <Home className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                          <span className="truncate">{prop.name}</span> <OwnerAvatar owner={prop.owner} size={16} />
                        </h4>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <StatusPill tone={isSalePending ? 'warning' : 'neutral'}>{TYPE_LABEL[prop.property_type] ?? prop.property_type}</StatusPill>
                          {staleDays !== null && staleDays > 180 && <StatusPill tone="warning">Valuation {Math.floor(staleDays / 30)} mo old</StatusPill>}
                        </div>
                      </div>
                      <div className="-mr-2 -mt-2 flex shrink-0">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${prop.name}`} onClick={() => { setError(null); setForm(prop) }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${prop.name}`} onClick={() => remove(prop.id)}><Trash2 className="h-4 w-4 text-negative" /></Button>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <Stat size="sm" money label="Current value" value={formatMoney(prop.current_value)}
                        delta={appreciation !== null ? `${formatDelta(appreciation, { unit: 'pct', decimals: 1 })} since purchase` : undefined}
                        tone={appreciation === null ? 'neutral' : appreciation >= 0 ? 'positive' : 'negative'} />
                      <Stat size="sm" money label={isPreSale ? 'Unrealized equity' : isSalePending ? 'Net proceeds' : 'Equity'} value={formatMoney(equity)} />
                    </div>

                    <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
                      {prop.mortgage_balance ? (
                        <KV label={isPreSale ? 'Remaining to developer' : 'Mortgage'}>
                          <MoneyText value={prop.mortgage_balance} />{prop.mortgage_rate ? ` @ ${formatPct(normalizePct(prop.mortgage_rate), { decimals: 1 })}` : ''}
                        </KV>
                      ) : null}
                      {prop.mortgage_balance && prop.monthly_mortgage ? <KV label="Monthly payment"><MoneyText value={-prop.monthly_mortgage} /></KV> : null}
                      {(prop.rental_income || 0) > 0 && <KV label="Rental income"><MoneyText value={prop.rental_income} sign="always" /></KV>}
                      {(prop.monthly_expenses || 0) > 0 && <KV label="Expenses"><MoneyText value={-(prop.monthly_expenses || 0)} /></KV>}
                      <KV label="Monthly cash flow" strong>
                        <span className={cashFlow > 0 ? 'text-positive' : cashFlow < 0 ? 'text-negative' : undefined}><MoneyText value={cashFlow} sign="always" /></span>
                      </KV>
                    </dl>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      <HoldingFormModal<RealEstateProperty>
        open={form !== null}
        title={form?.id ? 'Edit property' : 'Add property'}
        value={form ?? {}}
        onChange={setForm}
        fields={RE_FIELDS}
        onSubmit={save}
        onClose={() => setForm(null)}
        saving={saving}
        submitLabel={form?.id ? 'Save' : 'Add property'}
        error={form ? error : null}
      />
    </div>
  )
}

/** Mortgage rates are stored as decimals (0.093); show them as percent. */
function normalizePct(rate: number): number {
  return rate > 1 ? rate : rate * 100
}
