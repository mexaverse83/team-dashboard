#!/usr/bin/env node
// Renders the phone widget (src/widget/finance-widget.js) through the
// Scriptable mock into PNGs: every family × light/dark plus edge cases.
//
//   npm run widget:preview                         → $TMPDIR/widget-preview/
//   npm run widget:preview -- --out /tmp/shots --only medium,large
//   npm run widget:preview -- --fixture live.json   (a saved GET /api/finance/widget)
//   npm run widget:preview -- --fixture live.json --now 2026-10-29T09:44:00-06:00   (clock for the base cases)
//
// Offline and read-only: the page never touches the network.
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const flag = name => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1] }
// Renders are build output: default outside the repo so they never show up in git status.
const outDir = resolve(flag('--out') || join(tmpdir(), 'widget-preview'))
const only = (flag('--only') || '').split(',').filter(Boolean)
mkdirSync(outDir, { recursive: true })

const require = createRequire(join(root, 'package.json'))
let puppeteer
try { puppeteer = require('puppeteer-core') } catch { puppeteer = (await import('puppeteer-core')).default }

const harness = join(root, 'tests', 'widget-harness')
const fixtures = await import(pathToFileURL(join(harness, 'fixtures.mjs')).href)
const base = flag('--fixture') ? JSON.parse(readFileSync(resolve(flag('--fixture')), 'utf8')) : fixtures.goalSafe
// The base payload's own clock (a saved fixture renders on its own date).
const baseNow = flag('--now') || (flag('--fixture') ? null : fixtures.NOW_TODAY)
const code = readFileSync(join(root, 'src', 'widget', 'finance-widget.js'), 'utf8')
// Keep the bundled copy the widget-code route serves in step with the script.
const { renderSourceModule } = await import(pathToFileURL(join(root, 'src', 'widget', 'sync-source.mjs')).href)
const sourceTs = join(root, 'src', 'widget', 'finance-widget.source.ts')
if (readFileSync(sourceTs, 'utf8') !== renderSourceModule(code)) {
  writeFileSync(sourceTs, renderSourceModule(code))
  console.log('updated src/widget/finance-widget.source.ts')
}
const strip = s => s.replace(/^export /gm, '')
const mock = strip(readFileSync(join(harness, 'scriptable-mock.js'), 'utf8'))
const renderer = strip(readFileSync(join(harness, 'render-dom.js'), 'utf8'))

// Widget points per screen (mirrors SIZE_TABLE in the widget).
const SCREENS = {
  max: { screen: { width: 430, height: 932 }, small: 170, medium: [364, 170], large: [364, 382], rect: [172, 76] },
  pro: { screen: { width: 393, height: 852 }, small: 158, medium: [338, 158], large: [338, 354], rect: [160, 72] },
  x: { screen: { width: 375, height: 812 }, small: 155, medium: [329, 155], large: [329, 345], rect: [157, 67] },
  se: { screen: { width: 375, height: 667 }, small: 148, medium: [321, 148], large: [321, 324], rect: [157, 67] },
}
function boxFor(family, s) {
  const S = SCREENS[s || 'max']
  if (family === 'small') return [S.small, S.small, 22]
  if (family === 'medium') return [...S.medium, 22]
  if (family === 'large') return [...S.large, 22]
  if (family === 'accessoryRectangular') return [...S.rect, 12]
  if (family === 'accessoryCircular') return [76, 76, 38]
  return [257, 26, 0]
}

