/**
 * BBVA Mexico PDF Statement Parser
 * Extracts transactions from BBVA credit card / debit statements.
 * Client-side only — uses pdfjs-dist.
 */

import { parseBbvaStatementText, type ParsedTransaction } from './transaction-import'

export type { ParsedTransaction }

/**
 * Parse a BBVA statement PDF (File or ArrayBuffer) → transactions
 */
export async function parseBBVAPdf(file: File): Promise<ParsedTransaction[]> {
  const fullText = await extractPdfText(file)
  return parseBbvaStatementText(fullText)
}

/** Extract text from all pages of a PDF */
async function extractPdfText(file: File): Promise<string> {
  // Dynamic import — works in browser with bundler

  const pdfjsLib = await import('pdfjs-dist') as any
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise

  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    const strings = content.items.map((item: any) => item.str || '')
    fullText += strings.join(' ') + '\n'
  }
  return fullText
}

/**
 * Detect if a PDF is likely a BBVA statement
 */
export async function detectBankFormat(file: File): Promise<'bbva' | 'unknown'> {
  const text = await extractPdfText(file)
  if (/BBVA\s*MEXICO|bbva\.mx|L[ií]nea BBVA/i.test(text)) return 'bbva'
  return 'unknown'
}
