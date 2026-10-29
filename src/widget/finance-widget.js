/* global Color, Font, Point, Size, Rect, Path, DrawContext, ListWidget, Request, DateFormatter, FileManager, Device, config, args, Script, API_URL, API_KEY, APP_URL, WIDGET_TOKEN */
// Mona phone widget v2 (Scriptable). Served raw by /api/finance/widget-code
// and run by the Finance.js loader inside an async function, with API_URL,
// APP_URL and WIDGET_TOKEN (or the legacy API_KEY) in scope.
// v1 loaders only accept code containing the word smartScreen; keep it here.
//
// Rules (spec W §0): one hero number per family ("can we spend?"), one WEST
// bar, never AI text that isn't from today, status = colour + word, text
// >= 11pt, light/dark via Color.dynamic, lock-screen families white only.

/**
 * @typedef {Object} WidgetData
 * @property {number} v
 * @property {string} updated_at
 * @property {number} day
 * @property {number} days_in_month
 * @property {string} month
 * @property {{budget:number, spent:number, left:number, days_left:number, through_label:string, through_date?:string}} variable
 * @property {'ok'|'tight'|'over'} status
 * @property {{name:string, pct:number, over_by:number}|null} top_over
 * @property {Array<{name:string, spent:number, budget:number, pct:number}>} budget_pace
 * @property {number[]} daily_spend
 * @property {number} daily_budget_pace
 * @property {{label:string, target:number, projected_savings:number, gap:number, pct:number, tone:'good'|'warn'}|null} west_month
 * @property {Array<{date:string, label:string, amount:number, count:number}>} upcoming
 * @property {{baby_months:number|null, west_funded_pct:number|null, west_months_to_delivery:number|null}} milestones
 * @property {{title:string, url:string}} coach
 * @property {{title:string, url:string}} [coach_es]
 * @property {{fresh:boolean, generated_at:string|null, title:string|null}} brief
 * @property {boolean} [__stale]
 */

const DATA_TIMEOUT_S = 10
const CACHE_FILE = 'mona-widget-data.json'

// ── Parameters: "goals", "coach", "spend", "quickadd", "lang=es" (any order) ──
const PARAMS = String((typeof args !== 'undefined' && args.widgetParameter) || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)
const hasParam = p => PARAMS.indexOf(p) !== -1
const LANG = hasParam('lang=es') || hasParam('es') ? 'es' : 'en'

const STR = {
  en: {
    left: 'Left to spend', over: 'Over budget', leftShort: 'left', overShort: 'over',
    everyday: 'everyday budgets', thru: 'thru', daysLeft: n => n === 1 ? 'last day' : n + ' days left',
    perDay: v => v + '/day', onPlan: 'On plan', tight: 'Tight', overPlan: 'Over plan',
    ofBudget: (n, p) => n + ' ' + p + '% of budget', underPace: v => v + ' under pace', overPace: v => v + ' over pace',
    spendPace: 'Spend vs pace', west: 'WEST', savings: 'Savings goal', onTarget: 'on target', of: 'of', toGo: v => v + ' to go',
    budgets: 'Budgets', leftOf: v => v + ' left', overBy: v => v + ' over', comingUp: 'Coming up', more: n => '+' + n + ' more',
    updated: t => 'Updated ' + t, asOf: t => 'As of ' + t, lastMonth: 'Last month', noCacheTitle: 'Mona', noCache: 'Connect once to load your numbers',
    reinstall: 'Re-install the widget from Family › Phone widget', funded: 'funded', baby: n => n + ' mo to baby',
    milestones: 'Milestones', moToKeys: n => n + ' mo to keys', nothingDue: 'Nothing due in the next 2 weeks', offline: 'Offline', open: 'Open Mona ›',
  },
  es: {
    left: 'Disponible', over: 'Excedido', leftShort: 'quedan', overShort: 'arriba',
    everyday: 'gasto diario', thru: 'hasta', daysLeft: n => n === 1 ? 'último día' : 'quedan ' + n + ' días',
    perDay: v => v + '/día', onPlan: 'En plan', tight: 'Justo', overPlan: 'Fuera de plan',
    ofBudget: (n, p) => n + ' ' + p + '% del presupuesto', underPace: v => v + ' bajo el ritmo', overPace: v => v + ' sobre el ritmo',
    spendPace: 'Gasto vs ritmo', west: 'WEST', savings: 'Meta de ahorro', onTarget: 'en meta', of: 'de', toGo: v => 'faltan ' + v,
    budgets: 'Presupuestos', leftOf: v => 'quedan ' + v, overBy: v => v + ' arriba', comingUp: 'Próximos cargos', more: n => '+' + n + ' más',
    updated: t => 'Actualizado ' + t, asOf: t => 'Al ' + t, lastMonth: 'Mes pasado', noCacheTitle: 'Mona', noCache: 'Conéctate una vez para cargar tus números',
    reinstall: 'Reinstala el widget desde Family › Phone widget', funded: 'cubierto', baby: n => n + ' meses para el bebé',
    milestones: 'Hitos', moToKeys: n => n + ' meses para la entrega', nothingDue: 'Nada por pagar en 2 semanas', offline: 'Sin conexión', open: 'Abrir Mona ›',
  },
}[LANG]

