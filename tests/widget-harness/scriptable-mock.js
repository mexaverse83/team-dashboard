// Scriptable API mock (spec W §8). Runs in Vitest (node, no canvas: drawn
// images record their ops) and in the preview browser page (real <canvas>).
// The widget script runs unmodified against these globals.
//
// createScriptableEnv(options) → { globals, run(code, loaderGlobals), files, requests }

const pad2 = n => String(n).padStart(2, '0')

export const WIDGET_SIZES = {
  small: [170, 170, 22],
  medium: [364, 170, 22],
  large: [364, 382, 22],
  extraLarge: [715, 338, 22],
  accessoryRectangular: [172, 76, 12],
  accessoryCircular: [76, 76, 38],
  accessoryInline: [257, 26, 0],
}

export function createScriptableEnv(options = {}) {
  const {
    fixture = null,
    status = 200,
    fail = false,
    family = 'medium',
    param = null,
    now = '2026-10-28T09:15:00-06:00',
    dark = () => false,
    screen = { width: 430, height: 932 },
    cache = undefined,
    createCanvas = null,
    runsInWidget = true,
    respond = null,
  } = options

  const RealDate = Date
  const fixedNow = new RealDate(now).getTime()
  class FakeDate extends RealDate {
    constructor(...a) {
      if (a.length === 0) super(fixedNow)
      else super(...a)
    }
    static now() { return fixedNow }
  }

  class Color {
    constructor(hex, alpha = 1) {
      this.hex = String(hex).replace('#', '').toUpperCase()
      this.alpha = alpha
    }
    css() {
      if (this.light) return (dark() ? this.dark : this.light).css()
      let h = this.hex
      if (h.length === 3) h = h.split('').map(c => c + c).join('')
      const n = parseInt(h.slice(0, 6), 16)
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${this.alpha})`
    }
    static dynamic(l, d) {
      const c = new Color('000')
      c.light = l
      c.dark = d
      return c
    }
    static white() { return new Color('fff') }
    static black() { return new Color('000') }
    static clear() { return new Color('000', 0) }
  }

  const weightOf = n => /heavy/i.test(n) ? 800 : /black/i.test(n) ? 900 : /semibold/i.test(n) ? 600 : /bold/i.test(n) ? 700 : /medium/i.test(n) ? 500 : /light/i.test(n) ? 300 : 400
  const FONT_NAMES = /^(ultraLight|thin|light|regular|medium|semibold|bold|heavy|black|italic)?(Rounded|Monospaced)?SystemFont$|^(systemFont|italicSystemFont|body|caption1|caption2|footnote|headline|subheadline|title1|title2|title3|largeTitle|callout)$|^(ultraLight|thin|light|regular|medium|semibold|bold|heavy|black)(Rounded|Monospaced)SystemFont$/
  const Font = new Proxy({}, {
    get(_, name) {
      if (typeof name !== 'string') return undefined
      if (!FONT_NAMES.test(name)) throw new TypeError(`Font.${name} is not a Scriptable font`)
      return (size = 17) => ({ name, size, weight: weightOf(name), rounded: /rounded/i.test(name), mono: /monospaced/i.test(name) })
    },
  })

  class Point { constructor(x, y) { this.x = x; this.y = y } }
  class Size { constructor(w, h) { this.width = w; this.height = h } }
  class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }) } }
  class LinearGradient {
    constructor() { this.colors = []; this.locations = []; this.startPoint = new Point(0, 0); this.endPoint = new Point(0, 1) }
  }
  class Path {
    constructor() { this.ops = [] }
    move(p) { this.ops.push(['moveTo', p.x, p.y]) }
    addLine(p) { this.ops.push(['lineTo', p.x, p.y]) }
    addRect(r) { this.ops.push(['rect', r.x, r.y, r.width, r.height]) }
    addRoundedRect(r, rx) { this.ops.push(['roundRect', r.x, r.y, r.width, r.height, Math.min(rx, r.width / 2, r.height / 2)]) }
    addEllipse(r) { this.ops.push(['ellipse', r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2]) }
    addCurve(p, c1, c2) { this.ops.push(['bezierCurveTo', c1.x, c1.y, c2.x, c2.y, p.x, p.y]) }
    addQuadCurve(p, c1) { this.ops.push(['quadraticCurveTo', c1.x, c1.y, p.x, p.y]) }
    closeSubpath() { this.ops.push(['closePath']) }
  }
  class Img {
    constructor(src, w, h, ops, texts, paths) { this.src = src; this.size = new Size(w, h); this.ops = ops; this.texts = texts || []; this.paths = paths || [] }
  }
  const fontCss = f => `${f.weight} ${f.size}px ${f.mono ? 'ui-monospace, monospace' : f.rounded ? '"SF Pro Rounded", Inter, system-ui, sans-serif' : '-apple-system, "SF Pro Text", Inter, Arial, sans-serif'}`
  class DrawContext {
    constructor() {
      this.size = new Size(100, 100)
      this.opaque = true
      this.respectScreenScale = false
      this._align = 'left'
      this._font = Font.systemFont(17)
      this._text = new Color('000')
      this._ops = []
      this._texts = []
      this._paths = []
      this._c = undefined
    }
    get c() {
      if (this._c === undefined) {
        const cv = createCanvas ? createCanvas() : null
        if (cv) { cv.width = this.size.width; cv.height = this.size.height; this._cv = cv; this._c = cv.getContext('2d') } else this._c = null
      }
      return this._c
    }
    _op(name, fn) { this._ops.push(name); if (this.c) fn(this.c) }
    setFillColor(col) { this._op('fill-color', c => { c.fillStyle = col.css() }) }
    setStrokeColor(col) { this._op('stroke-color', c => { c.strokeStyle = col.css() }) }
    setLineWidth(w) { this._op('line-width', c => { c.lineWidth = w }) }
    addPath(p) { this._paths.push(p.ops.slice()); this._op('path', c => { c.beginPath(); p.ops.forEach(([m, ...a]) => c[m](...a)) }) }
    fillPath() { this._op('fill', c => c.fill()) }
    strokePath() { this._op('stroke', c => c.stroke()) }
    fillRect(r) { this._op('fillRect', c => c.fillRect(r.x, r.y, r.width, r.height)) }
    fillEllipse(r) { const p = new Path(); p.addEllipse(r); this.addPath(p); this.fillPath() }
    strokeEllipse(r) { const p = new Path(); p.addEllipse(r); this.addPath(p); this.strokePath() }
    setFont(f) { this._font = f }
    setTextColor(col) { this._text = col }
    setTextAlignedCenter() { this._align = 'center' }
    setTextAlignedLeft() { this._align = 'left' }
    setTextAlignedRight() { this._align = 'right' }
    drawTextInRect(t, r) {
      this._texts.push({ text: String(t), size: this._font.size })
      this._op('text:' + t, c => {
        c.font = fontCss(this._font)
        c.fillStyle = this._text.css()
        c.textAlign = this._align
        c.textBaseline = 'top'
        const x = this._align === 'center' ? r.x + r.width / 2 : this._align === 'right' ? r.x + r.width : r.x
        c.fillText(t, x, r.y)
      })
    }
    drawText(t, p) { this.drawTextInRect(t, new Rect(p.x, p.y, 0, 0)) }
    drawImageInRect() {}
    getImage() {
      const c = this.c
      return new Img(c ? this._cv.toDataURL() : '', this.size.width, this.size.height, this._ops.slice(), this._texts.slice(), this._paths.slice())
    }
  }

  class El { constructor(kind) { this.kind = kind } }
  class Container extends El {
    constructor(kind) {
      super(kind)
      this.children = []
      this.dir = kind === 'widget' ? 'v' : 'h'
      this.align = 'top'
      this.pad = kind === 'widget' ? [16, 16, 16, 16] : [0, 0, 0, 0]
      this.spacing = 0
      this.size = null
    }
    addText(t) {
      const e = new El('text')
      Object.assign(e, { text: String(t), font: Font.systemFont(17), lineLimit: 0, minimumScaleFactor: 1, textOpacity: 1, textAlign: 'left' })
      e.leftAlignText = () => { e.textAlign = 'left' }
      e.centerAlignText = () => { e.textAlign = 'center' }
      e.rightAlignText = () => { e.textAlign = 'right' }
      this.children.push(e)
      return e
    }
    addDate(d) { return this.addText(d.toLocaleTimeString()) }
    addImage(img) {
      if (!img || !img.size) throw new TypeError('addImage expects an Image')
      const e = new El('image')
      Object.assign(e, { image: img, imageSize: null, align: 'left' })
      e.leftAlignImage = () => { e.align = 'left' }
      e.centerAlignImage = () => { e.align = 'center' }
      e.rightAlignImage = () => { e.align = 'right' }
      e.applyFittingContentMode = () => {}
      e.applyFillingContentMode = () => {}
      this.children.push(e)
      return e
    }
    addSpacer(n) { const e = new El('spacer'); e.length = n; this.children.push(e); return e }
    addStack() { const s = new Container('stack'); this.children.push(s); return s }
    setPadding(t, l, b, r) { this.pad = [t, l, b, r] }
    useDefaultPadding() { this.pad = [16, 16, 16, 16] }
    layoutVertically() { this.dir = 'v' }
    layoutHorizontally() { this.dir = 'h' }
    topAlignContent() { this.align = 'top' }
    centerAlignContent() { this.align = 'center' }
    bottomAlignContent() { this.align = 'bottom' }
  }
  let presented = null
  class ListWidget extends Container {
    constructor() { super('widget') }
    async presentSmall() { presented = 'small'; widget = this }
    async presentMedium() { presented = 'medium'; widget = this }
    async presentLarge() { presented = 'large'; widget = this }
  }

  const requests = []
  class Request {
    constructor(url) { this.url = url; this.headers = {}; this.method = 'GET'; this.response = null; this.timeoutInterval = 60 }
    async loadString() {
      requests.push({ url: this.url, headers: { ...this.headers }, timeoutInterval: this.timeoutInterval })
      if (fail) throw new Error('The Internet connection appears to be offline.')
      if (respond) {
        const r = respond({ url: this.url, headers: { ...this.headers } })
        if (!r) throw new Error('The Internet connection appears to be offline.')
        this.response = { statusCode: r.status ?? 200, headers: r.headers || {} }
        return r.body ?? ''
      }
      this.response = { statusCode: status }
      if (status === 401) return '{"error":"Unauthorized"}'
      if (status >= 300) return '{"error":"summary unavailable"}'
      return JSON.stringify(fixture)
    }
    async loadJSON() { return JSON.parse(await this.loadString()) }
    async loadImage() { throw new Error('no network images in the harness') }
  }

  class DateFormatter {
    constructor() { this.dateFormat = 'yyyy-MM-dd'; this.locale = 'en_US' }
    string(d) {
      const loc = /^es/.test(this.locale) ? 'es-MX' : 'en-US'
      const strip = s => s.replace(/\.$/, '')
      return this.dateFormat.replace(/EEEE|EEE|MMMM|MMM|MM|dd|d|yyyy|HH|h|mm|a/g, t => String({
        EEEE: d.toLocaleDateString(loc, { weekday: 'long' }),
        EEE: strip(d.toLocaleDateString(loc, { weekday: 'short' })),
        MMMM: d.toLocaleDateString(loc, { month: 'long' }),
        MMM: strip(d.toLocaleDateString(loc, { month: 'short' })),
        MM: pad2(d.getMonth() + 1), dd: pad2(d.getDate()), d: d.getDate(), yyyy: d.getFullYear(), HH: pad2(d.getHours()),
        h: d.getHours() % 12 || 12, mm: pad2(d.getMinutes()), a: d.getHours() < 12 ? 'AM' : 'PM',
      }[t]))
    }
    useShortTimeStyle() {}
    useNoDateStyle() {}
  }

  const files = options.files || new Map()
  if (cache !== undefined) files.set('/lib/mona-widget-data.json', typeof cache === 'string' ? cache : JSON.stringify(cache))
  const fileManager = {
    joinPath: (a, b) => a.replace(/\/$/, '') + '/' + b,
    libraryDirectory: () => '/lib',
    documentsDirectory: () => '/docs',
    cacheDirectory: () => '/cache',
    fileExists: p => files.has(p),
    readString: p => (files.has(p) ? files.get(p) : null),
    writeString: (p, s) => { files.set(p, String(s)) },
    remove: p => { files.delete(p) },
    modificationDate: () => new FakeDate(),
  }
  const FileManager = { local: () => fileManager, iCloud: () => fileManager }
  const Device = {
    isUsingDarkAppearance: () => dark(),
    screenSize: () => { if (!screen) throw new Error('unavailable'); return new Size(screen.width, screen.height) },
    screenScale: () => 3,
    locale: () => 'es_MX',
    language: () => 'es',
  }

  let widget = null
  const globals = {
    Date: FakeDate,
    Color, Font, Point, Size, Rect, LinearGradient, Path, DrawContext, ListWidget, Request, DateFormatter, FileManager, Device,
    config: { runsInWidget, widgetFamily: runsInWidget ? family : undefined },
    args: { widgetParameter: param },
    Script: { setWidget: w => { widget = w }, complete() {} },
  }

  /** Run widget code the way the loader does: inside an async function with the loader's constants in scope. */
  async function run(code, loaderGlobals = {}) {
    const scope = { ...globals, ...loaderGlobals }
    const names = Object.keys(scope)
    const fn = new Function(...names, `return (async () => {\n${code}\n})()`)
    await fn(...names.map(n => scope[n]))
    return { widget, presented }
  }

  return { globals, run, files, requests }
}

// ── Tree inspection (Vitest) ──
export function walkWidget(node, visit, parent = null) {
  visit(node, parent)
  for (const child of node.children || []) walkWidget(child, visit, node)
}

/** Point size a drawn label ends up at once the image is scaled to its imageSize. */
export function drawnTextSizes(imageNode) {
  const img = imageNode.image
  const scale = (imageNode.imageSize || img.size).width / (img.size.width || 1)
  return (img.texts || []).map(t => ({ text: t.text, size: t.size * scale }))
}

export function inspectWidget(widget) {
  const texts = []
  const urls = []
  const images = []
  const backgrounds = []
  walkWidget(widget, node => {
    if (node.kind === 'text') texts.push(node)
    if (node.kind === 'image') images.push(node)
    if (node.url) urls.push(node.url)
    if (node.backgroundColor || node.backgroundGradient) backgrounds.push(node)
  })
  return { texts, urls, images, backgrounds, allText: texts.map(t => t.text).join('\n') }
}
