/* global Color, Font, Point, Size, Rect, Path, DrawContext, ListWidget, Request, DateFormatter, FileManager, Device, config, args, Script, API_URL, API_KEY, APP_URL, WIDGET_TOKEN */
// Mona phone widget v3, a daily coach (Scriptable). Served raw by
// /api/finance/widget-code and run by the Finance.js loader inside an async
// function, with API_URL, APP_URL and WIDGET_TOKEN (or the legacy API_KEY) in scope.
// v1 loaders only accept code containing the word smartScreen; keep it here.
//
// Rules: goal first, day by day. Every family leads with one number: what
// today can still take while the month's goal (WEST) stays on target
// (payload.today, defined in src/lib/widget/today.ts). A blown everyday budget
// is a calm nudge when the goal is safe; a goal at risk gets today's recovery
// step ("No-spend day"), never a lone red number. Good days are celebrated
// (streak, yesterday). Status = colour + word, text >= 11pt, light/dark via
// Color.dynamic, lock-screen families white only, links stay inside /finance.

/**
 * @typedef {Object} TodayPlan  payload.today; derived on the device for older payloads
 * @property {string} [date]               YYYY-MM-DD, Mexico City
 * @property {'goal'|'budget'} basis       goal = WEST-safe room; budget = everyday budgets (fallback)
 * @property {'ok'|'tight'|'over'|'risk'} state
 * @property {number} allowance            today's room, fixed from the morning's numbers
 * @property {number} spent                discretionary spend dated today
 * @property {number} left                 allowance - spent (signed)
 * @property {number} days_left            days left in the month, today included
 * @property {number|null} tomorrow        tomorrow's even split after today's spend
 * @property {{label:string, month?:string, pct:number, target:number, projected:number, buffer:number, no_spend_pct?:number}|null} goal
 * @property {number|null} streak
 * @property {{spent:number, room:number, diff:number}|null} yesterday
 * @property {Array<{date:string, spent:number, room:number, ok:boolean|null, today?:boolean}>} week
 * @property {{kind:string, category?:string, label?:string, count?:number, amount?:number, left?:number, days?:number, url:string}|null} nudge
 * @property {Array<{kind:string, pct:number, month?:string, buffer?:number, year?:number, covered_pct?:number|null, on_track?:boolean, months?:number|null, url?:string}>} goals
 */
/**
 * @typedef {Object} WidgetData
 * @property {number} v
 * @property {string} updated_at
 * @property {number} day
 * @property {number} days_in_month
 * @property {string} month
 * @property {{budget:number, spent:number, left:number, days_left:number, through_label:string, through_date?:string}} variable
 * @property {number[]} daily_spend
 * @property {{name:string, pct:number, over_by:number}|null} [top_over]
 * @property {{label:string, month?:string, target:number, projected_savings:number, gap:number, pct:number}|null} west_month
 * @property {Array<{date:string, label:string, amount:number, count:number}>} [upcoming]
 * @property {{baby_months:number|null, west_funded_pct:number|null, west_months_to_delivery:number|null}} milestones
 * @property {TodayPlan|null} [today]
 * @property {boolean} [__stale]
 */

const DATA_TIMEOUT_S = 10
const CACHE_FILE = 'mona-widget-data.json'

// ── Parameters: "goals", "quickadd", "lang=es" (any order) ──
const PARAMS = String((typeof args !== 'undefined' && args.widgetParameter) || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)
const hasParam = p => PARAMS.indexOf(p) !== -1
const LANG = hasParam('lang=es') || hasParam('es') ? 'es' : 'en'
const DINING = /dining|restaurant|comida|eating|cena/i

