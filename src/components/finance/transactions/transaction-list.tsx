'use client'

// Day-grouped transaction feed (MOB-14, VIS-15, MOB-12): sticky day headers
// with totals, the whole row is the edit button, delete is a swipe (touch)
// or a hover/focus action (desktop), and rows stream in 50 at a time.
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import type { FinanceTransaction } from '@/lib/finance-types'
import { CategoryIcon } from '@/components/ui/category-icon'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { MoneyText } from '@/components/ui/money-text'
import { formatDateShort, formatMoney } from '@/lib/format'
import { getPaymentMethod } from '@/lib/payment-methods'
import { cn } from '@/lib/utils'
import { groupByDay } from './day-groups'

export const PAGE_CHUNK = 50
const SWIPE_REVEAL = 88

function isAutomatic(tx: FinanceTransaction): boolean {
  return tx.source === 'recurring_income' || !!tx.tags?.some(t => t === 'auto-income' || t === 'auto-recurring' || t === 'auto-msi')
}

export function rowAriaLabel(tx: FinanceTransaction): string {
  const amount = formatMoney(tx.amount_mxn)
  const what = tx.type === 'income' ? `${amount} received` : amount
  return `Edit ${tx.merchant || tx.category?.name || 'transaction'}, ${what}, ${tx.category?.name || 'Uncategorized'}, ${formatDateShort(tx.transaction_date)}`
}

interface RowProps {
  tx: FinanceTransaction
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (tx: FinanceTransaction) => void
  onDelete: (tx: FinanceTransaction) => void
}

function TransactionRow({ tx, open, onOpenChange, onEdit, onDelete }: RowProps) {
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null)
  const swiped = useRef(false)
  const method = getPaymentMethod(tx.payment_method)
  const offset = drag ?? (open ? -SWIPE_REVEAL : 0)
  const name = tx.merchant || tx.category?.name || '—'

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY, horizontal: null }
    swiped.current = false
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current
    if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (s.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.horizontal = Math.abs(dx) > Math.abs(dy)
    if (!s.horizontal) return
    swiped.current = true
    const base = open ? -SWIPE_REVEAL : 0
    setDrag(Math.max(-SWIPE_REVEAL - 24, Math.min(0, base + dx)))
  }
  const onTouchEnd = () => {
    if (drag != null) onOpenChange(drag < -SWIPE_REVEAL / 2)
    setDrag(null)
    start.current = null
  }

  return (
    <li className="group relative overflow-hidden">
      <button type="button" tabIndex={open ? 0 : -1} aria-hidden={!open} onClick={() => onDelete(tx)}
        className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center gap-1.5 bg-negative text-sm font-semibold text-white sm:hidden">
        <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
      </button>
      <div
        className={cn('relative flex items-center bg-surface', drag == null && 'transition-transform duration-200')}
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <button type="button" aria-label={rowAriaLabel(tx)}
          onClick={() => { if (swiped.current) { swiped.current = false; return } if (open) { onOpenChange(false); return } onEdit(tx) }}
          className="flex min-h-[60px] min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none sm:px-4">
          <CategoryIcon name={tx.category?.name} emoji={tx.category?.icon} colorIndex={tx.category?.sort_order ?? 0} size={36} className="rounded-xl" />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[0.9375rem] font-medium text-fg">{name}</span>
              {isAutomatic(tx) && <RefreshCw className="h-3.5 w-3.5 shrink-0 text-fg-tertiary" aria-label="Automatic" />}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-fg-tertiary">
              <span className="truncate">{tx.category?.name || 'Uncategorized'}</span>
              {method && <><span aria-hidden="true">·</span><span className="shrink-0">{method.short}</span></>}
              {tx.description && <span className="hidden min-w-0 truncate lg:inline"><span aria-hidden="true">· </span>{tx.description}</span>}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <MoneyText value={tx.amount_mxn} sign={tx.type === 'income' ? 'always' : 'never'}
              className={cn('num-metric text-[0.9375rem] font-semibold', tx.type === 'income' ? 'text-positive' : 'text-fg')} />
            <OwnerAvatar owner={tx.owner} size={18} />
          </span>
        </button>
        <button type="button" onClick={() => onDelete(tx)} aria-label={`Delete ${name}`}
          className="mr-2 hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-fg-tertiary opacity-0 transition hover:bg-negative-bg hover:text-negative focus-visible:opacity-100 group-hover:opacity-100 sm:flex">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

export interface TransactionListProps {
  transactions: FinanceTransaction[]
  /** Changes when filters change, so the window resets to the first chunk. */
  resetKey: string
  onEdit: (tx: FinanceTransaction) => void
  onDelete: (tx: FinanceTransaction) => void
}

export function TransactionList({ transactions, resetKey, onEdit, onDelete }: TransactionListProps) {
  const [visible, setVisible] = useState(PAGE_CHUNK)
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [lastReset, setLastReset] = useState(resetKey)
  const sentinel = useRef<HTMLDivElement>(null)

  if (lastReset !== resetKey) {
    setLastReset(resetKey)
    setVisible(PAGE_CHUNK)
  }

  const shown = useMemo(() => transactions.slice(0, visible), [transactions, visible])
  const groups = useMemo(() => groupByDay(shown), [shown])
  const hasMore = visible < transactions.length

  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) setVisible(v => v + PAGE_CHUNK)
    }, { rootMargin: '600px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, visible])

  return (
    <div>
      {groups.map(group => (
        <section key={group.date} aria-labelledby={`day-${group.date}`}>
          <header className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-[5] flex items-baseline justify-between gap-3 border-b border-border bg-surface/95 px-3 py-2 backdrop-blur sm:px-4 md:top-0">
            <h3 id={`day-${group.date}`} className="text-xs font-semibold text-fg">
              {group.label}{group.sublabel && <span className="font-normal text-fg-tertiary"> · {group.sublabel}</span>}
            </h3>
            <span className="text-xs text-fg-tertiary">
              {group.spent > 0 && <MoneyText value={group.spent} className="text-fg-secondary" />}
              {group.spent > 0 && group.received > 0 && ' · '}
              {group.received > 0 && <MoneyText value={group.received} sign="always" className="text-positive" />}
            </span>
          </header>
          <ul className="divide-y divide-border">
            {group.items.map(tx => (
              <TransactionRow key={tx.id} tx={tx} open={openRow === tx.id}
                onOpenChange={o => setOpenRow(o ? tx.id : null)} onEdit={onEdit}
                onDelete={t => { setOpenRow(null); onDelete(t) }} />
            ))}
          </ul>
        </section>
      ))}
      <div ref={sentinel} className="flex items-center justify-between gap-3 border-t border-border px-3 py-3 text-xs text-fg-tertiary sm:px-4">
        <span>{hasMore ? `Showing ${shown.length} of ${transactions.length}` : `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}`}</span>
        {hasMore && (
          <button type="button" onClick={() => setVisible(v => v + PAGE_CHUNK)} className="h-11 rounded-xl px-3 text-sm font-semibold text-fg-secondary hover:bg-surface-2 hover:text-fg">
            Show more
          </button>
        )}
      </div>
    </div>
  )
}
