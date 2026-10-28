import { describe, expect, it } from 'vitest'
import { applyRules, detectDuplicates, learnRulesFromHistory, type FinanceRule } from '@/lib/finance-rules'

function rule(partial: Partial<FinanceRule>): FinanceRule {
  return {
    id: 'r', merchant_pattern: 'heb', match_mode: 'contains', amount_min: null, amount_max: null, owner: null,
    category_id: 'groceries', tags: [], priority: 100, is_active: true, learned: false, match_count: 0,
    last_matched_at: null, notes: null, created_at: '2026-01-01', updated_at: '2026-01-01', ...partial,
  }
}

describe('applyRules', () => {
  it('picks the lowest priority number first', () => {
    const rules = [rule({ id: 'late', priority: 50, category_id: 'other' }), rule({ id: 'early', priority: 10, category_id: 'groceries', tags: ['weekly'] })]
    expect(applyRules(rules, { merchant: 'HEB Valle', amount_mxn: 800 })).toEqual({ category_id: 'groceries', tags: ['weekly'], rule_id: 'early' })
  })

  it('respects match modes', () => {
    expect(applyRules([rule({ match_mode: 'exact' })], { merchant: 'HEB Valle', amount_mxn: 1 })).toBeNull()
    expect(applyRules([rule({ match_mode: 'exact' })], { merchant: ' heb ', amount_mxn: 1 })?.rule_id).toBe('r')
    expect(applyRules([rule({ match_mode: 'starts_with', merchant_pattern: 'uber' })], { merchant: 'Uber Eats', amount_mxn: 1 })?.rule_id).toBe('r')
    expect(applyRules([rule({ match_mode: 'starts_with', merchant_pattern: 'eats' })], { merchant: 'Uber Eats', amount_mxn: 1 })).toBeNull()
  })

  it('applies inclusive amount ranges', () => {
    const r = [rule({ amount_min: 100, amount_max: 500 })]
    expect(applyRules(r, { merchant: 'heb', amount_mxn: 99.99 })).toBeNull()
    expect(applyRules(r, { merchant: 'heb', amount_mxn: 100 })?.rule_id).toBe('r')
    expect(applyRules(r, { merchant: 'heb', amount_mxn: 500 })?.rule_id).toBe('r')
    expect(applyRules(r, { merchant: 'heb', amount_mxn: 500.01 })).toBeNull()
  })

  it('matches owner-specific rules only for that owner, and owner-less input matches any rule', () => {
    const r = [rule({ owner: 'Laura' })]
    expect(applyRules(r, { merchant: 'heb', amount_mxn: 1, owner: 'Bernardo' })).toBeNull()
    expect(applyRules(r, { merchant: 'heb', amount_mxn: 1, owner: 'Laura' })?.rule_id).toBe('r')
    expect(applyRules(r, { merchant: 'heb', amount_mxn: 1, owner: null })?.rule_id).toBe('r')
  })

  it('skips inactive rules and rules without a category', () => {
    expect(applyRules([rule({ is_active: false })], { merchant: 'heb', amount_mxn: 1 })).toBeNull()
    expect(applyRules([rule({ category_id: null }), rule({ id: 'fallback', priority: 200 })], { merchant: 'heb', amount_mxn: 1 })?.rule_id).toBe('fallback')
    expect(applyRules([rule({})], { merchant: '', amount_mxn: 1 })).toBeNull()
  })
})

describe('detectDuplicates', () => {
  const existing = [
    { id: 'a', transaction_date: '2026-10-25', merchant: 'Heb', amount_mxn: 1300 },
    { id: 'b', transaction_date: '2026-10-20', merchant: 'Heb', amount_mxn: 1300 },
    { id: 'c', transaction_date: '2026-10-28', merchant: 'Oxxo', amount_mxn: 1300 },
  ]

  it('matches the same merchant (any case) within ±3 days and $1', () => {
    const matches = detectDuplicates({ transaction_date: '2026-10-28', merchant: 'HEB', amount_mxn: 1300.5 }, existing)
    expect(matches.map(m => m.id)).toEqual(['a'])
    expect(matches[0].similarity).toBe('likely')
  })

  it('flags exact same-day same-amount rows as exact', () => {
    expect(detectDuplicates({ transaction_date: '2026-10-25', merchant: 'heb', amount_mxn: 1300 }, existing)[0].similarity).toBe('exact')
  })

  it('ignores rows outside the window or amount tolerance, and merchant-less candidates', () => {
    expect(detectDuplicates({ transaction_date: '2026-10-29', merchant: 'Heb', amount_mxn: 1300 }, existing)).toHaveLength(0)
    expect(detectDuplicates({ transaction_date: '2026-10-25', merchant: 'Heb', amount_mxn: 1302 }, existing)).toHaveLength(0)
    expect(detectDuplicates({ transaction_date: '2026-10-25', merchant: null, amount_mxn: 1300 }, existing)).toHaveLength(0)
  })
})

describe('learnRulesFromHistory', () => {
  it('proposes rules only for confident, repeated expense merchants', () => {
    const history = [
      ...Array.from({ length: 4 }, () => ({ merchant: 'Gasolina', category_id: 'transport', amount_mxn: 900, type: 'expense' })),
      { merchant: 'Gasolina', category_id: 'other', amount_mxn: 900, type: 'expense' },
      { merchant: 'Amazon', category_id: 'shopping', amount_mxn: 500, type: 'expense' },
      { merchant: 'Amazon', category_id: 'gifts', amount_mxn: 500, type: 'expense' },
      { merchant: 'Amazon', category_id: 'other', amount_mxn: 500, type: 'expense' },
    ]
    const proposals = learnRulesFromHistory(history)
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({ merchant_pattern: 'gasolina', category_id: 'transport', occurrences: 5, confidence: 0.8 })
  })
})
