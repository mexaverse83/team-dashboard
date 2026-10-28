import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONTROLLABLE, CONTROLLABLE_CATEGORY_NAMES, controllableBudgetRows, isControllableCategory } from '@/lib/controllable-categories'

describe('controllable categories', () => {
  it('holds the eight steerable categories', () => {
    expect([...CONTROLLABLE].sort()).toEqual(['Dining Out', 'Entertainment', 'Gifts', 'Groceries', 'Other', 'Shopping', 'Transport', 'Travel'])
    expect(CONTROLLABLE_CATEGORY_NAMES).toHaveLength(8)
  })

  it('matches the copies it replaces (daily-plan, widget route, insights-prompt) until owners switch imports', () => {
    for (const file of ['src/lib/daily-plan.ts', 'src/app/api/finance/widget/route.ts', 'src/lib/insights-prompt.mjs']) {
      const source = readFileSync(file, 'utf-8')
      const match = /CONTROLLABLE = new Set\(\[([^\]]+)\]\)/.exec(source)
      if (!match) continue // already migrated to the shared module
      const names = match[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).sort()
      expect(names, file).toEqual([...CONTROLLABLE].sort())
    }
  })

  it('filters budget rows to controllable, monthly categories', () => {
    const rows = [
      { category: 'Dining Out', is_non_monthly: false },
      { category: 'Rent/Mortgage', is_non_monthly: false },
      { category: 'Travel', is_non_monthly: true },
      { category: 'Groceries' },
    ]
    expect(controllableBudgetRows(rows).map(r => r.category)).toEqual(['Dining Out', 'Groceries'])
    expect(isControllableCategory('Shopping')).toBe(true)
    expect(isControllableCategory('Utilities')).toBe(false)
    expect(isControllableCategory(null)).toBe(false)
  })
})