// ── Colour tokens (spec §0) ──
const dyn = (l, d, la, da) => Color.dynamic(new Color(l, la == null ? 1 : la), new Color(d, da == null ? 1 : da))
const C = {
  bg: dyn('#FFFFFF', '#16181D'),
  text: dyn('#0F172A', '#F3F4F6'),
  sub: dyn('#475569', '#A3AAB5'),
  faint: dyn('#64748B', '#8A929E'),
  good: dyn('#047857', '#34D399'),
  warn: dyn('#B45309', '#FBBF24'),
  bad: dyn('#B91C1C', '#F87171'),
  accent: dyn('#1D4ED8', '#7AB0FF'),
  rule: dyn('#0F172A', '#FFFFFF', 0.08, 0.08),
  chip: {
    good: dyn('#047857', '#34D399', 0.10, 0.16),
    warn: dyn('#B45309', '#FBBF24', 0.10, 0.16),
    bad: dyn('#B91C1C', '#F87171', 0.10, 0.16),
  },
}
// DrawContext images can't follow the appearance: mid-tones that read on both.
const FILL = { good: new Color('#10B981'), warn: new Color('#F59E0B'), bad: new Color('#EF4444'), accent: new Color('#3B82F6') }
const TRACK = new Color('#8E8E93', 0.28)
const WHITE = new Color('#FFFFFF')
const whiteA = a => new Color('#FFFFFF', a)

// ── Links (W2: never String.replace on the host) ──
const ORIGIN = String(APP_URL).replace(/\/finance\/?$/, '')
const link = p => ORIGIN + p
const URLS = {
  home: link('/finance'),
  budgets: link('/finance/budgets'),
  transactions: link('/finance/transactions'),
  quickAdd: link('/finance/transactions?add=1'),
  west: link('/finance/investments?tab=Real%20Estate'),
  bills: link('/finance/subscriptions'),
  ask: link('/finance/ask'),
}
const coachLink = d => {
  const c = coachFor(d)
  return c && c.url && c.url.indexOf('/finance/') === 0 ? link(c.url) : URLS.ask
}

// ── Sizes (W15): widget points per screen, conservative fallbacks ──
const SIZE_TABLE = [
  // [min screen width, small, medium width, medium/small height, large height, lock rect width]
  [428, 170, 364, 170, 382, 172],
  [414, 169, 360, 169, 379, 170],
  [390, 158, 338, 158, 354, 160],
  [375, 155, 329, 155, 345, 157],
  [360, 155, 329, 155, 345, 157],
  [320, 141, 292, 141, 311, 150],
]
function widgetMetrics() {
  let row = null
  try {
    const s = Device.screenSize()
    const w = Math.min(s.width, s.height)
    const h = Math.max(s.width, s.height)
    row = SIZE_TABLE.find(r => w >= r[0]) || SIZE_TABLE[SIZE_TABLE.length - 1]
    if (w === 414 && h < 800) row = [414, 159, 348, 157, 357, 160] // Plus models
    if (w === 375 && h < 700) row = [375, 148, 321, 148, 324, 157] // SE / 8
  } catch (e) { /* Device.screenSize unavailable: fall back below */ }
  if (!row) row = [0, 155, 329, 155, 345, 157]
  return { small: row[1], mediumW: row[2], height: row[3], largeH: row[4], rect: row[5] }
}

