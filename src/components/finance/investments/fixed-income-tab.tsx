'use client'

import { useState } from 'react'
import { Pencil, Plus, Shield, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/stat'
import { Modal } from '@/components/ui/modal'
import { MoneyText } from '@/components/ui/money-text'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { ErrorState } from '@/components/ui/error-state'
import { effectiveNetRate, normalizeRate } from '@/lib/fixed-income'
import { formatDateShort, formatMoney, formatPct } from '@/lib/format'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { HoldingFormModal, type HoldingField } from './holding-form-modal'
import { KV, OwnerSplitCards, TierBadge } from './shared'
import type { Portfolio } from './portfolio'
import type { FIGroup, FixedIncomeInstrument } from './types'

const pct = (rate: number) => formatPct(rate * 100, { decimals: 2 })

const FI_FIELDS: Array<HoldingField<FixedIncomeInstrument>> = [
  {
    kind: 'select', key: 'instrument_type', label: 'Type', options: [
      { value: 'cetes', label: 'CETES' }, { value: 'debt_fund', label: 'Debt fund (GBM, etc.)' }, { value: 'hey_banco', label: 'Hey Banco' },
      { value: 'nu', label: 'Nu' }, { value: 'supertasas', label: 'Supertasas' }, { value: 'kubo', label: 'Kubo Financiero' },
      { value: 'mercadopago', label: 'Mercado Pago' }, { value: 'other', label: 'Other' },
    ],
  },
  { kind: 'text', key: 'name', label: 'Name', placeholder: 'CETES 28 días', required: true },
  { kind: 'text', key: 'institution', label: 'Institution', placeholder: 'CETES Directo', required: true },
  { kind: 'number', key: 'principal', label: 'Principal (MXN)', required: true, span: 1 },
  { kind: 'number', key: 'annual_rate', label: 'Annual rate', step: '0.0001', placeholder: '0.1125', hint: 'Decimal: 0.1125 = 11.25%', span: 1 },
  { kind: 'number', key: 'term_days', label: 'Term (days)', placeholder: '28', nullable: true, integer: true, span: 1 },
  { kind: 'date', key: 'maturity_date', label: 'Maturity date', span: 1 },
  {
    kind: 'custom', key: 'commission', render: (v, set) => v.instrument_type !== 'debt_fund' ? null : (
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-warning/30 bg-warning-bg p-3">
        <div>
          <label htmlFor="fi-commission" className="mb-1 block text-label font-medium text-fg-secondary">Commission rate</label>
          <input id="fi-commission" type="number" step="0.0001" placeholder="0.0125" value={v.commission_rate ?? ''}
            onChange={e => {
              const cr = parseFloat(e.target.value) || 0
              set({ commission_rate: cr || null, net_annual_rate: (v.annual_rate || 0) - cr || null })
            }}
            className="tabular-nums h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-sm" />
          <p className="mt-1 text-micro text-fg-tertiary">0.0125 = 1.25%</p>
        </div>
        <div>
          <label htmlFor="fi-settlement" className="mb-1 block text-label font-medium text-fg-secondary">Settlement days</label>
          <input id="fi-settlement" type="number" placeholder="3" value={v.settlement_days ?? ''}
            onChange={e => set({ settlement_days: e.target.value ? parseInt(e.target.value, 10) : null })}
            className="tabular-nums h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-sm" />
          <p className="mt-1 text-micro text-fg-tertiary">GBM = 3 (48–72h)</p>
        </div>
        <p className="col-span-2 text-label text-fg">
          Net rate <strong className="tabular-nums">{pct((v.annual_rate || 0) - (v.commission_rate || 0))}</strong>
          <span className="text-fg-secondary"> (gross {pct(v.annual_rate || 0)} − commission {pct(v.commission_rate || 0)})</span>
        </p>
      </div>
    ),
  },
  { kind: 'checkbox', key: 'is_liquid', label: 'Liquid', span: 1 },
  { kind: 'checkbox', key: 'auto_renew', label: 'Auto-renew', span: 1 },
  { kind: 'select', key: 'tier', label: 'Tier', numeric: true, options: [{ value: 1, label: 'Tier 1 — Fintech' }, { value: 2, label: 'Tier 2 — Broker/Neobank' }, { value: 3, label: 'Tier 3 — Higher yield' }] },
  { kind: 'owner', key: 'owner', label: 'Owner' },
]

const EMPTY_FI: Partial<FixedIncomeInstrument> = { instrument_type: 'cetes', name: '', institution: '', principal: 0, annual_rate: 0, term_days: null, maturity_date: null, is_liquid: false, auto_renew: false, owner: OWNERS[0], tier: 1 }

async function postFI(body: Record<string, unknown>) {
  const res = await fetch('/api/finance/investments/fixed-income', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error('Save failed')
}

interface Props {
  portfolio: Portfolio
  ownerFilter: string
  failed: boolean
  onRetry: () => void
  onChanged: () => Promise<void>
}

export function FixedIncomeTab({ portfolio, ownerFilter, failed, onRetry, onChanged }: Props) {
  const [form, setForm] = useState<Partial<FixedIncomeInstrument> | null>(null)
  const [split, setSplit] = useState<{ group: FIGroup; slices: Record<string, string> } | null>(null)
  const [addFunds, setAddFunds] = useState<{ group: FIGroup; owner: string; amount: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { fixedIncome, fiGroups, totals, byOwner } = portfolio

  const run = async (fn: () => Promise<void>, failMessage: string, done: () => void) => {
    setSaving(true); setError(null)
    try { await fn(); done(); await onChanged() } catch { setError(failMessage) } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this instrument?')) return
    try {
      const res = await fetch('/api/finance/investments/fixed-income', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (!res.ok) throw new Error('Delete failed')
      await onChanged()
    } catch { setError('Couldn’t delete this instrument.') }
  }

  if (failed) return <Card><ErrorState title="Couldn’t load fixed income" body="Balances are safe; the list just didn’t load." onRetry={onRetry} /></Card>

  const accrued = totals.fixedIncome - totals.fixedIncomeCost
  const weightedNet = totals.fixedIncomeCost > 0
    ? fixedIncome.reduce((s, i) => s + effectiveNetRate(i) * i.principal, 0) / totals.fixedIncomeCost
    : null
  const monthlyInterest = fixedIncome.reduce((s, i) => s + (i.principal * effectiveNetRate(i)) / 12, 0)

  return (
    <div className="space-y-4">
      {ownerFilter === 'All' && <OwnerSplitCards split={byOwner.fixedIncome} noun="fund" />}

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat className="col-span-2 sm:col-span-1" money label="Estimated value" value={formatMoney(totals.fixedIncome)}
            hint={accrued >= 1 ? `+${formatMoney(accrued)} accrued since last statement` : `${formatMoney(totals.fixedIncomeCost)} confirmed`} />
          <Stat label="Avg net yield" value={weightedNet === null ? '—' : pct(weightedNet)} />
          <Stat money label="Monthly interest" value={formatMoney(monthlyInterest)} />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setError(null); setForm(EMPTY_FI) }}><Plus aria-hidden className="h-4 w-4" />Add instrument</Button>
      </div>
      {error && !form && !split && !addFunds && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}

      {fiGroups.length === 0 ? (
        <Card variant="subtle">
          <ErrorState variant="empty" title="No fixed income yet" body="Add CETES, GBM debt funds, Hey Banco or Nu balances."
            action={<Button variant="secondary" size="sm" onClick={() => setForm(EMPTY_FI)}><Shield aria-hidden className="h-4 w-4" />Add instrument</Button>} />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fiGroups.map(group => {
            const inst = group.representative
            const multi = ownerFilter === 'All' && group.allMembers.length > 1
            const netRate = effectiveNetRate(inst)
            const name = inst.name.trim()
            return (
              <Card key={`${inst.institution}-${name}-${inst.instrument_type}`} className="flex flex-col">
                <div className="flex items-start gap-3">
                  <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--cat-1)/0.14)] text-sm font-bold text-[hsl(var(--cat-1))]">
                    {inst.institution.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="flex items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{name}</span>
                      {(multi ? group.allMembers : group.filtered.slice(0, 1)).map(i => <OwnerAvatar key={i.id} owner={i.owner} size={16} />)}
                    </h4>
                    <p className="text-label text-fg-secondary">{inst.institution}</p>
                  </div>
                  <div className="-mr-2 -mt-2 flex shrink-0">
                    {group.allMembers.length > 1 ? (
                      <Button variant="ghost" size="icon" aria-label={`Edit ownership split of ${name}`}
                        onClick={() => setSplit({ group, slices: Object.fromEntries(group.allMembers.map(m => [m.id, String(m.principal)])) })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : (
                      <>
                        <Button variant="ghost" size="icon" aria-label={`Edit ${name}`} onClick={() => { setError(null); setForm(group.filtered[0]) }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${name}`} onClick={() => remove(group.filtered[0].id)}><Trash2 className="h-4 w-4 text-negative" /></Button>
                      </>
                    )}
                  </div>
                </div>

                <dl className="mb-3 mt-3 flex-1 space-y-1.5">
                  <KV label="Estimated value" strong><MoneyText value={group.totalValue} /></KV>
                  <KV label="Confirmed principal"><MoneyText value={group.totalPrincipal} /></KV>
                  {multi && (
                    <div className="space-y-1 rounded-lg bg-surface-2 p-2">
                      {group.allMembers.map(m => (
                        <div key={m.id} className="flex items-center justify-between gap-2 text-label">
                          <OwnerAvatar owner={m.owner} size={16} showName />
                          <span className="tabular-nums text-fg">
                            <MoneyText value={m.principal} />
                            <span className="text-fg-tertiary"> · {formatPct(group.totalPrincipal > 0 ? (m.principal / group.totalPrincipal) * 100 : 0)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {inst.commission_rate ? (
                    <>
                      <KV label="Gross rate">{pct(normalizeRate(inst.annual_rate))}</KV>
                      <KV label="Commission">{`−${pct(normalizeRate(inst.commission_rate))}`}</KV>
                      <KV label="Net rate" strong>{pct(netRate)}</KV>
                    </>
                  ) : (
                    <KV label="Rate">{pct(normalizeRate(inst.annual_rate))}</KV>
                  )}
                  <KV label="Term">
                    {inst.is_liquid ? 'Liquid' : inst.settlement_days ? `${inst.settlement_days}d settlement` : `${inst.term_days ?? '—'}d${inst.maturity_date ? ` · matures ${formatDateShort(inst.maturity_date, { withYear: 'auto' })}` : ''}`}
                  </KV>
                  <KV label="Net yield / year"><MoneyText value={group.totalPrincipal * netRate} /></KV>
                </dl>

                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TierBadge tier={inst.tier} />
                    {inst.auto_renew && <StatusPill tone="neutral">Auto-renew</StatusPill>}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => {
                    const owner = ownerFilter !== 'All' ? ownerFilter : OWNERS[0]
                    setError(null)
                    setAddFunds({ group, owner: group.allMembers.find(m => ownersEqual(m.owner, owner))?.owner ?? group.allMembers[0].owner, amount: '' })
                  }}>
                    <Plus aria-hidden className="h-3.5 w-3.5" />Add funds
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <HoldingFormModal<FixedIncomeInstrument>
        open={form !== null}
        title={form?.id ? 'Edit instrument' : 'Add instrument'}
        value={form ?? {}}
        onChange={setForm}
        fields={FI_FIELDS}
        onSubmit={() => form && run(() => postFI(form), 'Couldn’t save this instrument. Try again.', () => setForm(null))}
        onClose={() => setForm(null)}
        saving={saving}
        submitLabel={form?.id ? 'Save' : 'Add instrument'}
        error={form ? error : null}
      />

      <Modal
        open={split !== null}
        onClose={() => setSplit(null)}
        title="Edit ownership split"
        footer={(
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setSplit(null)}>Cancel</Button>
            <Button className="flex-1" disabled={saving} onClick={() => split && run(
              () => Promise.all(split.group.allMembers.map(m => postFI({ id: m.id, principal: parseFloat(split.slices[m.id]) || m.principal }))).then(() => undefined),
              'Couldn’t save the split. Try again.', () => setSplit(null),
            )}>{saving ? 'Saving…' : 'Save split'}</Button>
          </div>
        )}
      >
        {split && (() => {
          const total = split.group.allMembers.reduce((s, m) => s + (parseFloat(split.slices[m.id]) || 0), 0)
          return (
            <div className="space-y-4">
              <p className="text-[0.8125rem] text-fg-secondary">
                {split.group.representative.name.trim()} · {split.group.representative.institution}. One fund held by several people: edit each person&apos;s slice. Rates and settings apply to all.
              </p>
              {split.group.allMembers.map(m => (
                <div key={m.id}>
                  <label htmlFor={`slice-${m.id}`} className="mb-1 flex items-center gap-1.5 text-label font-medium text-fg-secondary">
                    <OwnerAvatar owner={m.owner} size={16} /> {m.owner}&apos;s balance (MXN)
                  </label>
                  <input id={`slice-${m.id}`} type="number" step="1000" min="0" inputMode="decimal" value={split.slices[m.id] ?? ''}
                    onChange={e => setSplit({ ...split, slices: { ...split.slices, [m.id]: e.target.value } })}
                    className="tabular-nums h-11 w-full rounded-xl border border-border bg-surface-2 px-3 font-mono text-sm" />
                </div>
              ))}
              <dl className="rounded-xl bg-surface-2 p-3"><KV label="Combined" strong><MoneyText value={total} /></KV></dl>
              {error && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}
            </div>
          )
        })()}
      </Modal>

      <Modal
        open={addFunds !== null}
        onClose={() => setAddFunds(null)}
        title="Add funds"
        footer={(() => {
          const amount = parseFloat(addFunds?.amount ?? '') || 0
          return (
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setAddFunds(null)}>Cancel</Button>
              <Button className="flex-1" disabled={saving || amount <= 0} onClick={() => {
                const member = addFunds?.group.allMembers.find(m => ownersEqual(m.owner, addFunds.owner))
                if (!member) return
                run(() => postFI({ id: member.id, principal: member.principal + amount }), 'Couldn’t add funds. Try again.', () => setAddFunds(null))
              }}>{saving ? 'Saving…' : amount > 0 ? `Add ${formatMoney(amount)}` : 'Add'}</Button>
            </div>
          )
        })()}
      >
        {addFunds && (() => {
          const member = addFunds.group.allMembers.find(m => ownersEqual(m.owner, addFunds.owner))
          const amount = parseFloat(addFunds.amount) || 0
          return (
            <div className="space-y-4">
              <p className="text-[0.8125rem] text-fg-secondary">{addFunds.group.representative.name.trim()} · {addFunds.group.representative.institution}</p>
              <fieldset>
                <legend className="mb-2 text-label font-medium text-fg-secondary">Who is investing?</legend>
                <div className="grid grid-cols-2 gap-2">
                  {addFunds.group.allMembers.map(m => {
                    const selected = ownersEqual(m.owner, addFunds.owner)
                    return (
                      <button key={m.id} type="button" aria-pressed={selected} onClick={() => setAddFunds({ ...addFunds, owner: m.owner })}
                        className={selected ? 'rounded-xl border border-positive bg-positive-bg p-3 text-left' : 'rounded-xl border border-border bg-surface-2 p-3 text-left hover:border-border-strong'}>
                        <OwnerAvatar owner={m.owner} size={16} showName />
                        <span className="mt-1 block text-label text-fg-secondary"><MoneyText value={m.principal} /></span>
                      </button>
                    )
                  })}
                </div>
              </fieldset>
              <div>
                <label htmlFor="add-funds-amount" className="mb-1 block text-label font-medium text-fg-secondary">Amount to add (MXN)</label>
                <input id="add-funds-amount" type="number" step="1000" min="0" inputMode="decimal" placeholder="50000" value={addFunds.amount}
                  onChange={e => setAddFunds({ ...addFunds, amount: e.target.value })}
                  className="tabular-nums h-11 w-full rounded-xl border border-border bg-surface-2 px-3 font-mono text-sm" />
              </div>
              {amount > 0 && member && (
                <dl className="space-y-1 rounded-xl bg-surface-2 p-3">
                  <KV label="Current"><MoneyText value={member.principal} /></KV>
                  <KV label="Adding"><MoneyText value={amount} sign="always" /></KV>
                  <KV label="New balance" strong><MoneyText value={member.principal + amount} /></KV>
                </dl>
              )}
              {error && <p role="alert" className="text-[0.8125rem] text-negative">{error}</p>}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
