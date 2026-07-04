import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

// Serves the personalized Scriptable widget as a downloadable Finance.js —
// eliminates email copy-paste (which corrupts the script with invisible
// characters). Auth: the logged-in Safari session cookie, so only household
// members can obtain the embedded API key.
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const apiKey = process.env.FINANCE_API_KEY || ''
  const origin = 'https://finance.autonomis.co'

  const script = `// Finance home-screen widget (Scriptable) — generated ${new Date().toISOString().slice(0, 10)}

const API_URL = '${origin}/api/finance/widget'
const API_KEY = '${apiKey}'

const EMERALD = new Color('#059669')
const ROSE = new Color('#e11d48')
const INK = new Color('#1a2430')
const GRAY = new Color('#5b6b7b')
const BG = new Color('#ffffff')

async function fetchData() {
  const req = new Request(API_URL)
  req.headers = { 'x-api-key': API_KEY }
  req.timeoutInterval = 20
  const text = await req.loadString()
  const status = req.response ? req.response.statusCode : '?'
  try {
    const data = JSON.parse(text)
    if (data && data.error) throw new Error('API ' + status + ': ' + data.error)
    return data
  } catch (e) {
    if (String(e.message || '').startsWith('API ')) throw e
    throw new Error('HTTP ' + status + ' non-JSON: ' + text.slice(0, 80))
  }
}

function money(n) {
  return '$' + Math.round(n).toLocaleString('en-US')
}

async function build() {
  const w = new ListWidget()
  w.backgroundColor = BG
  w.setPadding(14, 14, 12, 14)

  let d
  try {
    d = await fetchData()
  } catch (e) {
    const err = w.addText('Finance: error')
    err.textColor = ROSE
    err.font = Font.semiboldSystemFont(12)
    const detail = w.addText(String(e && e.message ? e.message : e).slice(0, 140))
    detail.textColor = GRAY
    detail.font = Font.mediumSystemFont(9)
    detail.minimumScaleFactor = 0.7
    return w
  }

  const head = w.addStack()
  const title = head.addText('\\u{1F4B0} SAFE TODAY')
  title.font = Font.semiboldSystemFont(10)
  title.textColor = GRAY
  head.addSpacer()
  const day = head.addText('d' + d.day + '/' + d.days_in_month)
  day.font = Font.mediumSystemFont(10)
  day.textColor = GRAY

  w.addSpacer(4)

  if (d.over_committed_by > 0) {
    const hero = w.addText('$0')
    hero.font = Font.heavySystemFont(34)
    hero.textColor = ROSE
    hero.minimumScaleFactor = 0.6
    const sub = w.addText('over by ' + money(d.over_committed_by))
    sub.font = Font.mediumSystemFont(10)
    sub.textColor = ROSE
  } else {
    const hero = w.addText(money(d.safe_to_spend_day))
    hero.font = Font.heavySystemFont(34)
    hero.textColor = EMERALD
    hero.minimumScaleFactor = 0.6
    const sub = w.addText('per day, guilt-free')
    sub.font = Font.mediumSystemFont(10)
    sub.textColor = GRAY
  }

  w.addSpacer(8)

  const row = (label, value, color) => {
    const s = w.addStack()
    const l = s.addText(label)
    l.font = Font.mediumSystemFont(11)
    l.textColor = GRAY
    s.addSpacer()
    const v = s.addText(value)
    v.font = Font.semiboldSystemFont(11)
    v.textColor = color || INK
    w.addSpacer(2)
  }

  row('Week envelope', money(d.week_envelope))
  row('Net this month', money(d.net_this_month), d.net_this_month >= 0 ? EMERALD : ROSE)
  if (d.west && d.west.month_target != null) {
    row('WEST (' + d.west.funded_pct + '% funded)', money(d.west.month_target) + '/mo')
  }

  w.url = '${origin}/finance'
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000)
  return w
}

const widget = await build()
if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentMedium()
}
Script.complete()
`

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Content-Disposition': 'attachment; filename="Finance.js"',
      'Cache-Control': 'no-store',
    },
  })
}