// ── Formatting ──
const MINUS = '−'
function group(n) {
  return String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
function money(n) { return (n < 0 ? MINUS : '') + '$' + group(n) }
function moneyShort(n) {
  const a = Math.abs(n), s = n < 0 ? MINUS : ''
  if (a >= 999500) return s + '$' + (a / 1e6).toFixed(a >= 9995000 ? 0 : 1).replace(/\.0$/, '') + 'M'
  if (a >= 9950) return s + '$' + Math.round(a / 1000) + 'k'
  if (a >= 1000) return s + '$' + (a / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return s + '$' + Math.round(a)
}
function formatter(fmt) {
  const df = new DateFormatter()
  df.locale = LANG === 'es' ? 'es_MX' : 'en_US'
  df.dateFormat = fmt
  return df
}
const dateOf = key => new Date(String(key).slice(0, 10) + 'T12:00:00')
const timeLabel = iso => formatter('h:mm a').string(new Date(iso))
const dayStart = t => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
/** Cache stamp: time today, weekday + time this week, else the date — old numbers must not read as current. */
function stampTime(iso) {
  const t = new Date(iso)
  const days = Math.round((dayStart(new Date()) - dayStart(t)) / 86400000)
  if (days <= 0) return formatter('h:mm a').string(t)
  if (days <= 6) return formatter('EEE h:mm a').string(t)
  return formatter(LANG === 'es' ? 'd MMM' : 'MMM d').string(t)
}
// Period end, formatted on the device so lang=es never shows the server's English label.
const thruDate = v => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v.through_date || '')) ? dateOf(v.through_date) : null)
function thruLabel(v) {
  const d = thruDate(v)
  return d ? formatter(LANG === 'es' ? 'EEE d MMM' : 'EEE MMM d').string(d) : String(v.through_label || '')
}
function thruShort(v) {
  const d = thruDate(v)
  return d ? formatter('EEE').string(d) : String(v.through_label || '').split(' ')[0]
}

// ── Text + drawn primitives ──
const WEIGHTS = { regular: 'systemFont', medium: 'mediumSystemFont', semibold: 'semiboldSystemFont', bold: 'boldSystemFont', hero: 'boldRoundedSystemFont', num: 'semiboldRoundedSystemFont' }
function txt(stack, s, size, color, weight, opts) {
  const o = opts || {}
  const t = stack.addText(String(s))
  t.font = Font[WEIGHTS[weight || 'semibold']](size)
  t.textColor = color
  t.lineLimit = o.lines || 1
  // Never let iOS shrink text below 11pt.
  t.minimumScaleFactor = Math.min(1, Math.max(o.msf || 0.85, 11 / size))
  if (o.opacity != null) t.textOpacity = o.opacity
  return t
}
function canvas(w, h) {
  const ctx = new DrawContext()
  ctx.size = new Size(w * 3, h * 3)
  ctx.opaque = false
  ctx.respectScreenScale = false
  return ctx
}
function pill(ctx, x, y, w, h, color) {
  const p = new Path()
  p.addRoundedRect(new Rect(x, y, w, h), h / 2, h / 2)
  ctx.addPath(p)
  ctx.setFillColor(color)
  ctx.fillPath()
}
function barImage(w, h, pct, fill, track) {
  const ctx = canvas(w, h), W = w * 3, H = h * 3
  pill(ctx, 0, 0, W, H, track || TRACK)
  const f = Math.min(1, Math.max(0, pct))
  if (f > 0) pill(ctx, 0, 0, Math.max(H, W * f), H, fill)
  return ctx.getImage()
}
function addBar(stack, w, h, pct, fill, track) {
  const img = stack.addImage(barImage(w, h, pct, fill, track))
  img.imageSize = new Size(w, h)
  return img
}
function dotImage(size, fill) {
  const ctx = canvas(size, size), S = size * 3
  const p = new Path()
  p.addEllipse(new Rect(0, 0, S, S))
  ctx.addPath(p)
  ctx.setFillColor(fill)
  ctx.fillPath()
  return ctx.getImage()
}
function arc(ctx, cx, cy, r, a0, a1, color, lw) {
  const p = new Path()
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.04))
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n
    const pt = new Point(cx + r * Math.cos(a), cy + r * Math.sin(a))
    if (i) p.addLine(pt); else p.move(pt)
  }
  ctx.addPath(p)
  ctx.setStrokeColor(color)
  ctx.setLineWidth(lw)
  ctx.strokePath()
  // Round caps: Path has no line-cap setting, so cap the ends with dots.
  for (const a of [a0, a1]) {
    const cap = new Path()
    cap.addEllipse(new Rect(cx + r * Math.cos(a) - lw / 2, cy + r * Math.sin(a) - lw / 2, lw, lw))
    ctx.addPath(cap)
    ctx.setFillColor(color)
    ctx.fillPath()
  }
}
/** Ring with centred label (lock-screen circular, goals variant). */
function ringImage(size, pct, fill, track, lw, big, small, textColor) {
  const ctx = canvas(size, size), S = size * 3, L = lw * 3
  const r = (S - L) / 2, c = S / 2, start = -Math.PI / 2
  const f = Math.min(1, Math.max(0, pct))
  arc(ctx, c, c, r, 0, Math.PI * 2, track, L)
  if (f > 0.005) arc(ctx, c, c, r, start, start + Math.PI * 2 * Math.min(f, 0.999), fill, L)
  if (big) {
    ctx.setTextAlignedCenter()
    ctx.setTextColor(textColor || WHITE)
    const bigSize = Math.max(13, Math.round(size * (small ? 0.26 : 0.3) * Math.min(1, 3.4 / Math.max(3.4, big.length)))) * 3
    ctx.setFont(Font.boldRoundedSystemFont(bigSize))
    const top = small ? c - bigSize * 0.72 : c - bigSize * 0.62
    ctx.drawTextInRect(big, new Rect(0, top, S, bigSize * 1.3))
    if (small) {
      const ss = Math.max(11, Math.round(size * 0.13)) * 3
      ctx.setFont(Font.semiboldSystemFont(ss))
      ctx.drawTextInRect(small, new Rect(0, top + bigSize * 1.08, S, ss * 1.4))
    }
  }
  return ctx.getImage()
}
/** Cumulative everyday spend vs a straight budget-pace line, drawn over the whole month (O1).
 * Both lines start at 0 on the month's first morning; day i's running total sits at x(i). */
