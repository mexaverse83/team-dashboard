import Link from 'next/link'
import { ChevronRight, CircleCheck } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { TONE_FILL_CLASS } from '@/lib/budget-tone'
import { cn } from '@/lib/utils'
import type { AttentionItem } from './attention'

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <Card padding="none" aria-labelledby="attention-heading">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <h2 id="attention-heading" className="text-[0.9375rem] font-semibold text-fg">Needs attention</h2>
        {items.length > 0 && <span className="text-label text-fg-tertiary">{items.length} item{items.length === 1 ? '' : 's'}</span>}
      </div>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 px-4 pb-4 pt-2 text-sm text-fg-secondary sm:px-5">
          <CircleCheck className="h-4 w-4 text-positive" aria-hidden="true" /> Nothing needs you right now.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {items.map(item => (
            <li key={item.id}>
              <Link href={item.href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 sm:px-5">
                <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', TONE_FILL_CLASS[item.tone])} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-snug text-fg">{item.title}</span>
                  {item.detail && <span className="mt-0.5 block text-label text-fg-tertiary" {...(item.detail.includes('$') ? { 'data-money': '' } : {})}>{item.detail}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-label font-semibold text-fg-secondary">{item.cta}<ChevronRight className="h-4 w-4" aria-hidden="true" /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