const STR = {
  en: {
    today: 'Today', canSpend: 'You can spend today', leftToday: 'Left today', overToday: 'Past today’s room',
    tomorrowUpTo: 'Tomorrow, up to', upTo: day => day + ': up to', lastMonth: 'Last month',
    leftShort: 'left today', overShort: 'over today', todayShort: 'today', overWord: 'over',
    ofSpent: (s, a) => s + ' of ' + a + ' spent', overBy: v => v + ' over today',
    keeps: g => g + ' stays on target', stillSafe: g => g + ' is still on target', atPct: (g, p) => g + ' at ' + p + '%',
    keepsBudget: 'within everyday budgets', budgetUsed: 'everyday budgets used up',
    noSpend: 'No-spend day', noSpendKeeps: (g, p) => 'keeps ' + g + ' at ' + p + '%',
    streak: n => n + '-day streak', onTrack: 'On track', tight: 'Tight', overChip: 'Over today', saveDay: 'Save day',
    daysLeft: n => n === 1 ? 'last day' : n + ' days left',
    ahead: v => v + ' ahead', short: v => v + ' short', of: 'of',
    yesterdayUnder: v => '✓ Yesterday ' + v + ' under', yesterdayOver: v => 'Yesterday ' + v + ' over',
    thisWeek: 'This week', onPlanOf: (a, b) => a + ' of ' + b + ' on plan', comingUp: 'Coming up', tomorrowDay: 'Tomorrow', todayDay: 'Today',
    more: n => ' +' + n,
    west: 'WEST', westHome: 'WEST home', yearGoals: y => y + ' goals', emergency: 'Emergency fund',
    moToKeys: n => n + ' mo to keys', moCovered: n => n + ' mo covered', coveredBy: p => p + '% covered by Dec', onTrackDec: 'on track for Dec', funded: 'funded',
    baby: n => n + ' mo to baby',
    nudge: {
      due: (l, a, days) => l + (days <= 0 ? ' is due today' : ' is due tomorrow') + ' · ' + a + '. Keep it in the account.',
      skip: c => c + ' is past its budget. Keep it at $0 today.',
      easyDining: (c, v, n) => c + ' has ' + v + ' for ' + n + ' days. Cook at home tonight.',
      easy: (c, v, n) => c + ' has ' + v + ' for ' + n + ' days. Go easy today.',
      fitsDining: (c, v) => c + ' has ' + v + ' left. Dinner out tonight fits.',
      fits: (c, v) => c + ' has ' + v + ' left. There’s room for it today.',
      ahead: v => 'WEST is ' + v + ' ahead this month. Keep it going.',
      short: v => 'WEST is ' + v + ' short this month. Skip extras today.',
    },
    asOf: t => 'As of ' + t, noCacheTitle: 'Mona', noCache: 'Connect once to load your numbers',
    reinstall: 'Re-install the widget from Family › Phone widget', offline: 'Offline', open: 'Open Mona ›',
    letters: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  },
  es: {
    today: 'Hoy', canSpend: 'Hoy puedes gastar', leftToday: 'Te queda hoy', overToday: 'Arriba de lo de hoy',
    tomorrowUpTo: 'Mañana, hasta', upTo: day => day + ': hasta', lastMonth: 'Mes pasado',
    leftShort: 'quedan hoy', overShort: 'arriba hoy', todayShort: 'hoy', overWord: 'arriba',
    ofSpent: (s, a) => s + ' de ' + a + ' gastado', overBy: v => v + ' arriba hoy',
    keeps: g => g + ' sigue en meta', stillSafe: g => g + ' sigue en meta', atPct: (g, p) => g + ' en ' + p + '%',
    keepsBudget: 'dentro del presupuesto', budgetUsed: 'presupuesto diario agotado',
    noSpend: 'Día sin gastos', noSpendKeeps: (g, p) => 'deja ' + g + ' en ' + p + '%',
    streak: n => n + ' días en plan', onTrack: 'En plan', tight: 'Justo', overChip: 'Pasado hoy', saveDay: 'Día de ahorro',
    daysLeft: n => n === 1 ? 'último día' : 'quedan ' + n + ' días',
    ahead: v => v + ' arriba', short: v => 'faltan ' + v, of: 'de',
    yesterdayUnder: v => '✓ Ayer ' + v + ' abajo', yesterdayOver: v => 'Ayer ' + v + ' arriba',
    thisWeek: 'Esta semana', onPlanOf: (a, b) => a + ' de ' + b + ' en plan', comingUp: 'Próximos cargos', tomorrowDay: 'Mañana', todayDay: 'Hoy',
    more: n => ' +' + n,
    west: 'WEST', westHome: 'Depa WEST', yearGoals: y => 'Metas ' + y, emergency: 'Fondo de emergencia',
    moToKeys: n => 'entrega en ' + n + ' meses', moCovered: n => n + ' meses cubiertos', coveredBy: p => p + '% cubierto a dic', onTrackDec: 'en camino a dic', funded: 'cubierto',
    baby: n => n + ' meses para el bebé',
    nudge: {
      due: (l, a, days) => l + (days <= 0 ? ' vence hoy' : ' vence mañana') + ' · ' + a + '. Déjalo en la cuenta.',
      skip: c => c + ' ya pasó su presupuesto. Hoy déjalo en $0.',
      easyDining: (c, v, n) => c + ' tiene ' + v + ' para ' + n + ' días. Hoy cocinen en casa.',
      easy: (c, v, n) => c + ' tiene ' + v + ' para ' + n + ' días. Hoy con calma.',
      fitsDining: (c, v) => c + ' tiene ' + v + '. Una cena fuera hoy cabe.',
      fits: (c, v) => c + ' tiene ' + v + '. Hoy hay espacio.',
      ahead: v => 'WEST va ' + v + ' arriba este mes. Sigan así.',
      short: v => 'A WEST le faltan ' + v + ' este mes. Hoy sin extras.',
    },
    asOf: t => 'Al ' + t, noCacheTitle: 'Mona', noCache: 'Conéctate una vez para cargar tus números',
    reinstall: 'Reinstala el widget desde Family › Phone widget', offline: 'Sin conexión', open: 'Abrir Mona ›',
    // Unambiguous initials: X for miércoles.
    letters: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
  },
}[LANG]

// ── Colour tokens ──
const dyn = (l, d, la, da) => Color.dynamic(new Color(l, la == null ? 1 : la), new Color(d, da == null ? 1 : da))
const C = {
  bg: dyn('#FFFFFF', '#16181D'),
  text: dyn('#0F172A', '#F3F4F6'),
  sub: dyn('#475569', '#A3AAB5'),
  faint: dyn('#64748B', '#8A929E'),
  good: dyn('#047857', '#34D399'),
  warn: dyn('#B45309', '#FBBF24'),
  accent: dyn('#1D4ED8', '#7AB0FF'),
  card: dyn('#F1F5F9', '#20232A'),
  chip: {
    good: dyn('#047857', '#34D399', 0.10, 0.16),
    warn: dyn('#B45309', '#FBBF24', 0.10, 0.16),
  },
}
// DrawContext images can't follow the appearance: mid-tones that read on both.
const FILL = { good: new Color('#10B981'), warn: new Color('#F59E0B'), accent: new Color('#3B82F6') }
const TRACK = new Color('#8E8E93', 0.24)
const MISS = new Color('#8E8E93', 0.45)
const TICK = new Color('#8E8E93', 0.9)
const WHITE = new Color('#FFFFFF')
const whiteA = a => new Color('#FFFFFF', a)

