'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/format'
import type { FinanceCategory, FinanceTransaction } from '@/lib/finance-types'
import type { FinanceRule } from '@/lib/finance-rules'
import {
  buildImportRows, csvRowsToCandidates, parseCsvText, pdfRowsToCandidates,
  type CsvField, type ImportCandidate, type ParsedCsv, type ParsedTransaction,
} from '@/lib/transaction-import'

function notifyWolff(body: Record<string, unknown>) {
  fetch('/api/finance/wolff-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: crypto.randomUUID(), ...body }),
  }).catch(() => {})
}

const CSV_FIELDS: CsvField[] = ['date', 'amount', 'description', 'merchant']

export interface ImportDialogProps {
  open: boolean
  onClose: () => void
  categories: FinanceCategory[]
  rules: FinanceRule[]
  existing: FinanceTransaction[]
  owner: string
  onImported: () => void
}

export function ImportDialog({ open, onClose, categories, rules, existing, owner, onImported }: ImportDialogProps) {
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [pdfRows, setPdfRows] = useState<ParsedTransaction[]>([])
  const [mode, setMode] = useState<'csv' | 'pdf' | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: number; skipped: number } | null>(null)

  const reset = () => { setCsv(null); setPdfRows([]); setMode(null); setResult(null); setParseError('') }
  const close = () => { reset(); onClose() }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError('')
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      setParsing(true)
      try {
        const { parseBBVAPdf } = await import('@/lib/pdf-parser')
        const rows = await parseBBVAPdf(file)
        if (rows.length > 0) { setPdfRows(rows); setMode('pdf') }
        else setParseError('No transactions found in this PDF. Try a CSV export instead.')
      } catch {
        setParseError('Could not read this PDF. Try a CSV export instead.')
      }
      setParsing(false)
      return
    }
    const reader = new FileReader()
    reader.onload = evt => {
      const parsed = parseCsvText(String(evt.target?.result || ''))
      if (!parsed) { setParseError('This CSV has no rows to import.'); return }
      setCsv(parsed)
      setMode('csv')
    }
    reader.readAsText(file)
  }

  const runImport = async (candidates: ImportCandidate[]) => {
    setImporting(true)
    const { rows, skipped } = buildImportRows(candidates, { rules, categories, existing, owner })
    let success = 0
    let errors = 0
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50)
      const { error } = await supabase.from('finance_transactions').insert(chunk)
      if (error) errors += chunk.length
      else success += chunk.length
    }
    setImporting(false)
    setResult({ success, errors, skipped })
    if (success > 0) {
      const expenses = rows.filter(row => row.type === 'expense')
      notifyWolff({ kind: 'imported', type: 'expense', import_count: expenses.length, import_total: expenses.reduce((s, r) => s + r.amount_mxn, 0) })
      onImported()
    }
  }

  const th = 'px-2 py-1.5 text-left font-medium text-fg-secondary'
  const td = 'truncate px-2 py-1.5'

  return (
    <Modal open={open} onClose={close} title="Import transactions">
      {parsing ? (
        <div className="flex flex-col items-center gap-3 py-8" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-info border-t-transparent" />
          <p className="text-sm text-fg-secondary">Reading the BBVA statement…</p>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <div className="space-y-1 rounded-xl border border-border bg-surface-2 p-4 text-sm">
            <p className="font-semibold text-fg">{result.success} transaction{result.success === 1 ? '' : 's'} imported</p>
            {result.skipped > 0 && <p className="text-fg-secondary">{result.skipped} skipped as duplicates or invalid rows</p>}
            {result.errors > 0 && <p className="text-negative">{result.errors} failed to save</p>}
          </div>
          <Button className="w-full" onClick={close}>Done</Button>
        </div>
      ) : mode === 'pdf' ? (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary"><span className="font-semibold text-fg">BBVA statement</span> · {pdfRows.length} transactions found</p>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full table-fixed text-xs">
              <thead className="bg-surface-2"><tr>
                <th className={cn(th, 'w-[26%]')}>Date</th><th className={th}>Description</th><th className={cn(th, 'w-[26%] text-right')}>Amount</th>
              </tr></thead>
              <tbody>
                {pdfRows.slice(0, 8).map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className={td}>{row.date}</td>
                    <td className={td}>{row.description}</td>
                    <td className={cn(td, 'num', row.type === 'income' && 'text-positive')}>{formatMoney(row.amount, { mode: 'precise', sign: row.type === 'income' ? 'always' : 'never' })}</td>
                  </tr>
                ))}
                {pdfRows.length > 8 && <tr className="border-t border-border"><td colSpan={3} className="px-2 py-1.5 text-center text-fg-tertiary">…and {pdfRows.length - 8} more</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={reset}>Back</Button>
            <Button className="flex-1" disabled={importing} onClick={() => runImport(pdfRowsToCandidates(pdfRows))}>
              {importing ? 'Importing…' : `Import ${pdfRows.length}`}
            </Button>
          </div>
        </div>
      ) : mode === 'csv' && csv ? (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary">Found <strong className="text-fg">{csv.rows.length}</strong> rows. Match your columns:</p>
          {CSV_FIELDS.map(field => (
            <div key={field} className="flex items-center gap-3">
              <label htmlFor={`csv-${field}`} className="w-24 text-sm font-medium capitalize text-fg">{field}{field === 'date' || field === 'amount' ? ' *' : ''}</label>
              <select id={`csv-${field}`} value={csv.columnMap[field] || ''} onChange={e => setCsv(c => c && ({ ...c, columnMap: { ...c.columnMap, [field]: e.target.value || undefined } }))}
                className="h-11 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-base text-fg sm:text-sm">
                <option value="">— skip —</option>
                {csv.headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
          {csv.columnMap.date && csv.columnMap.amount && (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full table-fixed text-xs">
                <thead className="bg-surface-2"><tr><th className={cn(th, 'w-[30%]')}>Date</th><th className={cn(th, 'w-[25%] text-right')}>Amount</th><th className={th}>Description</th></tr></thead>
                <tbody>
                  {csv.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className={td}>{row[csv.columnMap.date!]}</td>
                      <td className={cn(td, 'num')}>{row[csv.columnMap.amount!]}</td>
                      <td className={td}>{csv.columnMap.description ? row[csv.columnMap.description] : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={reset}>Back</Button>
            <Button className="flex-1" disabled={importing || !csv.columnMap.date || !csv.columnMap.amount}
              onClick={() => runImport(csvRowsToCandidates(csv.rows, csv.columnMap))}>
              {importing ? 'Importing…' : `Import ${csv.rows.length} rows`}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary">
            Upload a <strong className="text-fg">BBVA PDF statement</strong> or a <strong className="text-fg">CSV</strong> from any bank. Duplicates of what&apos;s already here are skipped.
          </p>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary">
            <Upload className="h-7 w-7 text-fg-secondary" aria-hidden="true" />
            <span className="text-sm font-semibold text-fg">Choose PDF or CSV</span>
            <span className="text-xs text-fg-tertiary">BBVA, Banorte and more</span>
            <input type="file" accept=".csv,.pdf" className="sr-only" onChange={handleFile} />
          </label>
          {parseError && <p role="alert" className="text-sm text-negative">{parseError}</p>}
        </div>
      )}
    </Modal>
  )
}
