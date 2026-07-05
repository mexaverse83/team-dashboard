import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

// Serves the personalized Scriptable widget as a downloadable Finance.js —
// eliminates email copy-paste (which corrupts the script with invisible
// characters). Auth: the logged-in Safari session cookie, so only household
// members can obtain the embedded API key.
//
// Widget Pro: three screens rotate with iOS's periodic refresh —
//   money (safe today + WEST bar) → wolff (top insight, weekend verdict on
//   weekends) → pace (drawn budget bars). Small widgets always show money;
//   large widgets show everything.
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const apiKey = process.env.FINANCE_API_KEY || ''
  const origin = 'https://finance.autonomis.co'

  const script = `// Finance Widget Pro (Scriptable) — generated ${new Date().toISOString().slice(0, 10)}

const API_URL = '${origin}/api/finance/widget'
const API_KEY = '${apiKey}'
const APP_URL = '${origin}/finance'

const EMERALD = new Color('#059669')
const AMBER = new Color('#b45309')
const ROSE = new Color('#e11d48')
const INK = new Color('#1a2430')
const GRAY = new Color('#5b6b7b')
const TRACK = new Color('#e8edf2')
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

// Rounded progress bar rendered as an image
function bar(widthPt, heightPt, pct, color) {
  const scale = 3
  const wpx = widthPt * scale, hpx = heightPt * scale
  const ctx = new DrawContext()
  ctx.size = new Size(wpx, hpx)
  ctx.opaque = false
  ctx.respectScreenScale = false
  const r = hpx / 2
  const track = new Path()
  track.addRoundedRect(new Rect(0, 0, wpx, hpx), r, r)
  ctx.addPath(track)
  ctx.setFillColor(TRACK)
  ctx.fillPath()
  const fw = Math.max(hpx, wpx * Math.min(1, Math.max(0, pct)))
  const fill = new Path()
  fill.addRoundedRect(new Rect(0, 0, fw, hpx), r, r)
  ctx.addPath(fill)
  ctx.setFillColor(color)
  ctx.fillPath()
  const img = ctx.getImage()
  return { img, w: widthPt, h: heightPt }
}

function addBar(w, pct, color, widthPt) {
  const b = bar(widthPt, 5, pct, color)
  const img = w.addImage(b.img)
  img.imageSize = new Size(b.w, b.h)
  img.cornerRadius = 2.5
}

function header(w, label, right) {
  const s = w.addStack()
  const t = s.addText(label)
  t.font = Font.semiboldSystemFont(10)
  t.textColor = GRAY
  s.addSpacer()
  if (right) {
    const r = s.addText(right)
    r.font = Font.mediumSystemFont(10)
    r.textColor = GRAY
  }
}

function kv(w, label, value, color) {
  const s = w.addStack()
  const l = s.addText(label)
  l.font = Font.mediumSystemFont(11)
  l.textColor = GRAY
  l.lineLimit = 1
  s.addSpacer()
  const v = s.addText(value)
  v.font = Font.semiboldSystemFont(11)
  v.textColor = color || INK
  w.addSpacer(2)
}

// ── Screens ──────────────────────────────────────────────

function moneyScreen(w, d, compact) {
  header(w, '\\u{1F4B0} SAFE TODAY', 'd' + d.day + '/' + d.days_in_month)
  w.addSpacer(3)
  if (d.over_committed_by > 0) {
    const hero = w.addText('$0')
    hero.font = Font.heavySystemFont(compact ? 30 : 34)
    hero.textColor = ROSE
    hero.minimumScaleFactor = 0.6
    const sub = w.addText('over by ' + money(d.over_committed_by))
    sub.font = Font.mediumSystemFont(10)
    sub.textColor = ROSE
  } else {
    const hero = w.addText(money(d.safe_to_spend_day))
    hero.font = Font.heavySystemFont(compact ? 30 : 34)
    hero.textColor = EMERALD
    hero.minimumScaleFactor = 0.6
    const sub = w.addText('per day, guilt-free')
    sub.font = Font.mediumSystemFont(10)
    sub.textColor = GRAY
  }
  w.addSpacer(7)
  kv(w, 'Week envelope', money(d.week_envelope))
  if (!compact) kv(w, 'Net this month', money(d.net_this_month), d.net_this_month >= 0 ? EMERALD : ROSE)
  if (d.west && d.west.funded_pct != null) {
    w.addSpacer(3)
    const s = w.addStack()
    const l = s.addText('WEST')
    l.font = Font.mediumSystemFont(10)
    l.textColor = GRAY
    s.addSpacer()
    const v = s.addText(d.west.funded_pct + '%')
    v.font = Font.semiboldSystemFont(10)
    v.textColor = INK
    w.addSpacer(2)
    addBar(w, d.west.funded_pct / 100, EMERALD, compact ? 120 : 280)
  }
}

function wolffScreen(w, d) {
  const now = new Date()
  const dow = now.getDay()
  const isWeekendWindow = dow === 0 || dow === 6 || (dow === 5 && now.getHours() >= 15)
  const item = (isWeekendWindow && d.wolff && d.wolff.weekend) ? d.wolff.weekend : (d.wolff ? d.wolff.top : null)
  header(w, '\\u{1F43A} WOLFF SAYS', isWeekendWindow ? 'weekend' : '')
  w.addSpacer(4)
  if (!item) {
    const t = w.addText('No brief yet today — open the app to generate one.')
    t.font = Font.mediumSystemFont(11)
    t.textColor = GRAY
    return
  }
  const title = w.addText((item.icon ? item.icon + ' ' : '') + item.title)
  title.font = Font.semiboldSystemFont(13)
  title.textColor = INK
  title.minimumScaleFactor = 0.8
  title.lineLimit = 2
  w.addSpacer(3)
  const detail = w.addText(item.detail)
  detail.font = Font.mediumSystemFont(10)
  detail.textColor = GRAY
  detail.lineLimit = 4
  w.addSpacer(5)
  const foot = w.addStack()
  const safe = foot.addText(d.over_committed_by > 0 ? 'Safe today: $0' : 'Safe today: ' + money(d.safe_to_spend_day) + '/day')
  safe.font = Font.semiboldSystemFont(10)
  safe.textColor = d.over_committed_by > 0 ? ROSE : EMERALD
}

function paceScreen(w, d, barWidth) {
  header(w, '\\u{1F4CA} BUDGET PACE', 'd' + d.day + '/' + d.days_in_month)
  w.addSpacer(5)
  const items = (d.budget_pace || []).slice(0, 4)
  if (!items.length) {
    const t = w.addText('No budget data')
    t.font = Font.mediumSystemFont(11)
    t.textColor = GRAY
    return
  }
  for (const b of items) {
    const s = w.addStack()
    const l = s.addText(b.name)
    l.font = Font.mediumSystemFont(10)
    l.textColor = INK
    l.lineLimit = 1
    s.addSpacer()
    const v = s.addText(money(b.spent) + ' / ' + money(b.budget))
    v.font = Font.mediumSystemFont(9)
    v.textColor = GRAY
    w.addSpacer(2)
    const color = b.pct >= 100 ? ROSE : b.pct >= 75 ? AMBER : EMERALD
    addBar(w, b.pct / 100, color, barWidth)
    w.addSpacer(5)
  }
}

// The AI-curated single slide: safe today + WEST month progress + week
// envelope + Wolff's daily directive.
function smartScreen(w, d) {
  header(w, '\\u{1F43A} TODAY', 'd' + d.day + '/' + d.days_in_month)
  w.addSpacer(3)

  const top = w.addStack()
  top.centerAlignContent()
  const heroCol = top.addStack()
  heroCol.layoutVertically()
  if (d.over_committed_by > 0) {
    const hero = heroCol.addText('$0')
    hero.font = Font.heavySystemFont(28)
    hero.textColor = ROSE
    const sub = heroCol.addText('over by ' + money(d.over_committed_by))
    sub.font = Font.mediumSystemFont(9)
    sub.textColor = ROSE
  } else {
    const hero = heroCol.addText(money(d.safe_to_spend_day))
    hero.font = Font.heavySystemFont(28)
    hero.textColor = EMERALD
    const sub = heroCol.addText('safe today')
    sub.font = Font.mediumSystemFont(9)
    sub.textColor = GRAY
  }
  top.addSpacer()
  const sideCol = top.addStack()
  sideCol.layoutVertically()
  const wk = sideCol.addText('Week left: ' + money(d.week_envelope))
  wk.font = Font.semiboldSystemFont(10)
  wk.textColor = INK
  wk.rightAlignText()
  const nm = sideCol.addText('Net: ' + money(d.net_this_month))
  nm.font = Font.mediumSystemFont(10)
  nm.textColor = d.net_this_month >= 0 ? EMERALD : ROSE
  nm.rightAlignText()

  if (d.west_month && d.west_month.target > 0) {
    w.addSpacer(6)
    const s = w.addStack()
    const l = s.addText('WEST transfer this month')
    l.font = Font.mediumSystemFont(9)
    l.textColor = GRAY
    s.addSpacer()
    const v = s.addText(money(Math.max(0, d.west_month.surplus_so_far)) + ' / ' + money(d.west_month.target))
    v.font = Font.semiboldSystemFont(9)
    v.textColor = INK
    w.addSpacer(2)
    const pct = Math.max(0, d.west_month.surplus_so_far) / d.west_month.target
    addBar(w, pct, pct >= 1 ? EMERALD : AMBER, 280)
  }

  const dir = d.wolff && d.wolff.directive
  if (dir) {
    w.addSpacer(7)
    const box = w.addStack()
    box.backgroundColor = new Color('#ecfdf5')
    box.cornerRadius = 6
    box.setPadding(5, 8, 5, 8)
    box.layoutVertically()
    const t = box.addText('\\u{1F43A} ' + dir.title)
    t.font = Font.semiboldSystemFont(11)
    t.textColor = new Color('#065f46')
    t.lineLimit = 1
    t.minimumScaleFactor = 0.75
    const dd = box.addText(dir.detail)
    dd.font = Font.mediumSystemFont(9)
    dd.textColor = GRAY
    dd.lineLimit = 2
  }
}

// ── Assemble by size + rotation ─────────────────────────

async function build() {
  const w = new ListWidget()
  w.backgroundColor = BG
  w.setPadding(13, 14, 12, 14)
  w.url = APP_URL

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

  const family = config.widgetFamily || 'medium'

  if (family === 'small') {
    moneyScreen(w, d, true)
  } else if (family === 'large') {
    smartScreen(w, d)
    w.addSpacer(10)
    wolffScreen(w, d)
    w.addSpacer(10)
    paceScreen(w, d, 300)
  } else {
    // Medium: the widget Parameter (long-press -> Edit Widget -> Parameter)
    // pins a screen: 'money', 'wolff', or 'pace'. Pin three copies and stack
    // them for instant swipe-shuffling. With no parameter, rotate by 5-minute
    // clock slots so every OS refresh lands on a different screen.
    const pinned = (args.widgetParameter || '').trim().toLowerCase()
    if (pinned === 'money') moneyScreen(w, d, false)
    else if (pinned === 'wolff') wolffScreen(w, d)
    else if (pinned === 'pace') paceScreen(w, d, 280)
    else if (pinned === 'smart') smartScreen(w, d)
    else {
      const slot = Math.floor(new Date().getMinutes() / 5) % 4
      if (slot === 0 || slot === 2) smartScreen(w, d)
      else if (slot === 1) moneyScreen(w, d, false)
      else wolffScreen(w, d)
    }
  }

  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000)
  return w
}

const widget = await build()
if (config.runsInWidget) {
  Script.setWidget(widget)
} else {
  await widget.presentLarge()
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