function sparkImage(w, h, daily, perDay, daysInMonth, color) {
  const ctx = canvas(w, h), W = w * 3, H = h * 3, pad = 5 * 3
  const cum = []
  ;(daily || []).reduce((s, v, i) => (cum[i] = s + (Number(v) || 0)), 0)
  const budgetEnd = Math.max(1, perDay * daysInMonth)
  const max = Math.max(cum[cum.length - 1] || 0, budgetEnd) * 1.04
  const span = Math.max(1, daysInMonth)
  const x = i => pad + (Math.min(i, span) / span) * (W - pad * 2)
  const y = v => H - pad - (v / max) * (H - pad * 2)
  // Budget line: dashed, from zero to the month's budget.
  const dash = 4 * 3, gap = 3.5 * 3
  const x0 = x(0), y0 = y(0), x1 = x(span), y1 = y(budgetEnd)
  const len = Math.hypot(x1 - x0, y1 - y0)
  for (let s = 0; s < len; s += dash + gap) {
    const e = Math.min(len, s + dash)
    const p = new Path()
    p.move(new Point(x0 + (x1 - x0) * s / len, y0 + (y1 - y0) * s / len))
    p.addLine(new Point(x0 + (x1 - x0) * e / len, y0 + (y1 - y0) * e / len))
    ctx.addPath(p)
    ctx.setStrokeColor(TRACK)
    ctx.setLineWidth(1.5 * 3)
    ctx.strokePath()
  }
  if (!cum.length) return ctx.getImage()
  const pts = [new Point(x0, y0)].concat(cum.map((v, i) => new Point(x(i + 1), y(v))))
  const last = pts[pts.length - 1]
  const area = new Path()
  pts.forEach((p, i) => (i ? area.addLine(p) : area.move(p)))
  area.addLine(new Point(last.x, y0))
  area.closeSubpath()
  ctx.addPath(area)
  ctx.setFillColor(new Color(color.hex || '#10B981', 0.14))
  ctx.fillPath()
  const line = new Path()
  pts.forEach((p, i) => (i ? line.addLine(p) : line.move(p)))
  ctx.addPath(line)
  ctx.setStrokeColor(color)
  ctx.setLineWidth(2.2 * 3)
  ctx.strokePath()
  const halo = new Path()
  halo.addEllipse(new Rect(last.x - 6 * 3, last.y - 6 * 3, 12 * 3, 12 * 3))
  ctx.addPath(halo)
  ctx.setFillColor(new Color(color.hex || '#10B981', 0.25))
  ctx.fillPath()
  const dot = new Path()
  dot.addEllipse(new Rect(last.x - 3.5 * 3, last.y - 3.5 * 3, 7 * 3, 7 * 3))
  ctx.addPath(dot)
  ctx.setFillColor(color)
  ctx.fillPath()
  return ctx.getImage()
}

// ── Data ──
function coachFor(d) {
  if (LANG === 'es' && d.coach_es) return d.coach_es
  return d.coach || null
}
function statusOf(d) {
  if (d.status === 'over' || d.status === 'tight' || d.status === 'ok') return d.status
  const v = d.variable
  return v.left < 0 ? 'over' : v.left < v.budget * 0.1 ? 'tight' : 'ok'
}
const STATUS = {
  ok: () => ({ word: STR.onPlan, color: C.good, chip: C.chip.good, fill: FILL.good }),
  tight: () => ({ word: STR.tight, color: C.warn, chip: C.chip.warn, fill: FILL.warn }),
  over: () => ({ word: STR.overPlan, color: C.bad, chip: C.chip.bad, fill: FILL.bad }),
}
/** Cached numbers from an earlier month: never label them as this month's room. */
function fromLastMonth(d) {
  return !!d.__stale && !!d.month && d.month !== formatter('yyyy-MM').string(new Date())
}
function heroLabel(d) {
  if (fromLastMonth(d)) return STR.lastMonth
  return d.variable.left < 0 ? STR.over : STR.left
}
const westFill = wm => wm.pct >= 100 ? FILL.good : FILL.warn
const westColor = wm => wm.pct >= 100 ? C.good : C.warn

