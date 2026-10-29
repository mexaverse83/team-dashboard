'use client'

import * as React from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { Trash2 } from 'lucide-react'
import { OWNERS, ownersEqual } from '@/lib/owners'
import { cn } from '@/lib/utils'

type Key<T> = Extract<keyof T, string>

export type HoldingField<T> =
  | { kind: 'text'; key: Key<T>; label: string; placeholder?: string; required?: boolean; mono?: boolean; uppercase?: boolean; nullable?: boolean; span?: 1 | 2 }
  | { kind: 'number'; key: Key<T>; label: string; placeholder?: string; required?: boolean; step?: string; nullable?: boolean; integer?: boolean; hint?: string; span?: 1 | 2 }
  | { kind: 'date'; key: Key<T>; label: string; span?: 1 | 2 }
  | { kind: 'select'; key: Key<T>; label: string; options: Array<{ value: string | number; label: string }>; numeric?: boolean; span?: 1 | 2 }
  | { kind: 'segmented'; key: Key<T>; label: string; options: Array<{ value: string; label: string }>; span?: 1 | 2 }
  | { kind: 'owner'; key: Key<T>; label?: string; span?: 1 | 2 }
  | { kind: 'checkbox'; key: Key<T>; label: string; span?: 1 | 2 }
  | { kind: 'custom'; key: string; render: (value: Partial<T>, set: (patch: Partial<T>) => void) => React.ReactNode; span?: 1 | 2 }

export interface HoldingFormModalProps<T> {
  open: boolean
  title: string
  value: Partial<T>
  onChange: (next: Partial<T>) => void
  fields: Array<HoldingField<T>>
  onSubmit: () => void
  onClose: () => void
  saving: boolean
  submitLabel: string
  error?: string | null
  /** Shown as a destructive footer action when editing an existing row. */
  onDelete?: () => void
  deleteLabel?: string
}

const inputClass = 'h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg placeholder:text-fg-tertiary focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]'

/**
 * One form modal for stocks, fixed income and real estate (CH-08): each asset
 * class passes a field list instead of hand-writing a near-identical form.
 * Required fields gate the submit button.
 */
export function HoldingFormModal<T extends object>({ open, title, value, onChange, fields, onSubmit, onClose, saving, submitLabel, error, onDelete, deleteLabel = 'Delete' }: HoldingFormModalProps<T>) {
  const idPrefix = React.useId()
  const record = value as Record<string, unknown>
  const set = (patch: Partial<T>) => onChange({ ...value, ...patch })
  const missing = fields.some(f => (f.kind === 'text' || f.kind === 'number') && f.required && !record[f.key])

  const renderField = (f: HoldingField<T>) => {
    const id = `${idPrefix}-${f.key}`
    switch (f.kind) {
      case 'text':
        return (
          <input id={id} type="text" placeholder={f.placeholder} value={(record[f.key] as string) ?? ''}
            onChange={e => {
              const raw = f.uppercase ? e.target.value.toUpperCase() : e.target.value
              set({ [f.key]: f.nullable && !raw ? null : raw } as Partial<T>)
            }}
            className={cn(inputClass, f.mono && 'font-mono')} />
        )
      case 'number':
        return (
          <input id={id} type="number" inputMode="decimal" step={f.step ?? 'any'} placeholder={f.placeholder}
            value={record[f.key] == null || (record[f.key] === 0 && !f.nullable) ? '' : String(record[f.key])}
            onChange={e => {
              const raw = e.target.value
              const parsed = f.integer ? parseInt(raw, 10) : parseFloat(raw)
              set({ [f.key]: raw === '' || Number.isNaN(parsed) ? (f.nullable ? null : 0) : parsed } as Partial<T>)
            }}
            className={cn(inputClass, 'tabular-nums font-mono')} />
        )
      case 'date':
        return (
          <input id={id} type="date" value={(record[f.key] as string) ?? ''}
            onChange={e => set({ [f.key]: e.target.value || null } as Partial<T>)}
            className={inputClass} />
        )
      case 'select':
        return (
          <select id={id} value={String(record[f.key] ?? f.options[0]?.value ?? '')}
            onChange={e => set({ [f.key]: f.numeric ? Number(e.target.value) : e.target.value } as Partial<T>)}
            className={inputClass}>
            {f.options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        )
      case 'segmented':
        return (
          <Segmented ariaLabel={f.label} size="sm" fullWidth value={String(record[f.key] ?? f.options[0]?.value)}
            onChange={v => set({ [f.key]: v } as Partial<T>)} options={f.options} />
        )
      case 'owner':
        return (
          <Segmented ariaLabel={f.label ?? 'Owner'} size="sm" fullWidth value={OWNERS.find(o => ownersEqual(o, record[f.key] as string | null | undefined)) ?? OWNERS[0]}
            onChange={v => set({ [f.key]: v } as Partial<T>)}
            options={OWNERS.map(o => ({ value: o, label: o, icon: <OwnerAvatar owner={o} size={16} aria-hidden /> }))} />
        )
      case 'checkbox':
        return (
          <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-fg">
            <input id={id} type="checkbox" checked={Boolean(record[f.key])} onChange={e => set({ [f.key]: e.target.checked } as Partial<T>)}
              className="h-4 w-4 accent-[hsl(var(--primary))]" />
            {f.label}
          </label>
        )
      case 'custom':
        return f.render(value, set)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <div className="flex gap-2">
          {onDelete && (
            <Button variant="ghost" size="icon" aria-label={deleteLabel} onClick={onDelete} disabled={saving} className="shrink-0 text-negative">
              <Trash2 aria-hidden className="h-4 w-4" />
            </Button>
          )}
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={onSubmit} disabled={saving || missing}>{saving ? 'Saving…' : submitLabel}</Button>
        </div>
      )}
    >
      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => {
          const showLabel = f.kind !== 'checkbox' && f.kind !== 'custom'
          const label = 'label' in f ? (f.label ?? 'Owner') : ''
          return (
            <div key={f.key} className={cn('min-w-0', (f.span ?? 2) === 2 ? 'col-span-2' : 'col-span-1')}>
              {showLabel && (
                <label htmlFor={`${idPrefix}-${f.key}`} className="mb-1 block text-label font-medium text-fg-secondary">
                  {label}{'required' in f && f.required ? ' *' : ''}
                </label>
              )}
              {renderField(f)}
              {f.kind === 'number' && f.hint && <p className="mt-1 text-micro text-fg-tertiary">{f.hint}</p>}
            </div>
          )
        })}
      </div>
      {error && <p role="alert" className="mt-3 text-[0.8125rem] text-negative">{error}</p>}
    </Modal>
  )
}
