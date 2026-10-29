'use client'

import { useState } from 'react'
import { HardHat, Info, Lock, Pencil } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Stat } from '@/components/ui/stat'
import { Modal } from '@/components/ui/modal'
import { MoneyText } from '@/components/ui/money-text'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { StatusPill } from '@/components/ui/status-pill'
import { ErrorState } from '@/components/ui/error-state'
import { useFinanceData } from '@/hooks/use-finance-data'
import { formatDateShort, formatMoney, formatPct } from '@/lib/format'
import { canonicalOwner, ownersEqual } from '@/lib/owners'
import { KV } from '@/components/finance/investments/shared'
import { TabSkeleton } from '@/components/finance/investments/tab-skeleton'

interface RetirementRecord {
  id: string
  instrument_type: string
  name: string
  institution: string | null
  owner: string
  current_balance: number
  employer_contribution_pct: number | null
  annual_return_rate: number | null
  retirement_age: number | null
  is_usable_for_west: boolean
  west_amount: number | null
  last_updated: string | null
  notes: string | null
}

// Confirmed DOBs — Wolff 2026-02-18
const OWNER_DOB: Record<string, string> = {
  bernardo: '1983-05-17',
  laura: '1989-10-22',
}

// Confirmed monthly contribution estimates — Wolff spec
const MONTHLY_CONTRIBUTIONS: Record<string, number> = {
  bernardo: 12741,
  laura: 4810,
}

const DEFAULT_RETURN = 0.085
const SCENARIOS = [
  { key: 'conservative', label: 'Conservative', rate: 0.07 },
  { key: 'base', label: 'Base', rate: DEFAULT_RETURN },
  { key: 'optimistic', label: 'Optimistic', rate: 0.10 },
] as const

function yearsToRetirement(owner: string, retirementAge = 65, now = new Date()): number {
  const dob = OWNER_DOB[owner.toLowerCase()]
  if (!dob) return 30
  const [y, m, d] = dob.split('-').map(Number)
  const retirementDate = new Date(y + retirementAge, m - 1, d)
  return Math.max(0, (retirementDate.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000))
}

function project(balance: number, rate: number, years: number) {
  return Math.round(balance * Math.pow(1 + rate, years))
}

function updatedLabel(date: string | null) {
  return date ? `Updated ${formatDateShort(date, { withYear: 'auto' })}` : 'Balance date unknown'
}

