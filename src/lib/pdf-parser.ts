/**
 * BBVA Mexico PDF Statement Parser
 * Extracts transactions from BBVA credit card / debit statements.
 * Client-side only — uses pdfjs-dist.
 */

// Spanish month abbreviations → zero-indexed month number
const MES: Record<string, string> = {
  ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
  jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
}

export interface ParsedTransaction {
  date: string        // YYYY-MM-DD
  description: string
  amount: number      // always positive
  type: 'expense' | 'income'
  merchant: string | null
}

/**
 * Parse a BBVA statement PDF (File or ArrayBuffer) → transactions
 */
export async function parseBBVAPdf(file: File): Promise<ParsedTransaction[]> {
  const pdfjsLib = await import('pdfjs-dist')
  // Use the bundled worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strings = content.items.map((item: any) => item.str || '')
    fullText += strings.join(' ') + '\n'
  }

  return extractTransactions(fullText)
}

/**
 * Extract transactions from raw BBVA statement text.
 * Matches patterns like: DD-mmm-YYYY   DD-mmm-YYYY   DESCRIPTION   +/- $X,XXX.XX
 */
function extractTransactions(text: string): ParsedTransaction[] {
  const results: ParsedTransaction[] = []

  // Regex for BBVA date format: DD-mmm-YYYY
  const datePattern = '(\\d{2})-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)-(\\d{4})'
  // Amount pattern: +/- $XX,XXX.XX
  const amountPattern = '([+-])\\s*\\$\\s*([\\d,]+\\.\\d{2})'

  // Match transaction lines: op_date  cargo_date  description  amount
  // The description is everything between the second date and the amount
  const txRegex = new RegExp(
    datePattern + '\\s+' + datePattern + '\\s+(.+?)\\s+' + amountPattern,
    'gi'
  )

  let match
  while ((match = txRegex.exec(text)) !== null) {
    const [, opDay, opMon, opYear, , , , description, sign, rawAmount] = match

    // Skip payment breakdown lines (IVA, Interes, Comisiones, Capital)
    if (/^(IVA|Interes|Comisiones|Capital)/i.test(description.trim())) continue

    const month = MES[opMon.toLowerCase()]
    if (!month) continue

    const dateStr = `${opYear}-${month}-${opDay}`
    const amount = parseFloat(rawAmount.replace(/,/g, ''))
    const isPayment = sign === '-'

    // Clean up description — remove trailing "Tarjeta Digital ***XXXX" etc.
    const cleanDesc = description
      .replace(/;\s*Tarjeta Digital \*+\d+/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    // Derive merchant from description (first meaningful word group)
    const merchant = cleanDesc.split(/\s{2,}/)[0] || cleanDesc

    results.push({
      date: dateStr,
      description: cleanDesc,
      amount,
      type: isPayment ? 'income' : 'expense', // payments = money in (credit), charges = expense
      merchant,
    })
  }

  return results
}

/**
 * Detect if a PDF is likely a BBVA statement
 */
export async function detectBankFormat(file: File): Promise<'bbva' | 'unknown'> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const content = await page.getTextContent()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = content.items.map((item: any) => item.str || '').join(' ')

  if (/BBVA\s*MEXICO|bbva\.mx|L[ií]nea BBVA/i.test(text)) return 'bbva'
  return 'unknown'
}
