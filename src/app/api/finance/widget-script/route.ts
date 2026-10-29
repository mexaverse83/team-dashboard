import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'
import { localDateKey } from '@/lib/dates'
import { widgetReadTokens, widgetTokenForLoader } from '@/lib/widget-auth'

// Serves the personalized Scriptable LOADER as a downloadable Finance.js.
// The loader caches the widget logic from /api/finance/widget-code and
// re-checks it at most every 6h (ETag → 304), so design changes deploy
// without re-downloads. It embeds a read-only WIDGET_READ_TOKENS entry
// (?slot=N picks one per phone), never the read/write FINANCE_API_KEY. While
// WIDGET_READ_TOKENS is unset the download fails closed (503) — phones already
// installed keep their embedded key, and every phone must re-download anyway
// to get a token. WIDGET_ALLOW_LEGACY_KEY=1 is an explicit escape hatch.
// ?check=1 answers {ready} so the install card can explain instead of
// downloading an error (W12, NU-5/6).
const MISSING_TOKENS_MESSAGE = 'Set WIDGET_READ_TOKENS (one per phone) in Vercel, then download again.'
const slotMissingMessage = (slot: string | null) => Number(slot) === 1
  ? 'Add a second WIDGET_READ_TOKENS entry for Laura’s phone in Vercel, then download again.'
  : `Add a WIDGET_READ_TOKENS entry for phone slot ${slot} in Vercel, then download again.`

export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://finance.autonomis.co'
  const slot = req.nextUrl.searchParams.get('slot')
  const token = widgetTokenForLoader(slot)
  const tokenCount = widgetReadTokens().length
  // Tokens exist but not one for this phone's slot: never hand out another phone's.
  const slotMissing = !token && tokenCount > 0
  const allowLegacy = process.env.WIDGET_ALLOW_LEGACY_KEY === '1' && tokenCount === 0
  const ready = Boolean(token) || allowLegacy
  const message = ready ? null : slotMissing ? slotMissingMessage(slot) : MISSING_TOKENS_MESSAGE
  if (req.nextUrl.searchParams.get('check') === '1') {
    return NextResponse.json({ ready, message }, { headers: { 'Cache-Control': 'no-store' } })
  }
  if (!ready) {
    return NextResponse.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
  const legacyKey = token ? '' : process.env.FINANCE_API_KEY || ''
  if (!token) console.warn('[widget-script] WIDGET_ALLOW_LEGACY_KEY=1: the loader embeds FINANCE_API_KEY')

  const script = buildLoader({ origin, token, legacyKey, generated: localDateKey() })
  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Content-Disposition': 'attachment; filename="Finance.js"',
      'Cache-Control': 'no-store',
    },
  })
}

function buildLoader({ origin, token, legacyKey, generated }: { origin: string; token: string | null; legacyKey: string; generated: string }) {
  const q = (s: string) => JSON.stringify(s)
  return `// Mona widget loader (Scriptable), generated ${generated}.
// Parameters (long-press › Edit widget › Parameter): goals, coach, spend,
// quickadd, lang=es. The widget's design lives on the server.

const API_URL = ${q(`${origin}/api/finance/widget`)}
const APP_URL = ${q(`${origin}/finance`)}
const CODE_URL = ${q(`${origin}/api/finance/widget-code`)}
const WIDGET_TOKEN = ${q(token || '')}
const API_KEY = ${q(legacyKey)}
const CODE_TTL_MS = 6 * 60 * 60 * 1000

const fm = FileManager.local()
const codePath = fm.joinPath(fm.libraryDirectory(), 'mona-widget-code.js')
const metaPath = fm.joinPath(fm.libraryDirectory(), 'mona-widget-code.json')
const authHeaders = WIDGET_TOKEN ? { 'x-widget-token': WIDGET_TOKEN } : { 'x-api-key': API_KEY }

let meta = {}
try { if (fm.fileExists(metaPath)) meta = JSON.parse(fm.readString(metaPath)) || {} } catch (e) { meta = {} }
let code = fm.fileExists(codePath) ? fm.readString(codePath) : null
let codeStatus = 0

const due = !code || !config.runsInWidget || Date.now() - (meta.checked_at || 0) > CODE_TTL_MS
if (due) {
  try {
    const r = new Request(CODE_URL)
    r.headers = Object.assign({}, authHeaders, code && meta.etag ? { 'If-None-Match': meta.etag } : {})
    r.timeoutInterval = 10
    const t = await r.loadString()
    const res = r.response || {}
    codeStatus = res.statusCode || 0
    const h = res.headers || {}
    if (codeStatus === 200 && t && t.indexOf('Script.complete') !== -1) {
      code = t
      fm.writeString(codePath, t)
      meta.etag = h.ETag || h.Etag || h.etag || null
    }
    if (codeStatus === 200 || codeStatus === 304) {
      meta.checked_at = Date.now()
      fm.writeString(metaPath, JSON.stringify(meta))
    }
  } catch (e) { /* offline: use the cached code */ }
}

function notice(title, body) {
  const w = new ListWidget()
  w.url = APP_URL
  const accessory = String(config.widgetFamily || '').indexOf('accessory') === 0
  const t = w.addText(title)
  t.font = Font.boldSystemFont(13)
  if (!accessory) t.textColor = Color.dynamic(new Color('#0F172A'), new Color('#F3F4F6'))
  w.addSpacer(4)
  const d = w.addText(body)
  d.font = Font.mediumSystemFont(12)
  d.minimumScaleFactor = 0.8
  if (!accessory) {
    d.textColor = Color.dynamic(new Color('#475569'), new Color('#A3AAB5'))
    w.backgroundColor = Color.dynamic(new Color('#FFFFFF'), new Color('#16181D'))
  }
  if (config.runsInWidget) Script.setWidget(w)
  else w.presentMedium()
  Script.complete()
}

if (!code) {
  if (codeStatus === 401 || codeStatus === 403) notice('Mona', 'Re-install the widget from Family › Phone widget')
  else notice('Mona', 'Connect once to load the widget')
} else {
  try {
    await eval('(async () => {' + code + '\\n})()')
  } catch (e) {
    try { fm.writeString(metaPath, '{}') } catch (e2) { /* force a fresh code check next run */ }
    notice('Mona', 'Widget error, retrying soon: ' + String(e && e.message || e).slice(0, 80))
  }
}
`
}