// ── Links (never String.replace on the host) ──
const ORIGIN = String(APP_URL).replace(/\/finance\/?$/, '')
const link = p => ORIGIN + p
const URLS = {
  home: link('/finance'),
  budgets: link('/finance/budgets'),
  transactions: link('/finance/transactions'),
  quickAdd: link('/finance/transactions?add=1'),
  west: link('/finance/investments?tab=Real%20Estate'),
  goals: link('/finance/goals'),
  bills: link('/finance/subscriptions'),
}
/** Only in-app paths from the payload; anything else falls back. */
const appLink = (p, fallback) => (typeof p === 'string' && /^\/finance(\/|\?|$)/.test(p) ? link(p) : fallback)

// ── Sizes: widget points per screen, conservative fallbacks ──
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
/** Full pesos while they fit (home and lock screen agree); short only for big sums. */
const moneyFit = n => (Math.abs(n) < 100000 ? money(n) : moneyShort(n))
function formatter(fmt) {
  const df = new DateFormatter()
  df.locale = LANG === 'es' ? 'es_MX' : 'en_US'
  df.dateFormat = fmt
  return df
}
const dateOf = key => new Date(String(key).slice(0, 10) + 'T12:00:00')
const dayStart = t => new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
const todayKey = () => formatter('yyyy-MM-dd').string(new Date())
const daysUntil = key => Math.round((dayStart(dateOf(key)) - dayStart(new Date())) / 86400000)
/** Cache stamp: time today, weekday + time this week, else the date — old numbers must not read as current. */
function stampTime(iso) {
  const t = new Date(iso)
  const days = Math.round((dayStart(new Date()) - dayStart(t)) / 86400000)
  if (days <= 0) return formatter('h:mm a').string(t)
  if (days <= 6) return formatter('EEE h:mm a').string(t)
  return formatter(LANG === 'es' ? 'd MMM' : 'MMM d').string(t)
}
const monthLabel = m => (/^\d{4}-\d{2}$/.test(String(m || '')) ? formatter('MMM').string(dateOf(m + '-15')) : '')
const dayLetter = key => STR.letters[dateOf(key).getDay()]
const weekday = key => formatter('EEE').string(dateOf(key))
const pct = n => Math.round(Number(n) || 0) + '%'

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
function barImage(w, h, frac, fill, track) {
  const ctx = canvas(w, h), W = w * 3, H = h * 3
  pill(ctx, 0, 0, W, H, track || TRACK)
  const f = Math.min(1, Math.max(0, frac))
  if (f > 0) pill(ctx, 0, 0, Math.max(H, W * f), H, fill)
  return ctx.getImage()
}
function addBar(stack, w, h, frac, fill, track) {
  const img = stack.addImage(barImage(w, h, frac, fill, track))
  img.imageSize = new Size(w, h)
  return img
}
/**
 * The goal runway: this month's progress toward its target, with a tick where
 * the target sits. Past 100% the scale stretches so the overshoot shows beyond
 * the tick instead of a clipped full bar.
 */
function runwayImage(w, h, frac, fill, track, tick) {
  const over = 3 // tick overhang, points
  const ctx = canvas(w, h + over * 2), W = w * 3, H = h * 3, O = over * 3
  const scale = frac > 1 ? Math.min(1.5, frac + 0.1) : 1.1
  pill(ctx, 0, O, W, H, track || TRACK)
  const f = Math.max(0, Math.min(frac, scale)) / scale
  if (f > 0) pill(ctx, 0, O, Math.max(H, W * f), H, fill)
  const tx = Math.round(W / scale)
  ctx.setFillColor(tick || TICK)
  const p = new Path()
  p.addRoundedRect(new Rect(tx - 3, 0, 6, H + O * 2), 3, 3)
  ctx.addPath(p)
  ctx.fillPath()
  return ctx.getImage()
}
function addRunway(stack, w, h, frac, fill, track, tick) {
  const img = stack.addImage(runwayImage(w, h, frac, fill, track, tick))
  img.imageSize = new Size(w, h + 6)
  return img
}
function dotImage(size, fill, ring) {
  const ctx = canvas(size, size), S = size * 3
  const p = new Path()
  if (ring) {
    const lw = 2 * 3
    p.addEllipse(new Rect(lw / 2, lw / 2, S - lw, S - lw))
    ctx.addPath(p)
    ctx.setStrokeColor(fill)
    ctx.setLineWidth(lw)
    ctx.strokePath()
  } else {
    p.addEllipse(new Rect(0, 0, S, S))
    ctx.addPath(p)
    ctx.setFillColor(fill)
    ctx.fillPath()
  }
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
  // Round caps: Path has no line-cap setting, so cap the ends with dots
  // (a full circle has no ends: a cap there shows as a bright dot).
  if (Math.abs(a1 - a0) >= Math.PI * 2 - 0.01) return
  for (const a of [a0, a1]) {
    const cap = new Path()
    cap.addEllipse(new Rect(cx + r * Math.cos(a) - lw / 2, cy + r * Math.sin(a) - lw / 2, lw, lw))
    ctx.addPath(cap)
    ctx.setFillColor(color)
    ctx.fillPath()
  }
}
/** Ring with a centred label (lock-screen circular). */
function ringImage(size, frac, fill, track, lw, big, small) {
  const ctx = canvas(size, size), S = size * 3, L = lw * 3
  const r = (S - L) / 2, c = S / 2, start = -Math.PI / 2
  const f = Math.min(1, Math.max(0, frac))
  arc(ctx, c, c, r, 0, Math.PI * 2, track, L)
  if (f > 0.005) arc(ctx, c, c, r, start, start + Math.PI * 2 * Math.min(f, 0.999), fill, L)
  ctx.setTextAlignedCenter()
  ctx.setTextColor(WHITE)
  const bigSize = Math.max(13, Math.round(size * 0.25 * Math.min(1, 3.6 / Math.max(3.6, big.length)))) * 3
  ctx.setFont(Font.boldRoundedSystemFont(bigSize))
  const top = c - bigSize * 0.72
  ctx.drawTextInRect(big, new Rect(0, top, S, bigSize * 1.3))
  const ss = 11 * 3
  ctx.setFont(Font.semiboldSystemFont(ss))
  ctx.drawTextInRect(small, new Rect(0, top + bigSize * 1.08, S, ss * 1.4))
  return ctx.getImage()
}

