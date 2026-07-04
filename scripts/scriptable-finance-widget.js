// Finance home-screen widget for iOS via the Scriptable app.
//
// SETUP (once per phone):
//   1. Install "Scriptable" from the App Store (free)
//   2. Open Scriptable → + → paste this whole file → name it "Finance"
//   3. Replace API_KEY below with the FINANCE_API_KEY value
//   4. Long-press home screen → + → Scriptable → Small or Medium widget
//   5. Long-press the widget → Edit Widget → Script: "Finance"
//
// The widget refreshes itself periodically in the background.

const API_URL = 'https://finance.autonomis.co/api/finance/widget'
const API_KEY = 'REPLACE_WITH_FINANCE_API_KEY'

const EMERALD = new Color('#059669')
const ROSE = new Color('#e11d48')
const INK = new Color('#1a2430')
const GRAY = new Color('#5b6b7b')
const BG = new Color('#ffffff')

async function fetchData() {
  let lastErr
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const req = new Request(API_URL)
      req.headers = { 'x-api-key': API_KEY }
      req.timeoutInterval = 20
      const data = await req.loadJSON()
      if (data && data.error) throw new Error('API: ' + data.error)
      return data
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
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
    const detail = w.addText(String(e && e.message ? e.message : e).slice(0, 90))
    detail.textColor = GRAY
    detail.font = Font.mediumSystemFont(9)
    return w
  }

  // Header
  const head = w.addStack()
  const title = head.addText('💰 SAFE TODAY')
  title.font = Font.semiboldSystemFont(10)
  title.textColor = GRAY
  head.addSpacer()
  const day = head.addText(`d${d.day}/${d.days_in_month}`)
  day.font = Font.mediumSystemFont(10)
  day.textColor = GRAY

  w.addSpacer(4)

  // Hero number
  if (d.over_committed_by > 0) {
    const hero = w.addText('$0')
    hero.font = Font.heavySystemFont(34)
    hero.textColor = ROSE
    hero.minimumScaleFactor = 0.6
    const sub = w.addText(`over by ${money(d.over_committed_by)}`)
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

  // Rows
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
    row(`WEST (${d.west.funded_pct}% funded)`, money(d.west.month_target) + '/mo')
  }

  w.url = 'https://finance.autonomis.co/finance'
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000) // ~30 min
  return w
}

const widget = await build()
if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentMedium()
}
Script.complete()