/** v1 payloads (no `v`) still render: derive the hero from the budget rows. */
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.v >= 2 && raw.variable) return raw
  if (!Number.isFinite(raw.safe_to_spend_day)) return null
  const rows = raw.budget_pace || []
  const budget = rows.reduce((s, b) => s + (b.budget || 0), 0)
  const spent = rows.reduce((s, b) => s + (b.spent || 0), 0)
  const dim = raw.days_in_month || 30, day = raw.day || 1
  const endKey = String(raw.month || '2000-01') + '-' + String(dim).padStart(2, '0')
  const end = dateOf(endKey)
  return Object.assign({}, raw, {
    v: 1,
    variable: { budget, spent, left: budget - spent, days_left: dim - day + 1, through_label: formatter('EEE MMM d').string(end), through_date: endKey },
    daily_spend: [], daily_budget_pace: budget / dim, upcoming: [], milestones: {},
    coach: null, brief: { fresh: false, generated_at: null, title: null },
  })
}

async function loadData() {
  const fm = FileManager.local()
  const path = fm.joinPath(fm.libraryDirectory(), CACHE_FILE)
  const readCache = () => {
    try {
      if (!fm.fileExists(path)) return null
      const d = normalize(JSON.parse(fm.readString(path)))
      if (d) d.__stale = true
      return d
    } catch (e) { return null }
  }
  let status = 0
  try {
    const r = new Request(API_URL)
    r.headers = typeof WIDGET_TOKEN !== 'undefined' && WIDGET_TOKEN
      ? { 'x-widget-token': WIDGET_TOKEN }
      : { 'x-api-key': typeof API_KEY !== 'undefined' ? API_KEY : '' }
    r.timeoutInterval = DATA_TIMEOUT_S
    const text = await r.loadString()
    status = r.response ? r.response.statusCode : 0
    if (status === 401 || status === 403) return { error: 'auth', cache: readCache() }
    if (status < 200 || status >= 300) throw new Error('HTTP ' + status)
    const d = normalize(JSON.parse(text))
    if (!d) throw new Error('bad payload')
    try { fm.writeString(path, text) } catch (e) { /* cache is best-effort */ }
    return { data: d }
  } catch (e) {
    const cache = readCache()
    return cache ? { data: cache } : { error: 'offline' }
  }
}

// ── Shared blocks ──
function heroBlock(stack, d, size) {
  const v = d.variable, over = v.left < 0
  txt(stack, heroLabel(d), 12, fromLastMonth(d) ? C.warn : C.sub, 'semibold')
  const hero = txt(stack, money(Math.abs(v.left)), size, over ? C.bad : C.text, 'hero', { msf: 0.55, opacity: d.__stale ? 0.6 : 1 })
  return hero
}
function westBlock(stack, d, width) {
  const wm = d.west_month
  if (!wm) return
  const row = stack.addStack()
  row.centerAlignContent()
  txt(row, (wm.label ? STR.west + ' · ' + wm.label : STR.savings), 12, C.text, 'semibold')
  row.addSpacer(6)
  txt(row, wm.pct + '%', 12, westColor(wm), 'bold')
  row.addSpacer()
  txt(row, moneyShort(wm.projected_savings) + ' ' + STR.of + ' ' + moneyShort(wm.target), 12, C.sub, 'medium')
  stack.addSpacer(5)
  addBar(stack, width, 6, wm.pct / 100, westFill(wm))
}
function chip(stack, st) {
  const c = stack.addStack()
  c.cornerRadius = 9
  c.setPadding(3, 8, 3, 8)
  c.backgroundColor = st.chip
  c.centerAlignContent()
  const dot = c.addImage(dotImage(6, st.fill))
  dot.imageSize = new Size(6, 6)
  c.addSpacer(5)
  txt(c, st.word, 11, st.color, 'bold')
}
function paceCaption(d, narrow) {
  if (d.top_over && d.top_over.pct > 100) {
    const t = d.top_over
    return { text: narrow ? t.name + ' ' + t.pct + '%' : STR.ofBudget(t.name, t.pct), color: C.warn }
  }
  const cum = (d.daily_spend || []).reduce((s, v) => s + v, 0)
  const expected = (d.daily_budget_pace || 0) * (d.daily_spend || []).length
  if (!expected || (d.daily_spend || []).length < 3) return { text: STR.spendPace, color: C.faint }
  const diff = cum - expected
  if (Math.abs(diff) < expected * 0.03) return { text: STR.spendPace, color: C.faint }
  return diff < 0 ? { text: STR.underPace(moneyShort(-diff)), color: C.good } : { text: STR.overPace(moneyShort(diff)), color: C.warn }
}
function stampText(d) {
  return d.__stale ? '⚠︎ ' + STR.asOf(stampTime(d.updated_at)) : STR.updated(timeLabel(d.updated_at))
}
function headerLine(d) {
  if (d.__stale) return { text: stampText(d), color: C.warn }
  const date = formatter(LANG === 'es' ? 'EEE d MMM' : 'EEE MMM d').string(new Date())
  return { text: date + ' · ' + STR.daysLeft(d.variable.days_left), color: C.sub }
}

