import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest } from '@/lib/finance-api-auth'

// The widget's full logic, fetched fresh by the tiny loader installed on the
// phones (see widget-script). Design changes deploy here and reach every
// widget automatically — no re-downloads. Expects API_URL / API_KEY / APP_URL
// globals defined by the loader.
export async function GET(req: NextRequest) {
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response

  const script = `// Palette — Mona midnight
const MINT = new Color('#34d399')
const MINT_BRIGHT = new Color('#4ade80')
const MINT_PALE = new Color('#d1fae5')
const MINT_DIM = new Color('#4f8f7d')
const BLUE = new Color('#60a5fa')
const BLUE_PALE = new Color('#dbeafe')
const AMBER = new Color('#fbbf24')
const ORANGE = new Color('#fb923c')
const ROSE = new Color('#f87171')
const WHITE = new Color('#ffffff')
const TXT_DIM = new Color('#a8b3c7')
const TXT_FAINT = new Color('#68758d')
const TRACK = new Color('#1c2940')
const BG_HI = new Color('#14233d')
const BG_MID = new Color('#0b1425')
const BG_LO = new Color('#070c17')
const CARD = new Color('#ffffff', 0.055)
const CARD_BORDER = new Color('#ffffff', 0.09)

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

async function fetchWolffAvatar() {
  const req = new Request(APP_URL.replace('/finance', '/brand/wolff-widget.png'))
  req.timeoutInterval = 8
  return await req.loadImage()
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
  const wolf = s.addText('\\u{1F415} ')
  wolf.font = Font.systemFont(10)
  const name = s.addText('MONA')
  name.font = Font.boldSystemFont(9)
  name.textColor = BLUE
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
  addLabel(w, 'PROJECTED SAVINGS')
  const behind = d.goal_gap > 0
  const hero = w.addText(moneyShort(d.projected_savings || 0))
  hero.font = Font.heavyRoundedSystemFont(size)
  hero.textColor = behind ? AMBER : MINT
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
  if (d.west_month && d.west_month.target > 0) {
    seg(Math.round(d.west_month.pct || 0) + '% WEST', d.west_month.gap > 0 ? AMBER : MINT, true)
    seg('  ·  gap ', TXT_DIM, false)
    seg(moneyShort(d.west_month.gap || 0), d.west_month.gap > 0 ? AMBER : MINT_PALE, true)
  } else {
    seg(Math.round(d.goal_coverage_pct || 0) + '% GOALS', d.goal_gap > 0 ? AMBER : MINT, true)
    seg('  ·  week ', TXT_DIM, false)
    seg(moneyShort(d.week_envelope), MINT_PALE, true)
  }
}

function addDirectivePill(w, d) {
  const dir = d.wolff && (d.wolff.directive || d.wolff.top)
  if (!dir) return
  const pill = w.addStack()
  pill.url = APP_URL.replace('/finance', '/finance/ask')
  pill.centerAlignContent()
  pill.backgroundColor = new Color('#60a5fa', 0.11)
  pill.borderColor = new Color('#60a5fa', 0.20)
  pill.borderWidth = 1
  pill.cornerRadius = 8
  pill.setPadding(5, 9, 5, 9)
  const wolf = pill.addText('\\u{1F415} ')
  wolf.font = Font.systemFont(10)
  const t = pill.addText(dir.title)
  t.font = Font.boldSystemFont(10.5)
  t.textColor = BLUE_PALE
  t.lineLimit = 1
  t.minimumScaleFactor = 0.72
  pill.addSpacer()
}

function addMediumHeader(w, d, avatar) {
  const row = w.addStack()
  row.centerAlignContent()

  if (avatar) {
    const image = row.addImage(avatar)
    image.imageSize = new Size(22, 22)
    image.cornerRadius = 11
    image.borderColor = new Color('#60a5fa', 0.55)
    image.borderWidth = 1
  } else {
    const fallback = row.addText('\u{1F415}')
    fallback.font = Font.systemFont(16)
  }

  row.addSpacer(6)
  const identity = row.addStack()
  identity.layoutVertically()
  const name = identity.addText('MONA')
  name.font = Font.boldSystemFont(9.5)
  name.textColor = BLUE_PALE
  const household = identity.addText('B + L  ·  DAILY COACH')
  household.font = Font.boldSystemFont(6.5)
  household.textColor = TXT_FAINT

  row.addSpacer()
  const date = new DateFormatter()
  date.dateFormat = 'EEE · MMM d'
  const stamp = row.addText(date.string(new Date()).toUpperCase())
  stamp.font = Font.semiboldSystemFont(7.5)
  stamp.textColor = TXT_FAINT
}

function addMetricCard(parent, label, value, detail, color) {
  const card = parent.addStack()
  card.layoutVertically()
  card.size = new Size(92, 45)
  card.backgroundColor = CARD
  card.borderColor = CARD_BORDER
  card.borderWidth = 0.7
  card.cornerRadius = 9
  card.setPadding(5, 8, 5, 8)

  const heading = card.addText(label)
  heading.font = Font.boldSystemFont(6.5)
  heading.textColor = TXT_FAINT
  heading.lineLimit = 1
  card.addSpacer(1)

  const amount = card.addText(value)
  amount.font = Font.heavyRoundedSystemFont(15.5)
  amount.textColor = color
  amount.lineLimit = 1
  amount.minimumScaleFactor = 0.72
  card.addSpacer(1)

  const sub = card.addText(detail)
  sub.font = Font.semiboldSystemFont(6.5)
  sub.textColor = TXT_DIM
  sub.lineLimit = 1
  sub.minimumScaleFactor = 0.75
}

// ── Screens ──────────────────────────────────────────────

// The default medium widget is intentionally a decision surface, not a
// miniature dashboard: one action from Mona, then the three numbers that
// define how much flexibility the household has today, this week, and against
// its primary savings goal.
function mediumScreen(w, d, avatar) {
  const now = new Date()
  const dow = now.getDay()
  const isWeekend = dow === 0 || dow === 6 || (dow === 5 && now.getHours() >= 15)
  const item = (isWeekend && d.wolff && d.wolff.weekend)
    ? d.wolff.weekend
    : (d.wolff ? (d.wolff.directive || d.wolff.top) : null)
  const risk = (d.over_committed_by || 0) > 0

  addMediumHeader(w, d, avatar)
  w.addSpacer(6)

  const meta = w.addStack()
  meta.centerAlignContent()
  const label = meta.addText(isWeekend ? 'WEEKEND PLAN' : "TODAY'S MOVE")
  label.font = Font.boldSystemFont(7)
  label.textColor = BLUE
  meta.addSpacer()
  const state = meta.addStack()
  state.backgroundColor = risk ? new Color('#f87171', 0.13) : new Color('#34d399', 0.12)
  state.cornerRadius = 5
  state.setPadding(2, 6, 2, 6)
  const stateText = state.addText(risk ? 'PROTECT THE PLAN' : 'ROOM AVAILABLE')
  stateText.font = Font.boldSystemFont(6.5)
  stateText.textColor = risk ? ROSE : MINT

  w.addSpacer(2)
  const directive = w.addText(item ? ((item.icon ? item.icon + '  ' : '') + item.title) : 'Stay intentional — Mona is refreshing your next move.')
  directive.font = Font.boldRoundedSystemFont(13.5)
  directive.textColor = WHITE
  directive.lineLimit = 2
  directive.minimumScaleFactor = 0.76

  w.addSpacer(7)
  const metrics = w.addStack()
  const extra = risk ? '$0' : moneyShort(d.safe_to_spend_day || 0)
  addMetricCard(metrics, 'EXTRA TODAY', extra, risk ? 'no unplanned spend' : 'outside the plan', risk ? ROSE : MINT)
  metrics.addSpacer()
  addMetricCard(metrics, 'THROUGH SUNDAY', moneyShort(d.week_envelope || 0), (d.days_left_in_week || 1) + ' day plan', ORANGE)
  metrics.addSpacer()

  const west = d.west_month && d.west_month.target > 0
  const pace = west ? Math.round(d.west_month.pct || 0) : Math.round(d.goal_coverage_pct || 0)
  addMetricCard(metrics, west ? 'WEST PACE' : 'GOAL PACE', pace + '%', moneyShort(d.projected_savings || 0) + ' projected', d.goal_gap > 0 ? AMBER : MINT)
}

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
  main.addSpacer()

  if (d.west_month && d.west_month.target > 0) {
    const right = main.addStack()
    right.layoutVertically()
    right.setPadding(0, 0, 0, 6)
    const pct = Math.max(0, d.west_month.pct || 0) / 100
    const ringStack = right.addStack()
    ringStack.addSpacer()
    const ring = ringStack.addImage(ringImage(54, pct, Math.round(pct * 100) + '%'))
    ring.imageSize = new Size(54, 54)
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
  const item = (isWeekend && d.wolff && d.wolff.weekend) ? d.wolff.weekend : (d.wolff ? (d.wolff.directive || d.wolff.top) : null)
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
    ? 'extra $0  ·  planned ' + money(d.controllable_per_day || 0)
    : 'extra ' + money(d.safe_to_spend_day) + '  ·  planned ' + money(d.controllable_per_day || 0))
  safe.font = Font.boldSystemFont(9)
  safe.textColor = d.over_committed_by > 0 ? ROSE : MINT
  foot.addSpacer()
  const week = foot.addText('week ' + money(d.week_envelope || 0))
  week.font = Font.boldSystemFont(9)
  week.textColor = ORANGE
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
  const c = s.addText('WEST ')
  c.font = Font.semiboldSystemFont(8)
  c.textColor = TXT_DIM
  const e = s.addText((d.west_month && d.west_month.pct != null ? d.west_month.pct : d.goal_coverage_pct) + '%')
  e.font = Font.boldSystemFont(8)
  e.textColor = MINT_PALE
  if (d.west_month && d.west_month.target > 0) {
    w.addSpacer(4)
    const pct = Math.max(0, d.west_month.pct || 0) / 100
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
    const err = w.addText('\\u{1F415} Finance')
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
  } else {
    const pinned = (args.widgetParameter || '').trim().toLowerCase()
    if (pinned === 'pace') paceScreen(w, d, 280)
    else if (pinned === 'smart' || pinned === 'money') smartScreen(w, d)
    else {
      let avatar = null
      try { avatar = await fetchWolffAvatar() } catch (e) { /* emoji fallback */ }
      mediumScreen(w, d, avatar)
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
Script.complete()`

  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
