import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildImportRows, csvRowsToCandidates, parseBbvaStatementText, parseCsvLine, parseCsvText, parseImportAmount, parseImportDate,
} from '@/lib/transaction-import'
import type { FinanceCategory } from '@/lib/finance-types'
import type { FinanceRule } from '@/lib/finance-rules'

const bbvaText = readFileSync(join(__dirname, '../fixtures/bbva-statement-redacted.txt'), 'utf8')

const categories = [
  { id: 'groc', name: 'Groceries', icon: '', color: '', type: 'expense', is_default: true, sort_order: 1 },
  { id: 'other', name: 'Other', icon: '', color: '', type: 'expense', is_default: true, sort_order: 2 },
  { id: 'other-inc', name: 'Other Income', icon: '', color: '', type: 'income', is_default: true, sort_order: 1 },
] as FinanceCategory[]

const hebRule = {
  id: 'r1', merchant_pattern: 'heb', match_mode: 'contains', amount_min: null, amount_max: null, owner: null,
  category_id: 'groc', tags: ['super'], priority: 1, is_active: true, learned: false, match_count: 0,
  last_matched_at: null, notes: null, created_at: '', updated_at: '',
} as FinanceRule

describe('BBVA statement text', () => {
  const rows = parseBbvaStatementText(bbvaText)

  it('extracts purchases and payments, skipping IVA/interest breakdown lines', () => {
    expect(rows.map(r => r.description)).toEqual([
      'HEB VALLE ORIENTE', 'OXXO GOMEZ MORIN', 'PAGO TARJETA DE CREDITO', 'FARMACIA SAN PABLO VITAMINAS PRENATALES', 'SPOTIFY P1234',
    ])
  })

  it('uses the operation date, parses amounts and maps "-" to money in', () => {
    expect(rows[0]).toEqual({ date: '2026-09-12', description: 'HEB VALLE ORIENTE', amount: 1302.4, type: 'expense', merchant: 'HEB VALLE ORIENTE' })
    expect(rows[2]).toMatchObject({ date: '2026-09-18', amount: 25000, type: 'income' })
    expect(rows[4].date).toBe('2026-10-03')
  })
})

describe('CSV parsing', () => {
  it('handles quoted commas and escaped quotes', () => {
    expect(parseCsvLine('2026-10-01,"Cafe ""La Rosa"", centro",-120.50')).toEqual(['2026-10-01', 'Cafe "La Rosa", centro', '-120.50'])
  })

  it('reads amounts with signs, parentheses and thousands separators', () => {
    expect(parseImportAmount('-1,234.50')).toEqual({ amount: 1234.5, isExpense: true })
    expect(parseImportAmount('(99.00)')).toEqual({ amount: 99, isExpense: true })
    expect(parseImportAmount('$14,000')).toEqual({ amount: 14000, isExpense: false })
  })

  it('reads Mexican DD/MM/YYYY dates and passes ISO through', () => {
    expect(parseImportDate('05/10/2026')).toBe('2026-10-05')
    expect(parseImportDate('2026/10/5')).toBe('2026-10-05')
    expect(parseImportDate('2026-10-05')).toBe('2026-10-05')
  })

  it('auto-maps Spanish bank headers', () => {
    const parsed = parseCsvText('Fecha,Concepto,Importe\n05/10/2026,HEB,-850.00\n06/10/2026,Nómina,30000')!
    expect(parsed.columnMap).toEqual({ date: 'Fecha', description: 'Concepto', amount: 'Importe' })
    expect(csvRowsToCandidates(parsed.rows, parsed.columnMap)).toEqual([
      { type: 'expense', amount: 850, merchant: null, description: 'HEB', transaction_date: '2026-10-05' },
      { type: 'income', amount: 30000, merchant: null, description: 'Nómina', transaction_date: '2026-10-06' },
    ])
  })
})

describe('buildImportRows', () => {
  it('applies rules, falls back to Other, and skips duplicates and invalid rows', () => {
    const { rows, skipped } = buildImportRows([
      { type: 'expense', amount: 1302.4, merchant: 'HEB VALLE ORIENTE', description: null, transaction_date: '2026-09-12' },
      { type: 'expense', amount: 87.5, merchant: 'OXXO', description: null, transaction_date: '2026-09-14' },
      { type: 'income', amount: 25000, merchant: null, description: 'PAGO', transaction_date: '2026-09-18' },
      { type: 'expense', amount: 0, merchant: 'Zero', description: null, transaction_date: '2026-09-18' },
      { type: 'expense', amount: 199, merchant: 'Spotify', description: null, transaction_date: 'not a date' },
    ], {
      rules: [hebRule],
      categories,
      existing: [{ id: 'x', transaction_date: '2026-09-15', merchant: 'Oxxo', amount_mxn: 87.5 }],
      owner: 'Bernardo',
    })
    expect(skipped).toBe(3)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ category_id: 'groc', tags: ['super'], owner: 'Bernardo', amount_mxn: 1302.4, currency: 'MXN' })
    expect(rows[1]).toMatchObject({ type: 'income', category_id: 'other-inc', tags: [] })
  })
})