// ── Small (spec §2) ──
function small(w, d, m) {
  const cw = m.small - 28
  const st = STATUS[statusOf(d)]()
  w.url = statusOf(d) === 'over' ? URLS.budgets : URLS.home
  if (hasParam('goals')) return smallGoals(w, d)
  const top = w.addStack()
  top.centerAlignContent()
  txt(top, heroLabel(d), 12, fromLastMonth(d) ? C.warn : C.sub, 'semibold')
  top.addSpacer()
  if (!fromLastMonth(d)) {
    const dot = top.addImage(dotImage(8, st.fill))
    dot.imageSize = new Size(8, 8)
  }
  w.addSpacer(1)
  const v = d.variable, over = v.left < 0
  txt(w, money(Math.abs(v.left)), 30, over ? C.bad : C.text, 'hero', { msf: 0.55, opacity: d.__stale ? 0.6 : 1 })
  const perDay = v.left > 0 && v.days_left > 0 ? STR.perDay(moneyShort(v.left / v.days_left)) + ' · ' : ''
  if (d.__stale) txt(w, stampText(d), 11, C.warn, 'medium')
  else txt(w, perDay + STR.thru + ' ' + (perDay ? thruShort(v) : thruLabel(v)), 11, C.faint, 'medium')
  w.addSpacer()
  if ((d.daily_spend || []).length) {
    const sh = m.small >= 150 ? 26 : 20
    const img = w.addImage(sparkImage(cw, sh, d.daily_spend, d.daily_budget_pace, d.days_in_month, over ? FILL.bad : FILL.good))
    img.imageSize = new Size(cw, sh)
    w.addSpacer()
  }
  const wm = d.west_month
  if (wm) {
    const r = w.addStack()
    r.centerAlignContent()
    txt(r, (wm.label ? STR.west + ' · ' + wm.label : STR.savings), 11, C.sub, 'semibold')
    r.addSpacer()
    txt(r, wm.pct + '%', 11, westColor(wm), 'bold')
    w.addSpacer(4)
    addBar(w, cw, 6, wm.pct / 100, westFill(wm))
  }
}
function smallGoals(w, d) {
  const ms = d.milestones || {}
  w.url = URLS.west
  txt(w, STR.milestones, 12, C.sub, 'semibold')
  w.addSpacer()
  const row = w.addStack()
  row.centerAlignContent()
  const pct = Number(ms.west_funded_pct) || 0
  const ring = row.addImage(ringImage(58, pct / 100, FILL.accent, TRACK, 6, Math.round(pct) + '%', null, new Color('#3B82F6')))
  ring.imageSize = new Size(58, 58)
  row.addSpacer(8)
  const col = row.addStack()
  col.layoutVertically()
  txt(col, STR.west, 13, C.text, 'bold')
  txt(col, STR.funded, 11, C.faint, 'medium')
  w.addSpacer()
  if (ms.baby_months != null) txt(w, '👶 ' + STR.baby(ms.baby_months), 12, C.text, 'semibold')
  if (ms.west_months_to_delivery != null) txt(w, '🏠 ' + STR.moToKeys(ms.west_months_to_delivery), 11, C.sub, 'medium')
}

