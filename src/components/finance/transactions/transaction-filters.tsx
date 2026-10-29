'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { FinanceCategory } from '@/lib/finance-types'
import { Segmented } from '@/components/ui/segmented'
import { OWNERS } from '@/lib/owners'
import { PAYMENT_METHODS } from '@/lib/payment-methods'
import { parseLocalDateKey } from '@/lib/dates'
import { cn } from '@/lib/utils'

export type TypeFilter = 'all' | 'expense' | 'income'

export interface TransactionFilterState {
  search: string
  type: TypeFilter
  owner: string
  category: string
  method: string
  /** 'YYYY-MM' or '' */
  month: string
}

export const EMPTY_FILTERS: TransactionFilterState = { search: '', type: 'all', owner: 'all', category: '', method: '', month: '' }

const select = 'h-11 w-full min-w-0 rounded-xl border border-border bg-surface-2 px-3 text-base text-fg outline-none focus:border-primary sm:w-auto sm:min-w-[10rem] sm:text-sm'

export function monthFilterLabel(month: string): string {
  const d = parseLocalDateKey(month)
  return Number.isNaN(d.getTime()) ? month : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function TransactionFilters({ value, onChange, categories }: {
  value: TransactionFilterState
  onChange: (patch: Partial<TransactionFilterState>) => void
  categories: FinanceCategory[]
}) {
  const category = categories.find(c => c.id === value.category)
  const [open, setOpen] = useState(false)
  const active = Number(value.type !== 'all') + Number(value.owner !== 'all') + Number(!!value.category) + Number(!!value.method)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-tertiary" aria-hidden="true" />
          <input type="search" aria-label="Search transactions" placeholder="Search merchants, notes..." value={value.search}
            onChange={e => onChange({ search: e.target.value })}
            className="h-11 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-base text-fg outline-none placeholder:text-fg-tertiary focus:border-primary sm:text-sm" />
        </div>
        {/* Phones fold the filters behind one button so the feed starts above the fold (MOB-14). */}
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="transaction-filter-panel"
          className={cn('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold sm:hidden',
            open || active ? 'border-primary/50 bg-primary/10 text-fg' : 'border-border bg-surface-2 text-fg-secondary')}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />Filters
          {active > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] text-[hsl(var(--btn-primary-fg))]">{active}<span className="sr-only"> active</span></span>}
        </button>
      </div>
      <div id="transaction-filter-panel" className={cn('flex-col gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center', open ? 'flex' : 'hidden')}>
        <Segmented ariaLabel="Transaction type" size="sm" value={value.type} onChange={type => onChange({ type })}
          className="w-full sm:w-auto" fullWidth
          options={[{ value: 'all', label: 'All' }, { value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
        <Segmented ariaLabel="Owner" size="sm" value={value.owner} onChange={owner => onChange({ owner })}
          className="w-full sm:w-auto" fullWidth
          options={[{ value: 'all', label: 'Both' }, ...OWNERS.map(o => ({ value: o, label: o }))]} />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <select aria-label="Filter by category" value={value.category} onChange={e => onChange({ category: e.target.value })} className={select}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select aria-label="Filter by payment method" value={value.method} onChange={e => onChange({ method: e.target.value })} className={select}>
            <option value="">All methods</option>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>
      {(value.month || category) && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {category && <FilterChip label={category.name} onRemove={() => onChange({ category: '' })} />}
          {value.month && <FilterChip label={monthFilterLabel(value.month)} onRemove={() => onChange({ month: '' })} />}
        </div>
      )}
    </div>
  )
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className={cn('inline-flex h-11 items-center gap-1 rounded-full border border-border bg-surface-2 pl-3 text-sm font-medium text-fg')}>
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remove ${label} filter`}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-fg-tertiary hover:text-fg after:absolute after:inset-[-4px] after:content-['']">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  )
}
