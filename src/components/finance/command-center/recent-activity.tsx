import { Card } from '@/components/ui/card'
import { CategoryIcon } from '@/components/ui/category-icon'
import { OwnerAvatar } from '@/components/ui/owner-avatar'
import { parseLocalDateKey } from '@/lib/dates'
import { formatDateShort, formatMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { SectionHeader } from './ui'

export interface RecentRow {
  id: string
  date: string
  merchant: string
  amount: number
  type?: 'expense' | 'income'
  owner: string | null
  category_name: string | null
  category_icon: string | null
}

// Stable palette slot per category name (the summary rows carry no sort_order).
function colorSlot(name: string | null): number {
  let h = 0
  for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 8
}

export function RecentActivity({ rows, scopeOwner }: { rows: RecentRow[] | undefined; scopeOwner?: string | null }) {
  return (
    <Card>
      <SectionHeader title="Recent activity" subtitle={scopeOwner ? `${scopeOwner}’s latest` : 'Latest across both of you'} action={{ label: 'See all', href: '/finance/transactions' }} />
      {rows === undefined ? (
        <div className="space-y-2" aria-label="Loading recent activity">
          {[0, 1, 2].map(i => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-2" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-4 text-sm text-fg-tertiary">{scopeOwner ? `No transactions from ${scopeOwner} yet this month.` : 'No transactions yet this month.'}</p>
      ) : (
        <ul className="-mx-1 divide-y divide-border">
          {rows.map(tx => {
            const income = tx.type === 'income'
            return (
              <li key={tx.id} className="flex items-center gap-3 px-1 py-2.5">
                <CategoryIcon name={tx.category_name} emoji={tx.category_icon} colorIndex={colorSlot(tx.category_name)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{tx.merchant || '—'}</p>
                  <p className="flex items-center gap-1.5 text-micro text-fg-tertiary">
                    <span className="truncate">{tx.category_name || 'Uncategorized'} · {formatDateShort(parseLocalDateKey(tx.date))}</span>
                    {tx.owner && <OwnerAvatar owner={tx.owner} size={14} />}
                  </p>
                </div>
                <span className={cn('num shrink-0 text-sm font-semibold', income ? 'text-positive' : 'text-fg')} data-money>
                  {income ? '+' : ''}{formatMoney(Math.abs(tx.amount))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
