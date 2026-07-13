import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

// Serves the personalized Scriptable LOADER as a downloadable Finance.js.
// The loader fetches the actual widget logic from /api/finance/widget-code on
// every run (cached locally for offline), so design changes deploy without
// the phones ever re-downloading. Auth: logged-in session or api key.
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const apiKey = process.env.FINANCE_API_KEY || ''
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://finance.autonomis.co'

  const script = `// Finance widget loader (Scriptable) — self-updating, generated ${new Date().toISOString().slice(0, 10)}
// The widget's design/logic lives on the server and refreshes automatically.

const API_URL = '${origin}/api/finance/widget'
const API_KEY = '${apiKey}'
const APP_URL = '${origin}/finance'
const CODE_URL = '${origin}/api/finance/widget-code'

const fm = FileManager.local()
const cachePath = fm.joinPath(fm.libraryDirectory(), 'wolff-widget-code.js')

let code = null
try {
  const r = new Request(CODE_URL)
  r.headers = { 'x-api-key': API_KEY }
  r.timeoutInterval = 15
  const t = await r.loadString()
  if (t && t.indexOf('smartScreen') !== -1) {
    code = t
    try { fm.writeString(cachePath, t) } catch (e) { /* cache write is best-effort */ }
  }
} catch (e) { /* offline — fall back to cache */ }

if (!code && fm.fileExists(cachePath)) {
  code = fm.readString(cachePath)
}

if (!code) {
  const w = new ListWidget()
  w.backgroundColor = new Color('#0d1f1a')
  const t = w.addText('\\u{1F43A} Finance')
  t.textColor = new Color('#d1fae5')
  t.font = Font.boldSystemFont(12)
  w.addSpacer(4)
  const d = w.addText('First run needs internet to fetch the widget.')
  d.textColor = new Color('#8aa39a')
  d.font = Font.mediumSystemFont(9)
  if (config.runsInWidget) Script.setWidget(w)
  Script.complete()
} else {
  await eval('(async () => {' + code + '\\n})()')
}
`

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Content-Disposition': 'attachment; filename="Finance.js"',
      'Cache-Control': 'no-store',
    },
  })
}