const FAMILIES = ['small', 'medium', 'large', 'accessoryRectangular', 'accessoryCircular', 'accessoryInline']
const BOTH = ['light', 'dark']
const cases = [
  ...FAMILIES.map(family => ({ name: family, family, fixture: base, schemes: BOTH })),
  { name: 'small-spent', family: 'small', fixture: fixtures.spentToday, now: fixtures.NOW_TODAY, schemes: BOTH },
  { name: 'medium-spent', family: 'medium', fixture: fixtures.spentToday, now: fixtures.NOW_TODAY, schemes: ['light'] },
  { name: 'small-over', family: 'small', fixture: fixtures.overToday, now: fixtures.NOW_TODAY, schemes: BOTH },
  { name: 'medium-over', family: 'medium', fixture: fixtures.overToday, now: fixtures.NOW_TODAY, schemes: BOTH },
  { name: 'large-over', family: 'large', fixture: fixtures.overToday, now: fixtures.NOW_TODAY, schemes: ['dark'] },
  { name: 'rect-over', family: 'accessoryRectangular', fixture: fixtures.overToday, now: fixtures.NOW_TODAY, schemes: ['dark'] },
  { name: 'circ-over', family: 'accessoryCircular', fixture: fixtures.overToday, now: fixtures.NOW_TODAY, schemes: ['dark'] },
  { name: 'small-risk', family: 'small', fixture: fixtures.goalRisk, now: fixtures.NOW_TODAY, schemes: BOTH },
  { name: 'medium-risk', family: 'medium', fixture: fixtures.goalRisk, now: fixtures.NOW_TODAY, schemes: BOTH },
  { name: 'large-risk', family: 'large', fixture: fixtures.goalRisk, now: fixtures.NOW_TODAY, schemes: ['light'] },
  { name: 'rect-risk', family: 'accessoryRectangular', fixture: fixtures.goalRisk, now: fixtures.NOW_TODAY, schemes: ['dark'] },
  { name: 'inline-over', family: 'accessoryInline', fixture: fixtures.overToday, now: fixtures.NOW_TODAY, schemes: ['dark'] },
  { name: 'rect-es-over', family: 'accessoryRectangular', param: 'lang=es', fixture: fixtures.overToday, now: fixtures.NOW_TODAY, schemes: ['dark'] },
  { name: 'medium-lastday', family: 'medium', fixture: fixtures.lastDay, now: fixtures.NOW_LAST_DAY, schemes: ['light'] },
  { name: 'large-lastday', family: 'large', fixture: fixtures.lastDay, now: fixtures.NOW_LAST_DAY, schemes: ['dark'] },
  { name: 'medium-cached-yesterday', family: 'medium', fail: true, cache: base, now: '2026-10-30T08:00:00-06:00', schemes: ['light'] },
  { name: 'small-cached-yesterday', family: 'small', fail: true, cache: base, now: '2026-10-30T08:00:00-06:00', schemes: ['dark'] },
  { name: 'medium-no-today', family: 'medium', fixture: fixtures.overBudget, now: fixtures.NOW_WEEKDAY, schemes: BOTH },
  { name: 'large-no-today', family: 'large', fixture: fixtures.underBudget, now: fixtures.NOW_WEEKDAY, schemes: ['light'] },
  { name: 'small-no-today', family: 'small', fixture: fixtures.overBudget, now: fixtures.NOW_WEEKDAY, schemes: ['light'] },
  { name: 'medium-day1', family: 'medium', fixture: fixtures.dayOne, now: fixtures.NOW_DAY_ONE, schemes: ['light'] },
  { name: 'medium-day1-goal', family: 'medium', fixture: fixtures.dayOneToday, now: fixtures.NOW_DAY_ONE_TODAY, schemes: BOTH },
  { name: 'large-day1-goal', family: 'large', fixture: fixtures.dayOneToday, now: fixtures.NOW_DAY_ONE_TODAY, schemes: ['light'] },
  { name: 'small-short', family: 'small', fixture: fixtures.goalShort, now: fixtures.NOW_TODAY, schemes: ['light'] },
  { name: 'medium-short', family: 'medium', fixture: fixtures.goalShort, now: fixtures.NOW_TODAY, schemes: ['dark'] },
  { name: 'medium-good', family: 'medium', fixture: fixtures.goodDay, now: fixtures.NOW_GOOD_DAY, schemes: ['light'] },
  { name: 'large-good', family: 'large', fixture: fixtures.goodDay, now: fixtures.NOW_GOOD_DAY, schemes: ['dark'] },
  { name: 'rect-no-today', family: 'accessoryRectangular', fixture: fixtures.legacyV1, now: fixtures.NOW_WEEKDAY, schemes: ['dark'] },
  { name: 'circ-no-today', family: 'accessoryCircular', fixture: fixtures.legacyV1, now: fixtures.NOW_WEEKDAY, schemes: ['dark'] },
  { name: 'inline-no-today', family: 'accessoryInline', fixture: fixtures.legacyV1, now: fixtures.NOW_WEEKDAY, schemes: ['dark'] },
  { name: 'rect-cached-yesterday', family: 'accessoryRectangular', fail: true, cache: base, now: '2026-10-30T08:00:00-06:00', schemes: ['dark'] },
  { name: 'circ-cached-yesterday', family: 'accessoryCircular', fail: true, cache: base, now: '2026-10-30T08:00:00-06:00', schemes: ['dark'] },
  { name: 'inline-cached-yesterday', family: 'accessoryInline', fail: true, cache: base, now: '2026-10-30T08:00:00-06:00', schemes: ['dark'] },
  { name: 'small-cached-lastmonth-goal', family: 'small', fail: true, cache: base, now: '2026-11-01T08:00:00-06:00', schemes: ['light'] },
  { name: 'rect-cached-lastmonth-goal', family: 'accessoryRectangular', fail: true, cache: base, now: '2026-11-01T08:00:00-06:00', schemes: ['dark'] },
  { name: 'circ-cached-lastmonth-goal', family: 'accessoryCircular', fail: true, cache: base, now: '2026-11-01T08:00:00-06:00', schemes: ['dark'] },
  { name: 'inline-cached-lastmonth-goal', family: 'accessoryInline', fail: true, cache: base, now: '2026-11-01T08:00:00-06:00', schemes: ['dark'] },
  { name: 'medium-offline-cache', family: 'medium', fail: true, cache: base, schemes: BOTH },
  { name: 'large-offline-cache', family: 'large', fail: true, cache: base, schemes: ['dark'] },
  { name: 'small-offline-cache', family: 'small', fail: true, cache: base, schemes: ['light'] },
  { name: 'small-offline-lastmonth', family: 'small', fail: true, cache: fixtures.cachedLastMonth, now: fixtures.NOW_WEEKDAY, schemes: ['dark'] },
  { name: 'large-offline-lastmonth', family: 'large', fail: true, cache: fixtures.cachedLastMonth, now: fixtures.NOW_WEEKDAY, schemes: ['light'] },
  { name: 'rect-offline-2days', family: 'accessoryRectangular', fail: true, cache: fixtures.cachedTwoDaysAgo, now: fixtures.NOW_WEEKDAY, schemes: ['dark'] },
  { name: 'rect-es', family: 'accessoryRectangular', param: 'lang=es', fixture: base, schemes: ['dark'] },
  { name: 'medium-offline-empty', family: 'medium', fail: true, schemes: ['light'] },
  { name: 'medium-401', family: 'medium', status: 401, fixture: { error: 'Unauthorized' }, schemes: ['light'] },
  { name: 'rect-401', family: 'accessoryRectangular', status: 401, fixture: { error: 'Unauthorized' }, schemes: ['dark'] },
  { name: 'small-goals', family: 'small', param: 'goals', fixture: base, schemes: BOTH },
  { name: 'circ-goals', family: 'accessoryCircular', param: 'goals', fixture: base, schemes: ['dark'] },
  { name: 'large-es', family: 'large', param: 'lang=es', fixture: base, schemes: ['light'] },
  { name: 'medium-es', family: 'medium', param: 'lang=es', fixture: base, schemes: ['dark'] },
  { name: 'small-es', family: 'small', param: 'lang=es', fixture: base, schemes: ['light'] },
  { name: 'medium-legacy-v1', family: 'medium', fixture: fixtures.legacyV1, now: fixtures.NOW_WEEKDAY, schemes: ['light'] },
  { name: 'medium-pro', family: 'medium', screen: 'pro', fixture: base, schemes: ['light'] },
  { name: 'large-x', family: 'large', screen: 'x', fixture: base, schemes: ['dark'] },
  { name: 'medium-se', family: 'medium', screen: 'se', fixture: base, schemes: ['light'] },
  { name: 'large-se', family: 'large', screen: 'se', fixture: base, schemes: ['light'] },
  { name: 'small-se', family: 'small', screen: 'se', fixture: base, schemes: ['dark'] },
  { name: 'rect-se', family: 'accessoryRectangular', screen: 'se', fixture: base, schemes: ['dark'] },
].filter(c => !only.length || only.some(o => c.name === o || c.name.startsWith(o + '-') || c.family === o))