function RecordCard({ record, onEdit }: { record: RetirementRecord; onEdit: (r: RetirementRecord) => void }) {
  const isAfore = record.instrument_type === 'afore'
  const years = yearsToRetirement(record.owner, record.retirement_age ?? 65)
  const rate = record.annual_return_rate ?? DEFAULT_RETURN
  return (
    <Card className="flex flex-col">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-fg-secondary">
          {isAfore ? <Lock className="h-4 w-4" /> : <HardHat className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{record.name}</span>
            <OwnerAvatar owner={record.owner} size={16} />
          </h4>
          <p className="text-label text-fg-secondary">{isAfore ? (record.institution || 'Check the AFORE app') : 'Infonavit'}</p>
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-2" aria-label={`Update ${record.name}`} onClick={() => onEdit(record)}>
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <Stat className="mt-3" size="sm" money label={updatedLabel(record.last_updated)} value={formatMoney(record.current_balance)} />

      {isAfore ? (
        <dl className="mt-3 flex-1 space-y-1.5 border-t border-border pt-3">
          <KV label="Monthly contribution (est.)"><MoneyText value={MONTHLY_CONTRIBUTIONS[record.owner.toLowerCase()] ?? 0} /></KV>
          <KV label="Avg return">{formatPct(rate * 100, { decimals: 1 })}</KV>
          <KV label="Years to 65">{years.toFixed(1)}</KV>
          <KV label="Projected at 65 (base)" strong><MoneyText value={project(record.current_balance, rate, years)} /></KV>
        </dl>
      ) : (
        <div className="mt-3 flex-1 rounded-xl border border-positive/30 bg-positive-bg p-3 text-label">
          <p className="font-semibold text-fg">Earmarked for the WEST apartment</p>
          <p className="text-fg-secondary">Applied at delivery — Dec 2027</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {isAfore
          ? <><StatusPill>AFORE</StatusPill><StatusPill>Locked until 65</StatusPill></>
          : <><StatusPill>Infonavit</StatusPill><StatusPill tone="positive">Available for WEST</StatusPill></>}
      </div>
    </Card>
  )
}

function EditModal({ record, onSave, onClose }: {
  record: RetirementRecord
  onSave: (id: string, updates: { current_balance?: number; institution?: string; annual_return_rate?: number; notes?: string }) => Promise<boolean>
  onClose: () => void
}) {
  const [balance, setBalance] = useState(String(record.current_balance))
  const [institution, setInstitution] = useState(record.institution ?? '')
  const [rate, setRate] = useState(String(((record.annual_return_rate ?? DEFAULT_RETURN) * 100).toFixed(1)))
  const [notes, setNotes] = useState(record.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const input = 'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg'

  const handleSave = async () => {
    setSaving(true); setFailed(false)
    const ok = await onSave(record.id, {
      current_balance: parseFloat(balance) || 0,
      institution: institution || undefined,
      annual_return_rate: (parseFloat(rate) || DEFAULT_RETURN * 100) / 100,
      notes: notes || undefined,
    })
    setSaving(false)
    if (ok) onClose()
    else setFailed(true)
  }

  return (
    <Modal open onClose={onClose} title={`Update ${record.name}`} footer={(
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button className="flex-1" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Update'}</Button>
      </div>
    )}>
      <div className="space-y-3">
        <div>
          <label htmlFor="ret-balance" className="mb-1 block text-label font-medium text-fg-secondary">Balance (MXN)</label>
          <input id="ret-balance" type="number" inputMode="decimal" step="any" value={balance} onChange={e => setBalance(e.target.value)} className={`${input} tabular-nums font-mono`} />
        </div>
        {record.instrument_type === 'afore' && (
          <>
            <div>
              <label htmlFor="ret-institution" className="mb-1 block text-label font-medium text-fg-secondary">Institution</label>
              <input id="ret-institution" type="text" placeholder="SURA AFORE" value={institution} onChange={e => setInstitution(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="ret-rate" className="mb-1 block text-label font-medium text-fg-secondary">Annual return rate (%)</label>
              <input id="ret-rate" type="number" inputMode="decimal" step="0.1" min="0" max="20" value={rate} onChange={e => setRate(e.target.value)} className={`${input} tabular-nums font-mono`} />
            </div>
          </>
        )}
        <div>
          <label htmlFor="ret-notes" className="mb-1 block text-label font-medium text-fg-secondary">Notes</label>
          <textarea id="ret-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full resize-none rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-fg" />
        </div>
        {failed && <p role="alert" className="text-[0.8125rem] text-negative">Couldn&apos;t save. Try again.</p>}
      </div>
    </Modal>
  )
}

async function fetchRecords(signal: AbortSignal): Promise<RetirementRecord[]> {
  const res = await fetch('/api/finance/retirement', { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return json.records || []
}

// ═══════════════════════════════════════════
// RETIREMENT TAB
// ═══════════════════════════════════════════
interface RetirementTabProps {
  /** 'All' or an owner name in any casing. */
  ownerFilter: string
}

export function RetirementTab({ ownerFilter }: RetirementTabProps) {
  const { data: records, error, loading, refresh } = useFinanceData('retirement', fetchRecords)
  const [editingRecord, setEditingRecord] = useState<RetirementRecord | null>(null)

  const handleSave = async (id: string, updates: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/finance/retirement', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates }),
      })
      if (!res.ok) return false
      await refresh()
      return true
    } catch {
      return false
    }
  }

  if (loading) return <TabSkeleton />
  if (!records) {
    return <Card><ErrorState title="Couldn’t load retirement accounts" body="Balances are safe; they just didn’t load." onRetry={() => { void refresh() }} /></Card>
  }

  const filtered = ownerFilter.toLowerCase() === 'all' ? records : records.filter(r => ownersEqual(r.owner, ownerFilter))
  const total = filtered.reduce((s, r) => s + r.current_balance, 0)
  const aforeTotal = filtered.filter(r => r.instrument_type === 'afore').reduce((s, r) => s + r.current_balance, 0)
  const westEarmarked = filtered.filter(r => r.is_usable_for_west).reduce((s, r) => s + (r.west_amount || r.current_balance), 0)

  // Projections cover AFORE only — Infonavit goes to WEST, not retirement
  const projectionRows = filtered.filter(r => r.instrument_type === 'afore').map(r => {
    const years = yearsToRetirement(r.owner, r.retirement_age ?? 65)
    return {
      id: r.id,
      owner: r.owner,
      name: canonicalOwner(r.owner) ?? r.owner,
      years,
      values: SCENARIOS.map(s => project(r.current_balance, s.rate, years)),
    }
  })
  const projTotals = SCENARIOS.map((_, i) => projectionRows.reduce((s, r) => s + r.values[i], 0))
  const contributions = Object.values(MONTHLY_CONTRIBUTIONS).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      {error && <p role="status" className="text-label text-warning">Showing the last loaded balances — refresh failed.</p>}

      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-2 px-4 py-3 text-[0.8125rem] text-fg-secondary">
        <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <span>These funds are <span className="font-medium text-fg">locked until age 65</span> and not available for WEST or other short-term goals — except Laura&apos;s Infonavit, earmarked below.</span>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat money label="Total retirement" value={formatMoney(total)} hint="Counts toward net worth" />
          <Stat money label="AFORE combined" value={formatMoney(aforeTotal)} hint="Locked until 65" />
          <Stat className="col-span-2 sm:col-span-1" money label="Available for WEST" value={formatMoney(westEarmarked)} hint="Laura’s Infonavit" />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card variant="subtle"><ErrorState variant="empty" title="No retirement accounts for this owner" body="AFORE and Infonavit balances show up here." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(r => <RecordCard key={r.id} record={r} onEdit={setEditingRecord} />)}
        </div>
      )}

      {projectionRows.length > 0 && (
        <Card>
          <CardHeader title="Projections at age 65" description="Balance-only compounding, before future contributions." />
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-label text-fg-secondary">
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Person</th>
                  {SCENARIOS.map(s => <th key={s.key} scope="col" className="px-3 py-2.5 text-right font-medium">{s.label} ({formatPct(s.rate * 100, { decimals: s.rate === DEFAULT_RETURN ? 1 : 0 })})</th>)}
                </tr>
              </thead>
              <tbody>
                {projectionRows.map(row => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3">
                      <span className="flex items-center gap-2">
                        <OwnerAvatar owner={row.owner} size={18} showName />
                        <span className="text-label text-fg-tertiary">{row.years.toFixed(1)} yr to 65</span>
                      </span>
                    </td>
                    {row.values.map((v, i) => <td key={i} className={`px-3 py-3 text-right ${i === 1 ? 'font-semibold' : 'text-fg-secondary'}`}><MoneyText value={v} /></td>)}
                  </tr>
                ))}
                <tr className="bg-surface-2">
                  <th scope="row" className="px-3 py-3 text-left font-semibold">Combined</th>
                  {projTotals.map((v, i) => <td key={i} className="px-3 py-3 text-right font-semibold"><MoneyText value={v} /></td>)}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="space-y-2 sm:hidden">
            {projectionRows.map(row => (
              <div key={row.id} className="rounded-xl border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <OwnerAvatar owner={row.owner} size={18} showName />
                  <span className="text-label text-fg-tertiary">{row.years.toFixed(1)} yr to 65</span>
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  {SCENARIOS.map((s, i) => (
                    <div key={s.key}>
                      <dt className="text-micro text-fg-tertiary">{s.label}</dt>
                      <dd className={`tabular-nums text-sm ${i === 1 ? 'font-semibold' : ''}`} data-money="">{formatMoney(row.values[i], { mode: 'compact' })}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
          <p className="mt-3 text-label text-fg-tertiary">
            Employer contributions (est. {formatMoney(contributions)}/mo combined) are not included.
          </p>
        </Card>
      )}

      <div className="flex gap-3 rounded-xl border border-border bg-surface-2 p-4 text-label text-fg-secondary">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-relaxed">
          Employers contribute to AFORE automatically (6.5% of salary). For the exact balance, check your AFORE app or{' '}
          <a href="https://afore.mx" target="_blank" rel="noreferrer" className="font-medium text-fg underline underline-offset-2">afore.mx</a>.
        </p>
      </div>

      {editingRecord && <EditModal record={editingRecord} onSave={handleSave} onClose={() => setEditingRecord(null)} />}
    </div>
  )
}
