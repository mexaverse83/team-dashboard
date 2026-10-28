import { describe, expect, it } from 'vitest'
import { Baby, House, Package, ShoppingCart, UtensilsCrossed, Zap } from 'lucide-react'
import { categoryColor, categoryColorVar, getCategoryIcon } from '@/lib/category-icons'

describe('category icons', () => {
  it('maps known names case-insensitively', () => {
    expect(getCategoryIcon('Rent/Mortgage')).toBe(House)
    expect(getCategoryIcon('groceries')).toBe(ShoppingCart)
    expect(getCategoryIcon('Dining Out')).toBe(UtensilsCrossed)
    expect(getCategoryIcon('Electricity')).toBe(Zap)
    expect(getCategoryIcon('Other')).toBe(Package)
  })

  it('falls back to keywords, then to null (caller shows the DB emoji)', () => {
    expect(getCategoryIcon('Baby gear')).toBe(Baby)
    expect(getCategoryIcon('Restaurants & bars')).toBe(UtensilsCrossed)
    expect(getCategoryIcon('Zzz unknown')).toBeNull()
    expect(getCategoryIcon('')).toBeNull()
    expect(getCategoryIcon(null)).toBeNull()
  })

  it('cycles the 8-slot token palette', () => {
    expect(categoryColorVar(0)).toBe('--cat-1')
    expect(categoryColorVar(7)).toBe('--cat-8')
    expect(categoryColorVar(8)).toBe('--cat-1')
    expect(categoryColorVar(null)).toBe('--cat-1')
    expect(categoryColor(2)).toBe('hsl(var(--cat-3))')
    expect(categoryColor(2, 0.12)).toBe('hsl(var(--cat-3) / 0.12)')
  })
})
