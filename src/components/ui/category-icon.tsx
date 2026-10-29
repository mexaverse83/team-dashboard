import * as React from 'react'
import { cn } from '@/lib/utils'
import { categoryColor, getCategoryIcon, getItemIcon } from '@/lib/category-icons'

export interface CategoryIconProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Category name ('Dining Out'); picks the lucide icon. */
  name: string | null | undefined
  /** DB emoji, used only when the name has no lucide mapping. */
  emoji?: string | null
  /** The row's own name (subscription, merchant): a specific match wins over the category icon. */
  itemName?: string | null
  /** Palette slot (category sort_order or list index) → --cat-1..8. */
  colorIndex?: number | null
  /** Chip size in px (default 28). */
  size?: number
  /** Accessible name when the icon stands alone; decorative otherwise. */
  label?: string
}

/** Lucide icon in a rounded chip tinted with the category colour at 12% (VIS-10). */
export function CategoryIcon({ name, itemName, emoji, colorIndex = 0, size = 28, label, className, style, ...props }: CategoryIconProps) {
  const Icon = getItemIcon(itemName) ?? getCategoryIcon(name)
  const fallback = emoji || (name ? name.trim().charAt(0).toUpperCase() : '•')
  return (
    <span
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      data-category={name ?? ''}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-lg', className)}
      style={{ width: size, height: size, background: categoryColor(colorIndex, 0.12), color: categoryColor(colorIndex), ...style }}
      {...props}
    >
      {Icon
        ? React.createElement(Icon, { 'aria-hidden': true, strokeWidth: 2, style: { width: Math.round(size * 0.55), height: Math.round(size * 0.55) } })
        : <span className="leading-none" style={{ fontSize: Math.round(size * 0.5) }}>{fallback}</span>}
    </span>
  )
}
