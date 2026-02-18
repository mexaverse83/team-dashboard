'use client'

import { useState, useEffect } from 'react'
import { GlassCard } from '@/components/ui/glass-card'
import { OwnerDot } from '@/components/finance/owner-dot'
import { Pencil } from 'lucide-react'

function cn(...c: (string | false | null | undefined)[]) { return c.filter(Boolean).join(' ') }
function fmt(n: number) { return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) }
function fmtMXN(n: number) { return `$${fmt(n)} MXN` }

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

function yearsToRetirement(owner: string, retirementAge = 65): number {
  const dob = OWNER_DOB[owner.toLowerCase()]
  if (!dob) return 30
  const birthDate = new Date(dob)
  const retirementDate = new Date(birthDate)
  retirementDate.setFullYear(birthDate.getFullYear() + retirementAge)
  const now = new Date()
  return Math.max(0, (retirementDate.getTime() - now.getTime()) / (365.25 * 24 * 3600 * 1000))
}

function project(balance: number, rate: number, years: number) {
  return Math.round(balance * Math.pow(1 + rate, years))
}

// ─── AFORE Card ───
function AforeCard({ record, onEdit }: { record: RetirementRecord; onEdit: (r: RetirementRecord) => void }) {
  const years = yearsToRetirement(record.owner, record.retirement_age ?? 65)
  const rate = record.annual_return_rate ?? 0.085
  const projected = project(record.current_balance, rate, years)
  const monthlyContrib = MONTHLY_CONTRIBUTIONS[record.owner.toLowerCase()] ?? 0

  return (
    <GlassCard className="p-4 relative group border-l-2 border-slate-600">
      <div className="absolute top-3 right-3 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(record)} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]">
          <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" />
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-slate-700/50 border border-slate-600/50 flex items-center justify-center text-lg shrink-0">
          🔒
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-semibold truncate">{record.name}</h4>
            <OwnerDot owner={record.owner} size="sm" />
          </div>
          <p className="text-xs text-[hsl(var(--text-secondary))]">{record.institution || 'Check AFORE app'}</p>
        </div>
      </div>

      {/* Balance */}
      <p className="text-xl font-bold tabular-nums">{fmtMXN(record.current_balance)}</p>
      <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
        Updated {record.last_updated ?? 'unknown'}
      </p>

      {/* Data rows */}
      <div className="space-y-2 mt-3 pt-3 border-t border-[hsl(var(--border))] text-xs">
        <div className="flex justify-between">
          <span className="text-[hsl(var(--text-secondary))]">Monthly contribution (est.)</span>
          <span className="tabular-nums">≈ {fmtMXN(monthlyContrib)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[hsl(var(--text-secondary))]">Avg return</span>
          <span className="tabular-nums">{((record.annual_return_rate ?? 0.085) * 100).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[hsl(var(--text-secondary))]">Years to 65</span>
          <span className="tabular-nums">{years.toFixed(1)} yr</span>
        </div>
        <div className="flex justify-between font-semibold border-t border-[hsl(var(--border))] pt-2">
          <span className="text-[hsl(var(--text-secondary))]">Projected at 65 (base)</span>
          <span className="tabular-nums text-slate-300">{fmtMXN(projected)}</span>
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[hsl(var(--border))]">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-medium">AFORE</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 font-medium">🔒 Locked until 65</span>
      </div>
    </GlassCard>
  )
}

// ─── Infonavit Card ───
function InfonavitCard({ record, onEdit }: { record: RetirementRecord; onEdit: (r: RetirementRecord) => void }) {
  return (
    <GlassCard className="p-4 relative group border-l-2 border-emerald-500">
      <div className="absolute top-3 right-3 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(record)} className="p-1 rounded hover:bg-[hsl(var(--bg-elevated))]">
          <Pencil className="h-3.5 w-3.5 text-[hsl(var(--text-secondary))]" />
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-lg shrink-0">
          🏗️
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-semibold truncate">{record.name}</h4>
            <OwnerDot owner={record.owner} size="sm" />
          </div>
          <p className="text-xs text-[hsl(var(--text-secondary))]">Infonavit</p>
        </div>
      </div>

      {/* Balance */}
      <p className="text-xl font-bold tabular-nums text-emerald-400">{fmtMXN(record.current_balance)}</p>
      <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">
        Updated {record.last_updated ?? 'unknown'}
      </p>

      {/* WEST earmark box */}
      <div className="flex items-center gap-2 mt-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
        <span className="text-sm shrink-0">🏗️</span>
        <div>
          <p className="text-xs font-medium text-emerald-400">Earmarked: WEST Apartment</p>
          <p className="text-xs text-[hsl(var(--text-secondary))]">Applied at delivery — Dec 2027</p>
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[hsl(var(--border))]">
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">Infonavit</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">✅ Available for WEST</span>
      </div>
    </GlassCard>
  )
}

// ─── Edit Modal ───
function EditModal({ record, onSave, onClose }: {
  record: RetirementRecord
  onSave: (id: string, updates: { current_balance?: number; institution?: string; annual_return_rate?: number; notes?: string }) => Promise<void>
  onClose: () => void
}) {
  const [balance, setBalance] = useState(record.current_balance)
  const [institution, setInstitution] = useState(record.institution ?? '')
  const [rate, setRate] = useState((record.annual_return_rate ?? 0.085) * 100)
  const [notes, setNotes] = useState(record.notes ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(record.id, {
      current_balance: balance,
      institution: institution || undefined,
      annual_return_rate: rate / 100,
      notes: notes || undefined,
    })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold">Update {record.name}</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Balance (MXN)</label>
            <input type="number" step="any" value={balance} onChange={e => setBalance(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-slate-500" />
          </div>
          {record.instrument_type === 'afore' && (
            <>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Institution</label>
                <input type="text" placeholder="SURA AFORE" value={institution} onChange={e => setInstitution(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-1 focus:ring-slate-500" />
              </div>
              <div>
                <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Annual Return Rate (%)</label>
                <input type="number" step="0.1" min="0" max="20" value={rate} onChange={e => setRate(parseFloat(e.target.value) || 8.5)}
                  className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm font-mono focus:outline-none focus:ring-1 focus:ring-slate-500" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-[hsl(var(--text-secondary))] mb-1 block">Notes</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--accent))] border border-[hsl(var(--border))] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-slate-500" />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm bg-[hsl(var(--accent))]">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Update'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════
// MAIN RETIREMENT TAB
// ═══════════════════════════════════════════
interface RetirementTabProps {
  ownerFilter: string
}

export function RetirementTab({ ownerFilter }: RetirementTabProps) {
  const [records, setRecords] = useState<RetirementRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [editingRecord, setEditingRecord] = useState<RetirementRecord | null>(null)

  const fetchData = () => {
    setLoading(true)
    fetch('/api/finance/retirement')
      .then(r => r.ok ? r.json() : { records: [] })
      .then(d => setRecords(d.records || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const handleSave = async (id: string, updates: Record<string, unknown>) => {
    await fetch('/api/finance/retirement', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    fetchData()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-xl bg-[hsl(var(--accent))] animate-pulse" />)}
      </div>
    )
  }

  // Filter by owner
  const filtered = ownerFilter === 'all'
    ? records
    : records.filter(r => r.owner.toLowerCase() === ownerFilter.toLowerCase())

  const totalRetirement = filtered.reduce((s, r) => s + r.current_balance, 0)
  const aforeTotal = filtered.filter(r => r.instrument_type === 'afore').reduce((s, r) => s + r.current_balance, 0)
  const westEarmarked = filtered.filter(r => r.is_usable_for_west).reduce((s, r) => s + (r.west_amount || r.current_balance), 0)

  // Projection rows (AFORE only, no Infonavit — it's going to WEST not retirement)
  const aforeRecords = filtered.filter(r => r.instrument_type === 'afore')
  const projectionRows = aforeRecords.map(r => {
    const years = yearsToRetirement(r.owner, r.retirement_age ?? 65)
    return {
      name: r.owner.charAt(0).toUpperCase() + r.owner.slice(1),
      owner: r.owner,
      yearsToRetirement: years.toFixed(1),
      current: r.current_balance,
      conservative: project(r.current_balance, 0.07, years),
      base: project(r.current_balance, 0.085, years),
      optimistic: project(r.current_balance, 0.10, years),
    }
  })

  const projTotals = {
    conservative: projectionRows.reduce((s, r) => s + r.conservative, 0),
    base: projectionRows.reduce((s, r) => s + r.base, 0),
    optimistic: projectionRows.reduce((s, r) => s + r.optimistic, 0),
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Retirement</h2>
        <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">AFORE & long-term savings</p>
      </div>

      {/* Lock banner */}
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--text-secondary))]">
        <span className="text-base shrink-0">🔒</span>
        <span>These funds are <span className="font-medium text-[hsl(var(--foreground))]">locked until age 65</span> and not available for WEST or other short-term goals.</span>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Total Retirement</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">{fmtMXN(totalRetirement)}</p>
          <p className="text-xs text-[hsl(var(--text-secondary))] mt-0.5">Net worth contribution</p>
        </GlassCard>

        <GlassCard>
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">AFORE Combined</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">{fmtMXN(aforeTotal)}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-400 font-medium">🔒 Locked</span>
          </div>
        </GlassCard>

        <GlassCard className="col-span-2 sm:col-span-1">
          <span className="text-xs font-medium uppercase tracking-wider text-[hsl(var(--text-secondary))]">Available for WEST</span>
          <p className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-400 mt-1">{fmtMXN(westEarmarked)}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">✅ Laura&apos;s Infonavit</span>
          </div>
        </GlassCard>
      </div>

      {/* Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(r => (
          r.instrument_type === 'afore'
            ? <AforeCard key={r.id} record={r} onEdit={setEditingRecord} />
            : <InfonavitCard key={r.id} record={r} onEdit={setEditingRecord} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-[hsl(var(--text-secondary))]">
            <p className="text-2xl mb-2">🏦</p>
            <p className="text-sm">No retirement records for this owner</p>
          </div>
        )}
      </div>

      {/* Projection table (AFORE only) */}
      {projectionRows.length > 0 && (
        <GlassCard className="p-4 sm:p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))] mb-4">
            Retirement Projections at Age 65
          </h3>

          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--border))]">
                  <th className="text-left text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Person</th>
                  <th className="text-right text-xs font-medium text-amber-400 uppercase tracking-wider py-3 px-3">Conservative (7%)</th>
                  <th className="text-right text-xs font-medium text-[hsl(var(--text-secondary))] uppercase tracking-wider py-3 px-3">Base (8.5%)</th>
                  <th className="text-right text-xs font-medium text-emerald-400 uppercase tracking-wider py-3 px-3">Optimistic (10%)</th>
                </tr>
              </thead>
              <tbody>
                {projectionRows.map(row => (
                  <tr key={row.name} className="border-b border-[hsl(var(--border))] last:border-0">
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-2">
                        <OwnerDot owner={row.owner} size="sm" />
                        <span className="font-medium">{row.name}</span>
                        <span className="text-xs text-[hsl(var(--text-secondary))]">{row.yearsToRetirement}yr to 65</span>
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-amber-400">{fmtMXN(row.conservative)}</td>
                    <td className="py-3 px-3 text-right tabular-nums font-semibold">{fmtMXN(row.base)}</td>
                    <td className="py-3 px-3 text-right tabular-nums text-emerald-400">{fmtMXN(row.optimistic)}</td>
                  </tr>
                ))}
                <tr className="bg-[hsl(var(--bg-elevated))]/50">
                  <td className="py-3 px-3 font-bold text-sm">Combined</td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-amber-400">{fmtMXN(projTotals.conservative)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold">{fmtMXN(projTotals.base)}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-bold text-emerald-400">{fmtMXN(projTotals.optimistic)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden space-y-3">
            {projectionRows.map(row => (
              <div key={row.name} className="p-3 rounded-lg border border-[hsl(var(--border))]">
                <div className="flex items-center gap-2 mb-2">
                  <OwnerDot owner={row.owner} size="sm" />
                  <span className="text-sm font-semibold">{row.name}</span>
                  <span className="text-xs text-[hsl(var(--text-secondary))]">{row.yearsToRetirement}yr to 65</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-amber-400 uppercase">Conservative</p>
                    <p className="text-sm font-semibold tabular-nums">{fmtMXN(row.conservative)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[hsl(var(--text-secondary))] uppercase">Base</p>
                    <p className="text-sm font-bold tabular-nums">{fmtMXN(row.base)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-emerald-400 uppercase">Optimistic</p>
                    <p className="text-sm font-semibold tabular-nums">{fmtMXN(row.optimistic)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-[hsl(var(--text-secondary))] mt-3">
            * Balance-only projection. Future employer contributions (est. {fmtMXN(Object.values(MONTHLY_CONTRIBUTIONS).reduce((a, b) => a + b, 0))}/mo combined) not included.
          </p>
        </GlassCard>
      )}

      {/* Info banner */}
      <div className="flex gap-3 p-4 rounded-lg bg-[hsl(var(--bg-elevated))] border border-[hsl(var(--border))] text-xs text-[hsl(var(--text-secondary))]">
        <span className="text-base shrink-0">ℹ️</span>
        <p className="leading-relaxed">
          AFORE contributions are made automatically by your employer (6.5% of salary). Balances update with contributions + returns.
          To get your exact current balance, check your AFORE app or{' '}
          <a href="https://afore.mx" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">afore.mx</a>.
        </p>
      </div>

      {/* Edit modal */}
      {editingRecord && (
        <EditModal record={editingRecord} onSave={handleSave} onClose={() => setEditingRecord(null)} />
      )}
    </div>
  )
}
