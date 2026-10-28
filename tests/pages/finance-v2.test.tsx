/**
 * Unit Tests — Finance V2 Modules (5 new pages)
 * Commits: 280fc00, 11f5dcf, 9727a9d
 *
 * Remainder after the Mona v2 W0 split: architecture/schema checks. Per-page
 * suites moved to tests/pages/{budget-builder,goals,debt,emergency-fund,audit,
 * transactions,subscriptions}.test.tsx.
 */

import { describe, it, expect } from 'vitest'

// ==========================================
// ARCHITECTURE & SCHEMA
// ==========================================
describe('Finance V2 Architecture', () => {
  it('all V2 client components have use client', () => {
    const fs = require('fs')
    const clients = [
      'src/components/finance/budget-builder-client.tsx',
      'src/components/finance/goals-client.tsx',
      'src/components/finance/debt-client.tsx',
      'src/components/finance/emergency-fund-client.tsx',
      'src/components/finance/audit-client.tsx',
    ]
    for (const path of clients) {
      const content = fs.readFileSync(path, 'utf-8')
      expect(content.startsWith("'use client'")).toBe(true)
    }
  })

  it('V2 schema has all new tables', () => {
    const fs = require('fs')
    const content = fs.readFileSync('supabase-finance-v2-schema.sql', 'utf-8')
    expect(content).toContain('finance_income_sources')
    expect(content).toContain('finance_debts')
    expect(content).toContain('finance_goals')
    expect(content).toContain('finance_emergency_fund')
  })

  it('Modal component exists', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/components/ui/modal.tsx', 'utf-8')
    expect(content).toContain('Modal')
    expect(content).toContain("'use client'")
  })

  it('finance-types has all V2 interfaces', () => {
    const fs = require('fs')
    const content = fs.readFileSync('src/lib/finance-types.ts', 'utf-8')
    expect(content).toContain('FinanceIncomeSource')
    expect(content).toContain('FinanceDebt')
    expect(content).toContain('FinanceGoal')
    expect(content).toContain('FinanceEmergencyFund')
    expect(content).toContain('FinanceAuditReport')
  })
})
