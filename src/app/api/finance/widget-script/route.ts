import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

// Serves the personalized Scriptable widget as a downloadable Finance.js.
// Auth: logged-in session (or api key), so only household members can obtain
// the embedded API key.
//
// Design (iterated visually as an HTML mock first): deep emerald-graphite
// gradient, rounded heavy hero numerals, drawn progress ring for the month's
// WEST goal, 10-day spending sparkline, and Wolff's daily directive in a
// mint pill. Screens: smart (default) / wolff / pace, rotating on unpinned
// medium widgets; pin via widget Parameter for swipeable stacks.
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const apiKey = process.env.FINANCE_API_KEY || ''
  const origin = 'https://finance.autonomis.co'

  const script = `// Finance Widget Pro (Scriptable) — generated ${new Date().toISOString().slice(0, 10)}

const API_URL = '${origin}/api/finance/widget'
const API_KEY = '${apiKey}'
const APP_URL = '${origin}/finance'

// Palette — deep emerald night
const MINT = new Color('#34d399')
const MINT_BRIGHT = new Color('#4ade80')
const MINT_PALE = new Color('#d1fae5')
const MINT_DIM = new Color('#2c8f6d')
const AMBER = new Color('#fbbf24')
const ROSE = new Color('#f87171')
const WHITE = new Color('#ffffff')
const TXT_DIM = new Color('#8aa39a')
const TXT_FAINT = new Color('#5f7a70')
const TRACK = new Color('#20372f')
const BG_HI = new Color('#123529')
const BG_MID = new Color('#0d1f1a')
const BG_LO = new Color('#0a1512')

function applyBackground(w) {
  const g = new LinearGradient()
  g.colors = [BG_HI, BG_MID, BG_LO]
  g.locations = [0, 0.45, 1]
  g.startPoint = new Point(1, 0)
  g.endPoint = new Point(0, 1)
  w.backgroundGradient = g
}

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

function moneyShort(n) {
  const abs = Math.abs(n)
  if (abs >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M'
  if (abs >= 10000) return '$' + Math.round(n / 1000) + 'k'
  return money(n)
}

// ── Drawn elements ───────────────────────────────────────

// Progress ring with centered percentage text
function ringImage(sizePt, pct, valueText) {
  const S = 3
  const px = sizePt * S
  const ctx = new DrawContext()
  ctx.size = new Size(px, px)
  ctx.opaque = false
  ctx.respectScreenScale = false
  const lw = 5 * S
  const r = (px - lw) / 2
  const c = px / 2

  const arc = (from, to, color) => {
    ctx.setStrokeColor(color)
    ctx.setLineWidth(lw)
    const p = new Path()
    const steps = Math.max(2, Math.ceil(((to - from) / 0.05)))
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps
      const pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a))
      if (i === 0) p.move(pt)
      else p.addLine(pt)
    }
    ctx.addPath(p)
    ctx.strokePath()
  }

  const TAU = Math.PI * 2
  arc(0, TAU, TRACK)
  const fill = Math.min(1, Math.max(0.02, pct))
  arc(-TAU / 4, -TAU / 4 + TAU * fill, MINT)

  ctx.setTextAlignedCenter()
  ctx.setFont(Font.heavySystemFont(11.5 * S))
  ctx.setTextColor(MINT_PALE)
  ctx.drawTextInRect(valueText, new Rect(0, c - 8 * S, px, 16 * S))
  return ctx.getImage()
}

// 10-day spending sparkline; today amber, heaviest days brighter
function sparkImage(values, wPt, hPt) {
  const S = 3
  const W = wPt * S, H = hPt * S
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = false
  ctx.respectScreenScale = false
  const n = values.length
  const gap = 2.5 * S
  const bw = (W - gap * (n - 1)) / n
  const max = Math.max(1, ...values)
  const sorted = values.slice().sort((a, b) => b - a)
  const hotCut = sorted[Math.min(2, sorted.length - 1)]
  values.forEach((v, i) => {
    const bh = Math.max(2 * S, (v / max) * H)
    const x = i * (bw + gap)
    const isToday = i === n - 1
    const color = isToday ? AMBER : (v >= hotCut && v > 0 ? MINT_DIM : TRACK)
    ctx.setFillColor(color)
    const p = new Path()
    p.addRoundedRect(new Rect(x, H - bh, bw, bh), 1.5 * S, 1.5 * S)
    ctx.addPath(p)
    ctx.fillPath()
  })
  return ctx.getImage()
}

// Horizontal progress bar
function barImage(wPt, hPt, pct, color) {
  const S = 3
  const W = wPt * S, H = hPt * S
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = false
  ctx.respectScreenScale = false
  const r = H / 2
  const track = new Path()
  track.addRoundedRect(new Rect(0, 0, W, H), r, r)
  ctx.addPath(track)
  ctx.setFillColor(TRACK)
  ctx.fillPath()
  const fw = Math.max(H, W * Math.min(1, Math.max(0, pct)))
  const fill = new Path()
  fill.addRoundedRect(new Rect(0, 0, fw, H), r, r)
  ctx.addPath(fill)
  ctx.setFillColor(color)
  ctx.fillPath()
  return ctx.getImage()
}

// ── Layout helpers ───────────────────────────────────────

function addHeader(w, d) {
  const s = w.addStack()
  s.centerAlignContent()
  const wolf = s.addText('\\u{1F43A} ')
  wolf.font = Font.systemFont(10)
  const name = s.addText('WOLFF')
  name.font = Font.boldSystemFont(9)
  name.textColor = MINT_BRIGHT
  s.addSpacer()
  const now = new Date()
  const df = new DateFormatter()
  df.dateFormat = 'EEE MMM d'
  const daysLeft = d.days_in_month - d.day
  const right = s.addText(df.string(now).toUpperCase() + ' · ' + daysLeft + 'D LEFT')
  right.font = Font.semiboldSystemFont(8.5)
  right.textColor = TXT_FAINT
}

function addLabel(w, text) {
  const l = w.addText(text)
  l.font = Font.boldSystemFont(8)
  l.textColor = TXT_DIM
}

function addHero(w, d, size) {
  addLabel(w, 'SAFE TODAY')
  const over = d.over_committed_by > 0
  const hero = w.addText(over ? '$0' : money(d.safe_to_spend_day))
  hero.font = Font.heavyRoundedSystemFont(size)
  hero.textColor = over ? ROSE : MINT
  hero.minimumScaleFactor = 0.6
  hero.lineLimit = 1
}

function addContextLine(w, d) {
  const s = w.addStack()
  s.centerAlignContent()
  const seg = (text, color, bold) => {
    const t = s.addText(text)
    t.font = bold ? Font.boldSystemFont(8.5) : Font.semiboldSystemFont(8.5)
    t.textColor = color
  }
  if (d.over_committed_by > 0) {
    seg('over by ', TXT_DIM, false)
    seg(money(d.over_committed_by), ROSE, true)
    seg('  ·  week left ', TXT_DIM, false)
    seg(money(d.week_envelope), MINT_PALE, true)
  } else {
    seg('week left ', TXT_DIM, false)
    seg(money(d.week_envelope), MINT_PALE, true)
    seg('  ·  net ', TXT_DIM, false)
    seg(moneyShort(d.net_this_month), d.net_this_month >= 0 ? MINT_PALE : ROSE, true)
  }
}

function addDirectivePill(w, d) {
  const dir = d.wolff && (d.wolff.directive || d.wolff.top)
  if (!dir) return
  const pill = w.addStack()
  pill.centerAlignContent()
  pill.backgroundColor = new Color('#34d399', 0.10)
  pill.borderColor = new Color('#34d399', 0.16)
  pill.borderWidth = 1
  pill.cornerRadius = 8
  pill.setPadding(5, 9, 5, 9)
  const wolf = pill.addText('\\u{1F43A} ')
  wolf.font = Font.systemFont(10)
  const t = pill.addText(dir.title)
  t.font = Font.boldSystemFont(10.5)
  t.textColor = MINT_PALE
  t.lineLimit = 1
  t.minimumScaleFactor = 0.72
  pill.addSpacer()
}

// ── Screens ──────────────────────────────────────────────

function smartScreen(w, d) {
  addHeader(w, d)
  w.addSpacer(2)

  const main = w.addStack()
  main.centerAlignContent()
  const left = main.addStack()
  left.layoutVertically()
  addHero(left, d, 29)
  left.addSpacer(2)
  addContextLine(left, d)
  if (Array.isArray(d.daily_spend) && d.daily_spend.some(v => v > 0)) {
    left.addSpacer(7)
    const spark = left.addImage(sparkImage(d.daily_spend, 72, 15))
    spark.imageSize = new Size(72, 15)
    spark.leftAlignImage()
  }
  main.addSpacer()

  if (d.west_month && d.west_month.target > 0) {
    const right = main.addStack()
    right.layoutVertically()
    const pct = Math.max(0, d.west_month.surplus_so_far) / d.west_month.target
    const ringStack = right.addStack()
    ringStack.addSpacer()
    const ring = ringStack.addImage(ringImage(50, pct, Math.round(pct * 100) + '%'))
    ring.imageSize = new Size(50, 50)
    ringStack.addSpacer()
    right.addSpacer(3)
    const lblStack = right.addStack()
    lblStack.addSpacer()
    const now = new Date()
    const df = new DateFormatter()
    df.dateFormat = 'MMM'
    const lbl = lblStack.addText(df.string(now).toUpperCase() + ' GOAL')
    lbl.font = Font.boldSystemFont(7.5)
    lbl.textColor = TXT_FAINT
    lblStack.addSpacer()
  }

  w.addSpacer()
  addDirectivePill(w, d)
}

function wolffScreen(w, d) {
  const now = new Date()
  const dow = now.getDay()
  const isWeekend = dow === 0 || dow === 6 || (dow === 5 && now.getHours() >= 15)
  const item = (isWeekend && d.wolff && d.wolff.weekend) ? d.wolff.weekend : (d.wolff ? d.wolff.top : null)
  addHeader(w, d)
  w.addSpacer(4)
  addLabel(w, isWeekend ? 'WEEKEND VERDICT' : 'TOP INSIGHT')
  w.addSpacer(3)
  if (!item) {
    const t = w.addText('No brief yet — open the app to generate one.')
    t.font = Font.mediumSystemFont(11)
    t.textColor = TXT_DIM
    return
  }
  const title = w.addText((item.icon ? item.icon + ' ' : '') + item.title)
  title.font = Font.boldSystemFont(13)
  title.textColor = WHITE
  title.minimumScaleFactor = 0.8
  title.lineLimit = 2
  w.addSpacer(3)
  const detail = w.addText(item.detail)
  detail.font = Font.mediumSystemFont(9.5)
  detail.textColor = TXT_DIM
  detail.lineLimit = 3
  w.addSpacer()
  const foot = w.addStack()
  const safe = foot.addText(d.over_committed_by > 0
    ? 'safe today $0 · over by ' + money(d.over_committed_by)
    : 'safe today ' + money(d.safe_to_spend_day) + '/day')
  safe.font = Font.boldSystemFont(9)
  safe.textColor = d.over_committed_by > 0 ? ROSE : MINT
}

function paceScreen(w, d, barWidth) {
  addHeader(w, d)
  w.addSpacer(4)
  addLabel(w, 'BUDGET PACE')
  w.addSpacer(4)
  const items = (d.budget_pace || []).slice(0, 4)
  if (!items.length) {
    const t = w.addText('No budget data')
    t.font = Font.mediumSystemFont(11)
    t.textColor = TXT_DIM
    return
  }
  for (const b of items) {
    const s = w.addStack()
    const l = s.addText(b.name)
    l.font = Font.semiboldSystemFont(9.5)
    l.textColor = MINT_PALE
    l.lineLimit = 1
    s.addSpacer()
    const v = s.addText(moneyShort(b.spent) + ' / ' + moneyShort(b.budget))
    v.font = Font.mediumSystemFont(8.5)
    v.textColor = TXT_FAINT
    w.addSpacer(2)
    const color = b.pct >= 100 ? ROSE : b.pct >= 75 ? AMBER : MINT
    const img = w.addImage(barImage(barWidth, 4.5, b.pct / 100, color))
    img.imageSize = new Size(barWidth, 4.5)
    w.addSpacer(4.5)
  }
}

function smallScreen(w, d) {
  addHeader(w, d)
  w.addSpacer(3)
  addHero(w, d, 24)
  w.addSpacer(2)
  const s = w.addStack()
  const c = s.addText('week ')
  c.font = Font.semiboldSystemFont(8)
  c.textColor = TXT_DIM
  const e = s.addText(money(d.week_envelope))
  e.font = Font.boldSystemFont(8)
  e.textColor = MINT_PALE
  if (d.west_month && d.west_month.target > 0) {
    w.addSpacer(7)
    const pct = Math.max(0, d.west_month.surplus_so_far) / d.west_month.target
    const s2 = w.addStack()
    const l = s2.addText('GOAL')
    l.font = Font.boldSystemFont(7)
    l.textColor = TXT_FAINT
    s2.addSpacer()
    const v = s2.addText(Math.round(pct * 100) + '%')
    v.font = Font.boldSystemFont(7.5)
    v.textColor = MINT_PALE
    w.addSpacer(2)
    const img = w.addImage(barImage(118, 4, pct, MINT))
    img.imageSize = new Size(118, 4)
  }
}

// ── Assemble ─────────────────────────────────────────────

async function build() {
  const w = new ListWidget()
  applyBackground(w)
  w.setPadding(12, 15, 11, 15)
  w.url = APP_URL

  let d
  try {
    d = await fetchData()
  } catch (e) {
    const err = w.addText('\\u{1F43A} Finance')
    err.textColor = MINT_PALE
    err.font = Font.boldSystemFont(12)
    w.addSpacer(4)
    const detail = w.addText(String(e && e.message ? e.message : e).slice(0, 140))
    detail.textColor = TXT_DIM
    detail.font = Font.mediumSystemFont(9)
    detail.minimumScaleFactor = 0.7
    return w
  }

  const family = config.widgetFamily || 'medium'

  if (family === 'small') {
    smallScreen(w, d)
  } else if (family === 'large') {
    smartScreen(w, d)
    w.addSpacer(11)
    wolffScreen(w, d)
    w.addSpacer(11)
    paceScreen(w, d, 300)
  } else {
    const pinned = (args.widgetParameter || '').trim().toLowerCase()
    if (pinned === 'wolff') wolffScreen(w, d)
    else if (pinned === 'pace') paceScreen(w, d, 280)
    else if (pinned === 'smart' || pinned === 'money') smartScreen(w, d)
    else {
      // Rotate: the smart slide appears twice per cycle — it's the flagship
      const slot = Math.floor(new Date().getMinutes() / 5) % 4
      if (slot === 1) wolffScreen(w, d)
      else if (slot === 3) paceScreen(w, d, 280)
      else smartScreen(w, d)
    }
  }

  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000)
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