// ── Data ──
/** Cached numbers from an earlier month: never label them as this month's room. */
function fromLastMonth(d) {
  return !!d.__stale && !!d.month && d.month !== formatter('yyyy-MM').string(new Date())
}
/** The date the plan was made for (payload.today.date, else the payload's own day). */
function planDate(d) {
  if (d.today && d.today.date) return d.today.date
  return String(d.month || '') + '-' + String(d.day || 1).padStart(2, '0')
}
/** A cached plan from another day is not today's room. */
function planIsOld(d) {
  return !!d.__stale && planDate(d) !== todayKey()
}

/** v1 payloads (no `v`) still render: derive the everyday budget from the rows. */
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (raw.v >= 2 && raw.variable) return raw
  if (!Number.isFinite(raw.safe_to_spend_day)) return null
  const rows = raw.budget_pace || []
  const budget = rows.reduce((s, b) => s + (b.budget || 0), 0)
  const spent = rows.reduce((s, b) => s + (b.spent || 0), 0)
  const dim = raw.days_in_month || 30, day = raw.day || 1
  const endKey = String(raw.month || '2000-01') + '-' + String(dim).padStart(2, '0')
  return Object.assign({}, raw, {
    v: 1,
    variable: { budget, spent, left: budget - spent, days_left: dim - day + 1, through_label: '', through_date: endKey },
    daily_spend: [], milestones: raw.milestones || {},
  })
}

/**
 * The day's plan. Payloads with `today` carry the goal-safe room (see
 * src/lib/widget/today.ts); older ones fall back to the everyday budgets
 * spread over the days left, which is honest but not goal-aware (basis 'budget').
 */
function planOf(d) {
  const wm = d.west_month
  const goalFromWest = wm && wm.target > 0
    ? { label: STR.west, month: wm.month, pct: wm.pct, target: wm.target, projected: wm.projected_savings, buffer: wm.projected_savings - wm.target }
    : null
  const ms = d.milestones || {}
  if (d.today && Number.isFinite(d.today.allowance)) {
    const t = d.today
    const p = Object.assign({ basis: 'goal', state: 'ok', week: [], goals: [], streak: null, yesterday: null, nudge: null, tomorrow: null }, t)
    p.goal = t.goal || goalFromWest
    p.left = Number.isFinite(t.left) ? t.left : t.allowance - (t.spent || 0)
    p.state = stateOf(p)
    return p
  }
  const v = d.variable
  const ds = d.daily_spend || []
  const spentToday = ds.length && ds.length === d.day ? ds[ds.length - 1] || 0 : 0
  const daysLeft = Math.max(1, v.days_left || 1)
  const allowance = Math.max(0, Math.floor((v.left + spentToday) / daysLeft / 10) * 10)
  const goals = []
  if (goalFromWest) goals.push({ kind: 'west_month', month: wm.month, pct: wm.pct, buffer: goalFromWest.buffer })
  if (ms.west_funded_pct != null) goals.push({ kind: 'west_home', pct: ms.west_funded_pct, months: ms.west_months_to_delivery })
  const p = {
    basis: 'budget', allowance, spent: spentToday, left: allowance - spentToday, days_left: daysLeft, tomorrow: null,
    goal: goalFromWest, streak: null, yesterday: null, week: [], goals,
    // The one nudge an older payload can still give: the category past its budget.
    nudge: d.top_over && d.top_over.name ? { kind: 'skip', category: d.top_over.name, url: '/finance/budgets' } : null,
  }
  p.state = stateOf(p)
  return p
}

/** ok / tight / over (today's room used up, goal still fine) / risk (goal short even with no spend). */
function stateOf(p) {
  if (p.state === 'risk') return 'risk'
  if (p.left < 0 || (p.basis === 'budget' && p.allowance <= 0)) return 'over'
  if (p.allowance > 0 && p.left < p.allowance * 0.25) return 'tight'
  return 'ok'
}
const TONE = {
  good: { color: C.good, fill: FILL.good, chip: C.chip.good },
  warn: { color: C.warn, fill: FILL.warn, chip: C.chip.warn },
}
/** The month's goal: green at or past target, amber short of it (never red: it is a forecast). */
const goalTone = g => (!g || g.pct >= 100 ? TONE.good : TONE.warn)
const goalName = (p, d) => STR.west + ((p.goal && p.goal.month) || (d.west_month && d.west_month.month) ? ' · ' + monthLabel((p.goal && p.goal.month) || d.west_month.month) : '')

