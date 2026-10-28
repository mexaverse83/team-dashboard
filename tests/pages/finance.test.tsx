/**
 * Unit Tests — Finance architecture and seed fixtures.
 *
 * The legacy Overview client (and its tests) was deleted in Mona v2 WS7: the
 * home page is command-center-client (tests/pages/command-center.test.tsx).
 * Per-page suites live in tests/pages/{transactions,budgets,subscriptions,reports}.test.tsx.
 */

import { describe, it, expect } from 'vitest'
import { SEED_CATEGORIES, SEED_TRANSACTIONS, SEED_BUDGETS, SEED_RECURRING } from '../fixtures/seed-finance'

// ==========================================
// ARCHITECTURE & SEED DATA
// ==========================================
describe('Finance Architecture', () => {
  it('seed data has all expected exports', () => {
    expect(SEED_CATEGORIES.length).toBeGreaterThan(10)
    expect(SEED_TRANSACTIONS.length).toBeGreaterThan(30)
    expect(SEED_BUDGETS.length).toBeGreaterThan(5)
    expect(SEED_RECURRING.length).toBeGreaterThan(3)
  })

  it('seed categories include both expense and income types', () => {
    const types = new Set(SEED_CATEGORIES.map(c => c.type))
    expect(types.has('expense')).toBe(true)
    expect(types.has('income')).toBe(true)
  })

  it('seed transactions include both expense and income types', () => {
    const types = new Set(SEED_TRANSACTIONS.map(t => t.type))
    expect(types.has('expense')).toBe(true)
    expect(types.has('income')).toBe(true)
  })

  it('seed recurring items have all required fields', () => {
    for (const r of SEED_RECURRING) {
      expect(r.id).toBeTruthy()
      expect(r.name).toBeTruthy()
      expect(r.amount).toBeGreaterThan(0)
      expect(r.frequency).toMatch(/^(weekly|biweekly|monthly|quarterly|yearly)$/)
    }
  })

  it('all finance pages are server component wrappers', () => {
    const fs = require('fs')
    const pages = [
      'src/app/finance/page.tsx',
      'src/app/finance/transactions/page.tsx',
      'src/app/finance/budgets/page.tsx',
      'src/app/finance/subscriptions/page.tsx',
      'src/app/finance/reports/page.tsx',
    ]
    for (const page of pages) {
      const content = fs.readFileSync(page, 'utf-8')
      expect(content).not.toMatch(/^'use client'/)
      expect(content).toContain('export const metadata')
    }
  })

  it('finance loading.tsx exists with skeleton', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/app/finance/loading.tsx', 'utf-8')
    expect(content).toContain('animate-pulse')
  })

  it('supabase schema has all finance tables', () => {
    const fs = require('fs')
    const content = fs.readFileSync('supabase-finance-schema.sql', 'utf-8')
    expect(content).toContain('finance_categories')
    expect(content).toContain('finance_transactions')
    expect(content).toContain('finance_budgets')
    expect(content).toContain('finance_recurring')
    expect(content).toContain('ROW LEVEL SECURITY')
  })
})
