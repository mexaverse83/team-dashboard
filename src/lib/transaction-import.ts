// Bank-statement import: CSV and BBVA PDF text → transaction rows (CH-08, CH-17).
// Pure functions; the ImportDialog does the file reading and the inserts.
import { applyRules, detectDuplicates, type FinanceRule } from './finance-rules'
import type { FinanceCategory } from './finance-types'

export interface ParsedTransaction {
  date: string        // YYYY-MM-DD
  description: string
  amount: number      // always positive
  type: 'expense' | 'income'
  merchant: string | null
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && inQuotes && next === '"') {
      current += '"'
      i++
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  values.push(current.trim())
  return values.map(v => v.replace(/^"|"$/g, ''))
}

export function parseImportAmount(value: string): { amount: number; isExpense: boolean } {
  const raw = value.trim()
  const isParenthesized = raw.startsWith('(') && raw.endsWith(')')
  const normalized = raw
    .replace(/[,$\s]/g, '')
    .replace(/[()]/g, '')
  const parsed = parseFloat(normalized)
  const amount = Math.abs(Number.isFinite(parsed) ? parsed : 0)
  return { amount, isExpense: isParenthesized || raw.includes('-') || parsed < 0 }
}

/** Mexican bank exports are DD/MM/YYYY; ISO and YYYY/MM/DD pass through. */
export function parseImportDate(value: string): string {
  const raw = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split(/[/-]/).map(p => p.trim())
  if (parts.length !== 3) return raw

  if (parts[0].length === 4) {
    const [y, m, d] = parts
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  const [day, month, y] = parts
  if (y.length !== 4) return raw
  return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

export type CsvField = 'date' | 'amount' | 'description' | 'merchant'

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
  columnMap: Partial<Record<CsvField, string>>
}

const COLUMN_HINTS: Record<CsvField, string[]> = {
  date: ['date', 'fecha'],
  amount: ['amount', 'monto', 'cargo', 'importe'],
  description: ['description', 'descripcion', 'concepto'],
  merchant: ['merchant', 'comercio'],
}

/** Parse CSV text and guess which columns hold date/amount/description/merchant. */
export function parseCsvText(text: string): ParsedCsv | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return null
  const headers = parseCsvLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const vals = parseCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] || '' })
    return row
  })
  const lower = headers.map(h => h.toLowerCase())
  const columnMap: ParsedCsv['columnMap'] = {}
  for (const field of Object.keys(COLUMN_HINTS) as CsvField[]) {
    const index = lower.findIndex(h => COLUMN_HINTS[field].some(hint => h.includes(hint)))
    if (index >= 0) columnMap[field] = headers[index]
  }
  return { headers, rows, columnMap }
}

const MES: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
}

/**
 * Extract transactions from raw BBVA statement text. Lines look like
 * `DD-mmm-YYYY  DD-mmm-YYYY  DESCRIPTION  +/- $X,XXX.XX` (operation date, charge date).
 * Charges are expenses; '-' lines (payments/credits) are money in.
 */
export function parseBbvaStatementText(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = []
  const datePattern = '(\\d{2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)-(\\d{4})'
  const amountPattern = '([+-])\\s*\\$\\s*([\\d,]+\\.\\d{2})'
  const txRegex = new RegExp(datePattern + '\\s+' + datePattern + '\\s+(.+?)\\s+' + amountPattern, 'gi')

  let match
  while ((match = txRegex.exec(text)) !== null) {
    const [, opDay, opMon, opYear, , , , description, sign, rawAmount] = match
    // Payment breakdown lines (IVA, Interes, Comisiones, Capital) are not purchases.
    if (/^(IVA|Interes|Comisiones|Capital)/i.test(description.trim())) continue
    const month = MES[opMon.toLowerCase()]
    if (!month) continue
    const cleanDesc = description
      .replace(/;\s*Tarjeta Digital \*+\d+/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
    results.push({
      date: `${opYear}-${month}-${opDay}`,
      description: cleanDesc,
      amount: parseFloat(rawAmount.replace(/,/g, '')),
      type: sign === '-' ? 'income' : 'expense',
      merchant: cleanDesc.split(/\s{2,}/)[0] || cleanDesc,
    })
  }
  return results
}

export interface ImportCandidate {
  type: 'expense' | 'income'
  amount: number
  merchant: string | null
  description: string | null
  transaction_date: string
}

export interface ImportRow extends ImportCandidate {
  currency: 'MXN'
  amount_mxn: number
  category_id: string | undefined
  tags: string[]
  is_recurring: false
  owner: string | null
}

export interface ExistingForDedupe {
  id: string
  transaction_date: string
  merchant?: string | null
  description?: string | null
  amount_mxn: number
}

export function csvRowsToCandidates(rows: Record<string, string>[], columnMap: ParsedCsv['columnMap']): ImportCandidate[] {
  if (!columnMap.date || !columnMap.amount) return []
  return rows.map(row => {
    const { amount, isExpense } = parseImportAmount(row[columnMap.amount!] || '0')
    return {
      type: isExpense ? 'expense' : 'income',
      amount,
      merchant: columnMap.merchant ? (row[columnMap.merchant] || null) : null,
      description: columnMap.description ? (row[columnMap.description] || null) : null,
      transaction_date: parseImportDate(row[columnMap.date!] || ''),
    }
  })
}

export function pdfRowsToCandidates(rows: ParsedTransaction[]): ImportCandidate[] {
  return rows.map(row => ({ type: row.type, amount: row.amount, merchant: row.merchant, description: row.description, transaction_date: row.date }))
}

/**
 * Apply rules (category + tags), fall back to Other/Other Income, and drop
 * invalid rows and anything that duplicates existing history (same merchant,
 * amount within $1, ±3 days). `skipped` counts both.
 */
export function buildImportRows(
  candidates: ImportCandidate[],
  { rules, categories, existing, owner }: { rules: FinanceRule[]; categories: FinanceCategory[]; existing: ExistingForDedupe[]; owner: string | null },
): { rows: ImportRow[]; skipped: number } {
  const history = existing.map(t => ({ id: t.id, transaction_date: t.transaction_date, merchant: t.merchant || t.description, amount_mxn: t.amount_mxn }))
  let skipped = 0
  const rows: ImportRow[] = []
  for (const c of candidates) {
    if (!(c.amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(c.transaction_date)) { skipped++; continue }
    const label = c.merchant || c.description
    if (detectDuplicates({ transaction_date: c.transaction_date, merchant: label, amount_mxn: c.amount }, history).length > 0) { skipped++; continue }
    const ruleMatch = applyRules(rules, { merchant: label, amount_mxn: c.amount, owner })
    const fallback = categories.find(cat => cat.name === (c.type === 'expense' ? 'Other' : 'Other Income'))?.id || categories[0]?.id
    rows.push({
      ...c,
      currency: 'MXN',
      amount_mxn: c.amount,
      category_id: ruleMatch?.category_id || fallback,
      tags: ruleMatch?.tags || [],
      is_recurring: false,
      owner: owner || null,
    })
  }
  return { rows, skipped }
}
