import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatMoney, type FormatMoneyOptions } from '@/lib/format'

export interface MoneyTextProps extends FormatMoneyOptions, Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  value: number | null | undefined
}

/**
 * Formatted money with tabular numerals. Tagged `data-money` so the privacy
 * toggle (body.privacy-on) can blur it; compact values carry the full amount
 * in `title` for hover/long-press.
 */
export function MoneyText({ value, mode = 'full', sign, currency, showCurrency, className, ...props }: MoneyTextProps) {
  const text = formatMoney(value, { mode, sign, currency, showCurrency })
  const full = mode === 'compact' ? formatMoney(value, { mode: 'full', sign, currency, showCurrency }) : undefined
  return (
    <span data-money="" title={full !== text ? full : undefined} className={cn('num', className)} {...props}>
      {text}
    </span>
  )
}