// ── Medium (spec §3) ──
function medium(w, d, m, inLarge) {
  const cw = m.mediumW - 30
  w.url = URLS.home
  const st = STATUS[statusOf(d)]()
  const head = w.addStack()
  head.centerAlignContent()
  const hl = headerLine(d)
  txt(head, hl.text, 12, hl.color, 'semibold')
  head.addSpacer()
  if (!fromLastMonth(d)) chip(head, st)
  w.addSpacer(m.height < 160 ? 4 : 7)

  const body = w.addStack()
  body.centerAlignContent()
  const left = body.addStack()
  left.layoutVertically()
  left.url = URLS.budgets
  heroBlock(left, d, m.height < 160 ? 28 : 32)
  txt(left, STR.everyday + ' · ' + STR.thru + ' ' + thruLabel(d.variable), 11, C.faint, 'medium')
  body.addSpacer(10)
  const right = body.addStack()
  right.layoutVertically()
  const sw = Math.round(cw * 0.4)
  if (hasParam('coach')) {
    right.url = coachLink(d)
    right.size = new Size(sw, 0)
    const c = coachFor(d)
    const line = d.brief && d.brief.fresh && d.brief.title ? d.brief.title : (c ? c.title : STR.spendPace)
    txt(right, line, 13, C.accent, 'semibold', { lines: 3, msf: 0.85 })
  } else if ((d.daily_spend || []).length) {
    right.url = URLS.transactions
    const over = d.variable.left < 0
    const img = right.addImage(sparkImage(sw, 44, d.daily_spend, d.daily_budget_pace, d.days_in_month, over ? FILL.bad : FILL.good))
    img.imageSize = new Size(sw, 44)
    right.addSpacer(2)
    const cap = paceCaption(d, sw < 125)
    const capRow = right.addStack()
    capRow.addSpacer()
    txt(capRow, cap.text, 11, cap.color, 'semibold', { msf: 0.8 })
  }
  if (inLarge) w.addSpacer(m.largeH < 370 ? 8 : 12)
  else w.addSpacer()
  const west = w.addStack()
  west.layoutVertically()
  west.url = URLS.west
  westBlock(west, d, cw)
}

// ── Large (spec §4) ──
function large(w, d, m) {
  const cw = m.mediumW - 30
  const compact = m.largeH < 370
  medium(w, d, m, true)
  w.addSpacer(compact ? 10 : 14)

  const cats = w.addStack()
  cats.layoutVertically()
  cats.url = URLS.budgets
  txt(cats, STR.budgets, 13, C.text, 'bold')
  cats.addSpacer(compact ? 4 : 6)
  const rows = (d.budget_pace || []).slice(0, compact ? 3 : 4)
  rows.forEach((b, i) => {
    const r = cats.addStack()
    r.centerAlignContent()
    txt(r, b.name, 12, C.text, 'medium')
    r.addSpacer()
    const over = b.spent > b.budget
    txt(r, over ? STR.overBy(moneyShort(b.spent - b.budget)) : STR.leftOf(moneyShort(b.budget - b.spent)), 12, over ? C.bad : C.sub, 'semibold')
    cats.addSpacer(3)
    const fill = b.pct > 100 ? FILL.bad : b.pct >= 85 ? FILL.warn : FILL.good
    addBar(cats, cw, 5, b.budget > 0 ? b.spent / b.budget : 0, fill)
    if (i < rows.length - 1) cats.addSpacer(compact ? 5 : 6)
  })

  w.addSpacer(compact ? 8 : 12)
  const bills = w.addStack()
  bills.layoutVertically()
  bills.url = URLS.bills
  txt(bills, STR.comingUp, 13, C.text, 'bold')
  bills.addSpacer(4)
  const up = (d.upcoming || []).slice(0, 2)
  if (!up.length) txt(bills, STR.nothingDue, 12, C.faint, 'medium')
  up.forEach((u, i) => {
    const r = bills.addStack()
    r.centerAlignContent()
    const dateCol = r.addStack()
    dateCol.size = new Size(48, 0)
    txt(dateCol, formatter(LANG === 'es' ? 'd MMM' : 'MMM d').string(dateOf(u.date)), 12, C.faint, 'semibold')
    txt(r, u.label, 12, C.text, 'medium', { msf: 0.8 })
    if (u.count > 1) {
      r.addSpacer(4)
      txt(r, STR.more(u.count - 1), 11, C.faint, 'medium')
    }
    r.addSpacer()
    txt(r, moneyShort(u.amount), 12, C.text, 'bold')
    if (i < up.length - 1) bills.addSpacer(3)
  })

  w.addSpacer(compact ? 4 : 6)
  w.addSpacer()
  const foot = w.addStack()
  foot.centerAlignContent()
  const c = coachFor(d)
  // Last month's advice is no advice; a stale header already carries the stamp.
  const coach = fromLastMonth(d) ? null : d.brief && d.brief.fresh && d.brief.title ? d.brief.title : (c ? c.title : null)
  if (coach) {
    const cs = foot.addStack()
    cs.url = coachLink(d)
    txt(cs, '🐾 ' + coach, 12, C.accent, 'semibold', { msf: 0.75 })
  }
  foot.addSpacer()
  if (!d.__stale) {
    foot.addSpacer(8)
    txt(foot, timeLabel(d.updated_at), 11, C.faint, 'medium')
  }
}

