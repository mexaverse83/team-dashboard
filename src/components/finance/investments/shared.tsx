'use client'

import * as React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Segmented } from '@/components/ui/segmented'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { MoneyText } from '@/components/ui/money-text'
import { OWNERS } from '@/lib/owners'
import { cn } from '@/lib/utils'
import type { OwnerSplit } from './portfolio'

export const ASSET_COLOR = {
  Crypto: 'hsl(var(--cat-4))',
  Stocks: 'hsl(var(--chart-3))',
  'Fixed Income': 'hsl(var(--cat-1))',
  'Real Estate': 'hsl(var(--cat-3))',
  Retirement: 'hsl(var(--cat-5))',
} as const

export function OwnerFilterControl({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Segmented
      ariaLabel="Show holdings for"
      size="sm"
      value={value}
      onChange={onChange}
      className={className}
      options={[
        { value: 'All', label: 'Both' },
        ...OWNERS.map(o => ({ value: o, label: o, icon: <OwnerAvatar owner={o} size={16} aria-hidden /> })),
      ]}
    />
  )
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-label font-semibold text-fg-secondary', className)}>{children}</h3>
}

/** One row of a label/value list inside a card. */
export function KV({ label, children, strong = false, className }: { label: React.ReactNode; children: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-[0.8125rem]', className)}>
      <dt className={strong ? 'font-medium text-fg' : 'text-fg-secondary'}>{label}</dt>
      <dd className={cn('tabular-nums text-right', strong ? 'font-semibold text-fg' : 'text-fg')}>{children}</dd>
    </div>
  )
}

/** Per-owner totals strip shown when the filter is "Both". */
export function OwnerSplitCards({ split, noun, plural, extraB }: { split: OwnerSplit; noun: string; plural?: string; extraB?: React.ReactNode }) {
  if (split.a <= 0 && split.b <= 0) return null
  const label = (n: number) => `${n} ${n === 1 ? noun : (plural ?? `${noun}s`)}`
  return (
    <div className="grid grid-cols-2 gap-3">
      {([[OWNERS[0], split.a, split.aCount, null], [OWNERS[1], split.b, split.bCount, extraB]] as const).map(([owner, value, count, extra]) => (
        <div key={owner} className="min-w-0 rounded-xl border border-border bg-surface-2 p-3">
          <OwnerAvatar owner={owner} size={18} showName />
          <p className="mt-1.5 text-base font-semibold sm:text-lg"><MoneyText value={value} /></p>
          <p className="text-label text-fg-tertiary">{label(count)}{extra}</p>
        </div>
      ))}
    </div>
  )
}

/** Inline "couldn't load" notice for one data source; values stay '—' (VIS-17). */
export function SourceError({ what, onRetry, className }: { what: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning/30 bg-warning-bg px-3 py-2.5 text-[0.8125rem] text-fg', className)}>
      <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1">Couldn&apos;t load {what}. Figures that depend on it show &ldquo;—&rdquo;.</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-fg hover:bg-surface-3">
          <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  )
}

export const TIER_INFO: Record<number, { label: string; tooltip: string }> = {
  1: { label: 'Tier 1', tooltip: 'Fintech — Nu, Mercado Pago' },
  2: { label: 'Tier 2', tooltip: 'Regulated broker/neobank — GBM, Hey Banco, Klar (INDEVAL custody, no deposit insurance)' },
  3: { label: 'Tier 3', tooltip: 'Higher yield — CETES, Supertasas, Kubo. PROSOFIPO cap: $190K per institution' },
}

export function TierBadge({ tier }: { tier: number }) {
  const info = TIER_INFO[tier] ?? { label: `Tier ${tier}`, tooltip: '' }
  return (
    <span title={info.tooltip} className="inline-flex items-center rounded-full bg-surface-3 px-2 py-0.5 text-micro font-medium text-fg-secondary">
      {info.label}
    </span>
  )
}

/** Labelled range input with aria-valuetext (MOB-12). */
export function RangeField({ id, label, value, min, max, step, onChange, valueText, hintMin, hintMax, hint }: {
  id: string; label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; valueText: string; hintMin?: string; hintMax?: string; hint?: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-label font-medium text-fg-secondary">{label}</label>
        <span className="tabular-nums text-sm font-semibold text-fg">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="h-11 w-full cursor-pointer accent-[hsl(var(--primary))]"
      />
      {(hintMin || hintMax || hint) && (
        <div className="flex justify-between gap-2 text-micro text-fg-tertiary">
          <span className="shrink-0">{hintMin}</span>
          {hint && <span className="text-center">{hint}</span>}
          <span className="shrink-0">{hintMax}</span>
        </div>
      )}
    </div>
  )
}