/** The hero: label, number (or word) and the line that ties it to the goal. */
function heroOf(p, d) {
  const g = STR.west
  const goal = p.goal
  if (fromLastMonth(d)) {
    return { label: STR.lastMonth, value: money(Math.max(0, p.left)), dim: true, line: p.basis === 'goal' ? STR.keeps(STR.west) : STR.keepsBudget, lineColor: C.faint }
  }
  if (planIsOld(d)) {
    // The header already carries the amber stamp; the line keeps the goal in view.
    return { label: STR.upTo(weekday(planDate(d))), value: money(p.allowance), dim: true, line: p.basis === 'goal' ? STR.keeps(STR.west) : STR.keepsBudget, lineColor: C.faint }
  }
  if (p.state === 'risk') {
    const at = goal && goal.no_spend_pct != null ? goal.no_spend_pct : goal ? goal.pct : 0
    return { label: STR.today, value: STR.noSpend, isWord: true, line: STR.noSpendKeeps(g, at), lineColor: C.warn }
  }
  if (p.basis === 'budget') {
    if (p.state === 'over') return { label: STR.today, value: money(0), line: STR.budgetUsed, lineColor: C.sub }
    if (!p.spent) return { label: STR.canSpend, value: money(p.allowance), line: STR.keepsBudget, lineColor: C.sub }
    return { label: STR.leftToday, value: money(p.left), line: STR.ofSpent(moneyShort(p.spent), moneyShort(p.allowance)), lineColor: p.state === 'tight' ? C.warn : C.sub }
  }
  if (p.state === 'over') {
    if (p.tomorrow != null) return { label: STR.tomorrowUpTo, value: money(p.tomorrow), line: STR.overBy(moneyShort(-p.left)), lineColor: C.warn }
    return {
      label: STR.overToday, value: money(-p.left),
      line: goal && goal.pct < 100 ? STR.atPct(g, goal.pct) : STR.stillSafe(g), lineColor: goal && goal.pct < 100 ? C.warn : C.good,
    }
  }
  if (!p.spent) return { label: STR.canSpend, value: money(p.allowance), line: STR.keeps(g), lineColor: C.good }
  return { label: STR.leftToday, value: money(p.left), line: STR.ofSpent(moneyShort(p.spent), moneyShort(p.allowance)), lineColor: p.state === 'tight' ? C.warn : C.sub }
}

/** Today's one nudge, worded on the phone from its kind. */
function nudgeOf(p, d) {
  const n = p.nudge
  if (!n || planIsOld(d) || fromLastMonth(d)) return null
  const N = STR.nudge
  const cat = String(n.category || '')
  let title = null
  if (n.kind === 'due') title = N.due(String(n.label || '') + (n.count > 1 ? STR.more(n.count - 1) : ''), moneyShort(n.amount || 0), n.days)
  else if (n.kind === 'skip') title = N.skip(cat)
  else if (n.kind === 'easy') title = (DINING.test(cat) ? N.easyDining : N.easy)(cat, moneyShort(n.left || 0), n.days || p.days_left)
  else if (n.kind === 'fits') title = (DINING.test(cat) ? N.fitsDining : N.fits)(cat, moneyShort(n.left || 0))
  else if (n.kind === 'ahead') title = N.ahead(moneyShort(n.amount || 0))
  else if (n.kind === 'short') title = N.short(moneyShort(n.amount || 0))
  if (!title) return null
  const fallback = n.kind === 'due' ? URLS.bills : n.kind === 'ahead' || n.kind === 'short' ? URLS.west : URLS.budgets
  return { title, url: appLink(n.url, fallback) }
}

/** Header chip: a streak when there is one, else the day's status word. */
function chipOf(p, d) {
  if (d.__stale || p.basis !== 'goal') return null
  if (p.state === 'risk') return { text: STR.saveDay, tone: TONE.warn }
  if (p.state === 'over') return { text: STR.overChip, tone: TONE.warn }
  if (p.streak >= 2) return { text: STR.streak(p.streak), tone: TONE.good }
  if (p.state === 'tight') return { text: STR.tight, tone: TONE.warn }
  return { text: STR.onTrack, tone: TONE.good }
}