// ── Lock screen (spec §5): white only, no backgrounds ──
function lockRect(w, d, m) {
  const v = d.variable, over = v.left < 0
  const cw = m.rect - 4
  w.url = hasParam('quickadd') ? URLS.quickAdd : (over ? URLS.budgets : URLS.home)
  const top = w.addStack()
  top.bottomAlignContent()
  txt(top, moneyShort(Math.abs(v.left)), 17, WHITE, 'hero', { msf: 0.7 })
  top.addSpacer(4)
  txt(top, over ? STR.overShort : STR.leftShort, 12, whiteA(0.8), 'semibold')
  top.addSpacer()
  txt(top, d.__stale ? '⚠︎ ' + stampTime(d.updated_at) : STR.thru + ' ' + thruShort(v), 11, whiteA(0.7), 'medium')
  const wm = d.west_month
  if (wm) {
    w.addSpacer(5)
    addBar(w, cw, 5, wm.pct / 100, WHITE, whiteA(0.25))
    w.addSpacer(4)
    txt(w, STR.west + ' ' + wm.pct + '% · ' + (wm.gap > 0 ? STR.toGo(moneyShort(wm.gap)) : STR.onTarget), 11, whiteA(0.85), 'semibold')
  }
}
function lockCirc(w, d) {
  w.addAccessoryWidgetBackground = true
  w.url = hasParam('quickadd') ? URLS.quickAdd : URLS.home
  let img
  if (hasParam('spend')) {
    const v = d.variable
    const pct = v.budget > 0 ? v.spent / v.budget : 0
    img = ringImage(58, pct, WHITE, whiteA(0.25), 5, moneyShort(Math.abs(v.left)).replace(MINUS, ''), v.left < 0 ? STR.overShort : STR.leftShort)
  } else {
    const wm = d.west_month
    img = ringImage(58, wm ? wm.pct / 100 : 0, WHITE, whiteA(0.25), 5, wm ? wm.pct + '%' : '–', STR.west)
  }
  const s = w.addImage(img)
  s.imageSize = new Size(58, 58)
  s.centerAlignImage()
}
function lockInline(w, d) {
  const v = d.variable, wm = d.west_month
  const lead = (v.left < 0 ? STR.over : STR.left).split(' ')[0]
  const text = lead + ' ' + moneyShort(Math.abs(v.left)) + (wm ? ' · ' + STR.west + ' ' + wm.pct + '%' : '')
  txt(w, text, 13, WHITE, 'semibold')
}

function messageWidget(w, family, title, body, url) {
  w.url = url || URLS.home
  if (family === 'accessoryInline') return txt(w, title + ' · ' + body, 13, WHITE, 'semibold')
  if (family === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true
    return txt(w, title, 12, WHITE, 'bold', { lines: 2, msf: 0.8 })
  }
  const accessory = family.indexOf('accessory') === 0
  txt(w, accessory ? title : '\uD83D\uDC3E ' + title, 13, accessory ? WHITE : C.text, 'bold')
  w.addSpacer(4)
  txt(w, body, 12, accessory ? whiteA(0.8) : C.sub, 'medium', { lines: accessory ? 2 : 3, msf: 0.85 })
  if (!accessory) {
    w.addSpacer(8)
    txt(w, STR.open, 12, C.accent, 'semibold')
  }
}

function refreshDate() {
  const now = new Date()
  const soon = new Date(now.getTime() + 30 * 60 * 1000)
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0)
  return soon < midnight ? soon : midnight
}

// Entry point (named for v1 loaders: smartScreen).
async function smartScreen() {
  const family = (typeof config !== 'undefined' && config.widgetFamily) || 'medium'
  const accessory = family.indexOf('accessory') === 0
  const m = widgetMetrics()
  const w = new ListWidget()
  if (!accessory) {
    w.backgroundColor = C.bg
    w.setPadding(14, 15, 14, 15)
  } else {
    w.setPadding(0, 0, 0, 0)
  }
  w.refreshAfterDate = refreshDate()

  const res = await loadData()
  if (res.error === 'auth') {
    messageWidget(w, family, STR.noCacheTitle, STR.reinstall, URLS.home)
  } else if (!res.data) {
    messageWidget(w, family, accessory ? STR.offline : STR.noCacheTitle, STR.noCache, URLS.home)
  } else {
    const d = res.data
    if (family === 'small') small(w, d, m)
    else if (family === 'large' || family === 'extraLarge') large(w, d, m)
    else if (family === 'accessoryRectangular') lockRect(w, d, m)
    else if (family === 'accessoryCircular') lockCirc(w, d)
    else if (family === 'accessoryInline') lockInline(w, d)
    else medium(w, d, m)
  }
  return w
}

const widget = await smartScreen()
if (config.runsInWidget) {
  Script.setWidget(widget)
} else if (hasParam('large')) {
  await widget.presentLarge()
} else if (hasParam('small')) {
  await widget.presentSmall()
} else {
  await widget.presentMedium()
}
Script.complete()