function page(c, scheme) {
  const [w, h, r] = boxFor(c.family, c.screen)
  const accessory = c.family.startsWith('accessory')
  const bg = accessory ? 'linear-gradient(160deg,#1e2a4a,#3b2f5c 60%,#141826)' : scheme === 'dark' ? '#0b0c10' : '#e7ecf3'
  const opts = {
    fixture: c.fixture ?? null, status: c.status ?? 200, fail: !!c.fail, family: c.family, param: c.param || null,
    now: c.now || baseNow || fixtures.NOW_WEEKDAY, cache: c.cache, screen: SCREENS[c.screen || 'max'].screen,
  }
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0}
  body{background:${bg};display:flex;align-items:center;justify-content:center;width:${w + 40}px;height:${h + 40}px;-webkit-font-smoothing:antialiased}
  #widget{width:${w}px;height:${h}px;border-radius:${r}px;overflow:hidden;position:relative;${accessory ? '' : `box-shadow:0 1px 3px rgba(0,0,0,${scheme === 'dark' ? 0.5 : 0.12})`}}
  </style><div id="widget"></div>
  <script>${mock}\n${renderer}
  (async () => {
    const dark = () => matchMedia('(prefers-color-scheme: dark)').matches
    const opts = ${JSON.stringify(opts)}
    const env = createScriptableEnv({ ...opts, dark, createCanvas: () => document.createElement('canvas') })
    try {
      const { widget } = await env.run(${JSON.stringify(code)}, { API_URL: 'https://finance.autonomis.co/api/finance/widget', APP_URL: 'https://finance.autonomis.co/finance', WIDGET_TOKEN: 'preview' })
      if (!${accessory} && !widget.backgroundColor) document.getElementById('widget').style.background = dark() ? '#1c1c1e' : '#fff'
      window.__REPORT = renderWidget(widget, document.getElementById('widget'), { family: opts.family, dark: dark() })
    } catch (e) {
      document.body.textContent = 'SCRIPT ERROR: ' + e.stack
      window.__REPORT = { error: String(e.stack) }
    }
    window.__DONE = true
  })()
  </script>`
}

const bin = flag('--chrome') || process.env.CHROME_PATH || execSync('ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome | tail -1').toString().trim()
const browser = await puppeteer.launch({ executablePath: bin, args: ['--no-sandbox', '--disable-gpu'] })
const reports = {}
let problems = 0
try {
  for (const c of cases) {
    for (const scheme of c.schemes) {
      const [w, h] = boxFor(c.family, c.screen)
      const name = `${c.name}-${scheme}`
      const file = join(outDir, `${name}.html`)
      writeFileSync(file, page(c, scheme))
      const p = await browser.newPage()
      await p.setRequestInterception(true)
      p.on('request', req => (req.url().startsWith('file:') || req.url().startsWith('data:') ? req.continue() : req.abort()))
      await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])
      await p.setViewport({ width: w + 40, height: h + 40, deviceScaleFactor: 3 })
      p.on('pageerror', e => console.error(name, 'pageerror', e.message))
      await p.goto(pathToFileURL(file).href)
      await p.waitForFunction('window.__DONE === true', { timeout: 15000 }).catch(() => console.error(name, 'timeout'))
      await p.evaluate(() => document.fonts.ready)
      await p.screenshot({ path: join(outDir, `${name}.png`) })
      const rep = await p.evaluate(() => window.__REPORT)
      reports[name] = rep
      if (!rep || rep.error || rep.clipped.length || (rep.minFont != null && rep.minFont < 11)) problems++
      await p.close()
    }
  }
} finally {
  await browser.close()
}

writeFileSync(join(outDir, 'report.json'), JSON.stringify(reports, null, 1))
for (const [name, rep] of Object.entries(reports)) {
  const flags = !rep ? 'NO REPORT' : rep.error ? 'ERROR ' + rep.error.split('\n')[0] : [rep.clipped.length ? 'clipped: ' + rep.clipped.join(' | ') : '', rep.minFont != null && rep.minFont < 11 ? 'minFont ' + rep.minFont : ''].filter(Boolean).join('; ')
  console.log(`${flags ? '✗' : '✓'} ${name}${flags ? '  ' + flags : ''}`)
}
console.log(`\n${Object.keys(reports).length} renders → ${outDir}${problems ? ` (${problems} with problems)` : ''}`)
process.exitCode = problems ? 1 : 0