function yesterdayLine(p, d) {
  const y = p.yesterday
  if (!y || d.__stale) return null
  if (y.diff >= 0) return { text: STR.yesterdayUnder(moneyShort(y.diff)), color: C.good }
  return { text: STR.yesterdayOver(moneyShort(-y.diff)), color: C.faint }
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
function chip(stack, c) {
  const s = stack.addStack()
  s.cornerRadius = 9
  s.setPadding(3, 8, 3, 8)
  s.backgroundColor = c.tone.chip
  s.centerAlignContent()
  const dot = s.addImage(dotImage(6, c.tone.fill))
  dot.imageSize = new Size(6, 6)
  s.addSpacer(5)
  txt(s, c.text, 11, c.tone.color, 'bold')
}
/** Header: date and days left, or the amber offline stamp; the chip on the right. */
function header(w, d, p) {
  const head = w.addStack()
  head.centerAlignContent()
  if (d.__stale) {
    txt(head, '⚠︎ ' + STR.asOf(stampTime(d.updated_at)), 12, C.warn, 'semibold')
  } else {
    txt(head, formatter(LANG === 'es' ? 'EEE d MMM' : 'EEE MMM d').string(new Date()), 12, C.sub, 'semibold')
    txt(head, ' · ' + STR.daysLeft(p.days_left), 12, C.faint, 'medium', { msf: 0.9 })
  }
  head.addSpacer()
  const c = chipOf(p, d)
  if (c) chip(head, c)
}
/** Hero block: label, big number, the line tying it to the goal. */
function heroBlock(stack, d, p, size, maxW) {
  const h = heroOf(p, d)
  txt(stack, h.label, 12, C.sub, 'semibold')
  // A word hero ("No-spend day") is sized to fit its column, not shrunk by iOS.
  const wordSize = Math.max(16, Math.min(Math.round(size * 0.66), Math.floor((maxW || 999) / (h.value.length * 0.6))))
  txt(stack, h.value, h.isWord ? wordSize : size, C.text, 'hero', { msf: 0.55, opacity: h.dim ? 0.5 : 1 })
  txt(stack, h.line, 11, h.lineColor, 'semibold', { msf: 0.9 })
}
/** Goal block: name + % on one line, runway, how far ahead or short. */
function goalBlock(stack, d, p, width, opts) {
  const o = opts || {}
  const g = p.goal
  if (!g) return
  const tone = goalTone(g)
  const r = stack.addStack()
  r.centerAlignContent()
  txt(r, goalName(p, d), 12, C.text, 'semibold')
  r.addSpacer()
  txt(r, pct(g.pct), o.pctSize || 13, tone.color, 'hero')
  stack.addSpacer(3)
  addRunway(stack, width, o.barH || 6, g.pct / 100, tone.fill)
  if (o.detail !== false) {
    stack.addSpacer(2)
    const buf = Number(g.buffer)
    const lead = moneyShort(g.projected) + ' ' + STR.of + ' ' + moneyShort(g.target)
    const tail = Number.isFinite(buf) && Math.abs(buf) >= 50 ? (buf >= 0 ? STR.ahead(moneyShort(buf)) : STR.short(moneyShort(-buf))) : ''
    // Narrow columns keep the part that matters today: how far ahead or short.
    txt(stack, tail ? (width < 140 ? tail : lead + ' · ' + tail) : lead, 11, C.faint, 'medium', { msf: 0.9 })
  }
}
/** The nudge in a soft card, plain text (not a link colour). */
function nudgeCard(stack, n, lines, width) {
  const card = stack.addStack()
  card.layoutVertically()
  if (width) card.size = new Size(width, 0)
  card.backgroundColor = C.card
  card.cornerRadius = 12
  card.setPadding(7, 10, 7, 10)
  card.url = n.url
  const row = card.addStack()
  txt(row, n.title, 12, C.text, 'semibold', { lines, msf: 0.92 })
  if (!width) row.addSpacer()
  return card
}

// ── Small: one thing, today's number, with the goal it keeps safe underneath ──
function small(w, d, m) {
  const cw = m.small - 30
  const p = planOf(d)
  w.url = URLS.home
  if (hasParam('goals')) return smallGoals(w, d, p, cw)
  // One quiet line on top: the streak when there is one, else the days left.
  if (d.__stale) txt(w, '⚠︎ ' + STR.asOf(stampTime(d.updated_at)), 11, C.warn, 'semibold')
  else if (p.streak >= 2 && p.state !== 'risk') txt(w, '● ' + STR.streak(p.streak), 11, C.good, 'semibold')
  else txt(w, STR.daysLeft(p.days_left), 11, C.faint, 'semibold')
  w.addSpacer()
  const h = w.addStack()
  h.layoutVertically()
  h.url = URLS.transactions
  heroBlock(h, d, p, m.small >= 155 ? 32 : 28, cw)
  w.addSpacer()
  const g = p.goal
  if (!g) return
  const foot = w.addStack()
  foot.layoutVertically()
  foot.url = URLS.west
  const r = foot.addStack()
  r.centerAlignContent()
  txt(r, goalName(p, d), 11, C.sub, 'semibold')
  r.addSpacer()
  txt(r, pct(g.pct), 12, goalTone(g).color, 'hero')
  foot.addSpacer(3)
  addRunway(foot, cw, 5, g.pct / 100, goalTone(g).fill)
}
/** Small, "goals" parameter: the month's goal as the hero, today's room below. */
function smallGoals(w, d, p, cw) {
  w.url = URLS.west
  const g = p.goal
  txt(w, goalName(p, d), 12, C.sub, 'semibold')
  txt(w, g ? pct(g.pct) : '–', 34, g ? goalTone(g).color : C.text, 'hero', { msf: 0.6 })
  if (g) addRunway(w, cw, 6, g.pct / 100, goalTone(g).fill)
  w.addSpacer()
  const h = heroOf(p, d)
  txt(w, h.label, 11, C.faint, 'semibold')
  txt(w, h.value, h.isWord ? 15 : 17, C.text, 'hero', { msf: 0.75, opacity: h.dim ? 0.5 : 1 })
}

// ── Medium: today | the goal, then today's nudge ──
function medium(w, d, m) {
  const cw = m.mediumW - 30
  const compact = m.height < 155
  const p = planOf(d)
  w.url = URLS.home
  header(w, d, p)
  w.addSpacer()

  const body = w.addStack()
  body.centerAlignContent()
  const left = body.addStack()
  left.layoutVertically()
  left.url = URLS.transactions
  heroBlock(left, d, p, compact ? 28 : 32, Math.round(cw * 0.52))
  body.addSpacer()
  const gw = Math.round(cw * 0.44)
  const right = body.addStack()
  right.layoutVertically()
  right.url = URLS.west
  right.size = new Size(gw, 0)
  goalBlock(right, d, p, gw, { pctSize: 14 })
  const y = yesterdayLine(p, d)
  if (y) {
    right.addSpacer(5)
    txt(right, y.text, 11, y.color, 'semibold', { msf: 0.9 })
  }
  w.addSpacer()

  const n = nudgeOf(p, d)
  if (n) nudgeCard(w, n, compact ? 1 : 2)
}

// ── Large: today and its nudge, the goals, the week, what's coming ──
function large(w, d, m) {
  const cw = m.mediumW - 30
  const compact = m.largeH < 350
  const p = planOf(d)
  w.url = URLS.home
  header(w, d, p)
  w.addSpacer(compact ? 6 : 10)

  const body = w.addStack()
  body.centerAlignContent()
  const left = body.addStack()
  left.layoutVertically()
  left.url = URLS.transactions
  heroBlock(left, d, p, compact ? 30 : 34, Math.round(cw * 0.5))
  body.addSpacer()
  const n = nudgeOf(p, d)
  if (n) nudgeCard(body, n, 3, Math.round(cw * 0.46))
  w.addSpacer(compact ? 10 : 14)

  goalGrid(w, d, p, cw, compact)
  // The slack splits evenly between the sections.
  w.addSpacer()
  weekStrip(w, d, p, cw)
  // Without a week to show (older payloads), the bills get the room.
  coming(w, d, p, compact ? 1 : (p.week || []).length && !d.__stale ? 2 : 3)
}

/** Goals as a 2×2 grid: the month's WEST runway (status colour, target tick), then neutral progress. */
function goalGrid(w, d, p, cw, compact) {
  const rows = (p.goals || []).slice(0, 4)
  if (!rows.length) return
  const gap = 14
  const cell = Math.floor((cw - gap) / 2)
  for (let i = 0; i < rows.length; i += 2) {
    const line = w.addStack()
    for (let j = i; j < Math.min(i + 2, rows.length); j++) {
      if (j > i) line.addSpacer(gap)
      goalCell(line, d, rows[j], cell)
    }
    if (i + 2 < rows.length) w.addSpacer(compact ? 8 : 11)
  }
}
function goalCell(line, d, g, width) {
  const c = line.addStack()
  c.layoutVertically()
  c.size = new Size(width, 0)
  let label = '', note = '', url = URLS.goals, isMonth = false
  if (g.kind === 'west_month') {
    isMonth = true
    label = STR.west + ' · ' + monthLabel(g.month || d.month)
    const b = Number(g.buffer) || 0
    note = b >= 0 ? STR.ahead(moneyShort(b)) : STR.short(moneyShort(-b))
    url = URLS.west
  } else if (g.kind === 'year') {
    label = STR.yearGoals(g.year)
    note = g.on_track ? STR.onTrackDec : g.covered_pct != null ? STR.coveredBy(g.covered_pct) : ''
  } else if (g.kind === 'west_home') {
    label = STR.westHome
    note = g.months != null ? STR.moToKeys(g.months) : STR.funded
    url = URLS.west
  } else if (g.kind === 'emergency') {
    label = STR.emergency
    note = STR.moCovered(Math.round((Number(g.months) || 0) * 10) / 10)
    url = URLS.home
  } else return
  c.url = appLink(g.url, url)
  const tone = isMonth ? goalTone(g) : null
  const r = c.addStack()
  r.centerAlignContent()
  txt(r, label, 12, C.text, 'semibold', { msf: 0.92 })
  r.addSpacer(4)
  r.addSpacer()
  txt(r, pct(g.pct), 12, isMonth ? tone.color : C.sub, 'num')
  c.addSpacer(4)
  if (isMonth) addRunway(c, width, 5, g.pct / 100, tone.fill)
  else addBar(c, width, 5, g.pct / 100, FILL.accent)
  if (note) {
    c.addSpacer(isMonth ? 1 : 4)
    txt(c, note, 11, C.faint, 'medium', { msf: 0.9 })
  }
}

/** The week as dots: green on plan, grey past that day's room, a ring for today. */
function weekStrip(w, d, p, cw) {
  const week = (p.week || []).slice(-7)
  if (!week.length || d.__stale) {
    const ms = d.milestones || {}
    const bits = []
    if (ms.baby_months != null) bits.push('👶 ' + STR.baby(ms.baby_months))
    if (ms.west_months_to_delivery != null) bits.push('🏠 ' + STR.moToKeys(ms.west_months_to_delivery))
    if (bits.length) txt(w, bits.join('   '), 12, C.sub, 'semibold', { msf: 0.9 })
    return
  }
  const box = w.addStack()
  box.layoutVertically()
  box.url = URLS.transactions
  const done = week.filter(x => !x.today && x.ok != null)
  txt(box, STR.thisWeek + ' · ' + STR.onPlanOf(done.filter(x => x.ok).length, done.length), 11, C.faint, 'semibold', { msf: 0.9 })
  box.addSpacer(5)
  const row = box.addStack()
  row.centerAlignContent()
  const dots = row.addStack()
  week.forEach((day, i) => {
    const col = dots.addStack()
    col.layoutVertically()
    col.centerAlignContent()
    const img = col.addImage(day.today ? dotImage(12, FILL.accent, true) : dotImage(12, day.ok ? FILL.good : MISS))
    img.imageSize = new Size(12, 12)
    col.addSpacer(3)
    txt(col, dayLetter(day.date), 11, day.today ? C.accent : C.faint, day.today ? 'bold' : 'semibold')
    if (i < week.length - 1) dots.addSpacer(9)
  })
  row.addSpacer()
  const y = yesterdayLine(p, d)
  if (y) txt(row, y.text, 12, y.color, 'semibold', { msf: 0.92 })
}

/** The next charges (bills dated before today are dropped from a cached list). */
function coming(w, d, p, max) {
  const today = todayKey()
  const items = (d.upcoming || []).filter(u => u && String(u.date) >= today).slice(0, max)
  if (!items.length) return
  w.addSpacer()
  const box = w.addStack()
  box.layoutVertically()
  box.url = URLS.bills
  if (max > 1) {
    txt(box, STR.comingUp, 11, C.faint, 'semibold')
    box.addSpacer(3)
  }
  items.forEach((u, i) => {
    const r = box.addStack()
    r.centerAlignContent()
    const days = daysUntil(u.date)
    const when = days <= 0 ? STR.todayDay : days === 1 ? STR.tomorrowDay : formatter(LANG === 'es' ? 'EEE d' : 'EEE MMM d').string(dateOf(u.date))
    const wc = r.addStack()
    wc.size = new Size(78, 0)
    txt(wc, when, 12, days <= 1 ? C.warn : C.sub, 'semibold', { msf: 0.9 })
    wc.addSpacer()
    txt(r, String(u.label || '') + (u.count > 1 ? STR.more(u.count - 1) : ''), 12, C.text, 'medium', { msf: 0.9 })
    r.addSpacer()
    txt(r, moneyShort(u.amount || 0), 12, C.sub, 'num')
    if (i < items.length - 1) box.addSpacer(3)
  })
}

// ── Lock screen: white only, no backgrounds ──
function lockLead(p) {
  if (p.state === 'risk') return { value: STR.noSpend, unit: '' }
  if (p.state === 'over') return { value: moneyFit(-p.left), unit: STR.overShort }
  return { value: moneyFit(Math.max(0, p.left)), unit: STR.leftShort }
}
function lockRect(w, d, m) {
  const p = planOf(d)
  const cw = m.rect - 4
  w.url = hasParam('quickadd') ? URLS.quickAdd : URLS.home
  const lead = lockLead(p)
  const top = w.addStack()
  top.bottomAlignContent()
  txt(top, lead.value, lead.unit ? 17 : 15, WHITE, 'hero', { msf: 0.7, opacity: d.__stale ? 0.7 : 1 })
  if (lead.unit && !d.__stale) {
    top.addSpacer(4)
    txt(top, lead.unit, 12, whiteA(0.8), 'semibold')
  }
  top.addSpacer()
  if (d.__stale) txt(top, '⚠︎ ' + stampTime(d.updated_at), 11, whiteA(0.75), 'medium')
  const g = p.goal
  if (g) {
    w.addSpacer(3)
    // Narrow lock screens (SE) keep the goal and drop the streak.
    const line = p.state === 'risk'
      ? STR.noSpendKeeps(STR.west, g.no_spend_pct != null ? g.no_spend_pct : g.pct)
      : STR.west + ' ' + pct(g.pct) + (p.streak >= 2 && cw >= 160 && !d.__stale ? ' · ' + STR.streak(p.streak) : '')
    txt(w, line, 11, whiteA(0.85), 'semibold')
    w.addSpacer(2)
    addRunway(w, cw, 5, g.pct / 100, WHITE, whiteA(0.25), whiteA(0.9))
  }
}
function lockCirc(w, d) {
  w.addAccessoryWidgetBackground = true
  w.url = hasParam('quickadd') ? URLS.quickAdd : URLS.home
  const p = planOf(d)
  let img
  if (hasParam('goals')) {
    const g = p.goal
    img = ringImage(58, g ? g.pct / 100 : 0, WHITE, whiteA(0.25), 5, g ? pct(g.pct) : '–', STR.west)
  } else if (p.state === 'risk') {
    img = ringImage(58, 0, WHITE, whiteA(0.25), 5, '$0', STR.todayShort)
  } else if (p.state === 'over') {
    // Over: the overflow drawn as its own arc, so the ring never reads as empty.
    img = ringImage(58, Math.min(1, -p.left / Math.max(1, p.allowance)), whiteA(0.6), whiteA(0.25), 5, moneyShort(-p.left), STR.overWord)
  } else {
    // Today's room as a fuel gauge: full in the morning, emptying as you spend.
    const frac = p.allowance > 0 ? Math.max(0, p.left) / p.allowance : 0
    img = ringImage(58, frac, WHITE, whiteA(0.25), 5, moneyShort(Math.max(0, p.left)), STR.todayShort)
  }
  const s = w.addImage(img)
  s.imageSize = new Size(58, 58)
  s.centerAlignImage()
}
function lockInline(w, d) {
  const p = planOf(d)
  const g = p.goal
  const lead = lockLead(p)
  txt(w, lead.value + (lead.unit ? ' ' + lead.unit : '') + (g ? ' · ' + STR.west + ' ' + pct(g.pct) : ''), 13, WHITE, 'semibold')
}

function messageWidget(w, family, title, body, url) {
  w.url = url || URLS.home
  if (family === 'accessoryInline') return txt(w, title + ' · ' + body, 13, WHITE, 'semibold')
  if (family === 'accessoryCircular') {
    w.addAccessoryWidgetBackground = true
    return txt(w, title, 12, WHITE, 'bold', { lines: 2, msf: 0.92 })
  }
  const accessory = family.indexOf('accessory') === 0
  txt(w, accessory ? title : '🐾 ' + title, 13, accessory ? WHITE : C.text, 'bold')
  w.addSpacer(4)
  txt(w, body, 12, accessory ? whiteA(0.8) : C.sub, 'medium', { lines: accessory ? 2 : 3, msf: 0.92 })
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
