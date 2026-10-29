// @vitest-environment node
// Runs the real widget script (src/widget/finance-widget.js) against the
// Scriptable mock and asserts on the produced widget tree (W17).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'
import { createScriptableEnv, drawnTextSizes, inspectWidget, WIDGET_SIZES } from './scriptable-mock.js'
import * as FIXTURES from './fixtures.mjs'
import { cachedLastMonth, cachedTwoDaysAgo, dayOne, dayOneToday, goalRisk, goalSafe, goalShort, goodDay, lastDay, legacyV1, NOW_DAY_ONE, NOW_DAY_ONE_TODAY, NOW_GOOD_DAY, NOW_LAST_DAY, NOW_TODAY, NOW_WEEKDAY, NOW_WEEKEND, overBudget, overToday, spentToday, tightBudget, underBudget, weekend } from './fixtures.mjs'

const CODE = readFileSync(resolve(process.cwd(), 'src/widget/finance-widget.js'), 'utf8')
const LOADER = { API_URL: 'https://finance.autonomis.co/api/finance/widget', APP_URL: 'https://finance.autonomis.co/finance', WIDGET_TOKEN: 'phone-token-0123456789', API_KEY: '' }
const FAMILIES = Object.keys(WIDGET_SIZES)
const URL_RE = /^https:\/\/finance\.autonomis\.co\/finance/

type Options = Parameters<typeof createScriptableEnv>[0]
async function render(options: Options, loader: Record<string, unknown> = LOADER) {
  const env = createScriptableEnv({ now: NOW_WEEKDAY, ...options })
  const { widget, presented } = await env.run(CODE, loader)
  expect(widget).toBeTruthy()
  return { env, widget, presented, ...inspectWidget(widget) }
}

const CASES: Array<[string, Options]> = [
  ['today: goal safe, budgets over', { fixture: goalSafe, now: NOW_TODAY }],
  ['today: spent some', { fixture: spentToday, now: NOW_TODAY }],
  ['today: over today', { fixture: overToday, now: NOW_TODAY }],
  ['today: goal at risk', { fixture: goalRisk, now: NOW_TODAY }],
  ['today: good day', { fixture: goodDay, now: NOW_GOOD_DAY }],
  ['today: last day', { fixture: lastDay, now: NOW_LAST_DAY }],
  ['today: day 1', { fixture: dayOneToday, now: NOW_DAY_ONE_TODAY }],
  ['today: forecast short', { fixture: goalShort, now: NOW_TODAY }],
  ['today: cached from last month', { fail: true, cache: goalSafe, now: '2026-11-01T08:00:00-06:00' }],
  ['today: cached from yesterday', { fail: true, cache: goalSafe, now: '2026-10-30T08:00:00-06:00' }],
  ['no today: over budget', { fixture: overBudget }],
  ['no today: under budget', { fixture: underBudget }],
  ['no today: tight', { fixture: tightBudget }],
  ['no today: weekend', { fixture: weekend, now: NOW_WEEKEND }],
  ['no today: day 1', { fixture: dayOne, now: NOW_DAY_ONE }],
  ['legacy v1 payload', { fixture: legacyV1 }],
  ['offline with cache', { fail: true, cache: goalSafe, now: NOW_TODAY }],
  ['offline, cache from 2 days ago', { fail: true, cache: cachedTwoDaysAgo }],
  ['offline, cache from last month', { fail: true, cache: cachedLastMonth }],
  ['offline, no cache', { fail: true }],
  ['401', { status: 401, fixture: { error: 'Unauthorized' } }],
  ['spanish', { fixture: goalSafe, now: NOW_TODAY, param: 'lang=es' }],
  ['spanish, risk', { fixture: goalRisk, now: NOW_TODAY, param: 'lang=es' }],
  ['goals', { fixture: goalSafe, now: NOW_TODAY, param: 'goals' }],
  ['small phone', { fixture: goalSafe, now: NOW_TODAY, screen: { width: 375, height: 667 } }],
  ['small phone, risk', { fixture: goalRisk, now: NOW_TODAY, screen: { width: 375, height: 667 } }],
  ['no screen size', { fixture: goalSafe, now: NOW_TODAY, screen: null }],
]

describe('widget harness: every family and case', () => {
  for (const family of FAMILIES) {
    for (const [name, options] of CASES) {
      it(`${family} · ${name}`, async () => {
        const r = await render({ ...options, family })
        // (d) renders without throwing and produces content
        expect(r.texts.length + r.images.length).toBeGreaterThan(0)
        // (a) every link stays inside the app
        for (const url of r.urls) expect(url).toMatch(URL_RE)
        // (b) nothing under 11pt, even after iOS shrinks it to its minimumScaleFactor
        for (const t of r.texts) {
          const min = t.font.size * Math.min(1, t.minimumScaleFactor)
          expect(min, `"${t.text}" can shrink to ${min.toFixed(1)}pt`).toBeGreaterThanOrEqual(10.999)
        }
        for (const img of r.images) {
          for (const d of drawnTextSizes(img)) expect(d.size, `drawn "${d.text}" is ${d.size.toFixed(1)}pt`).toBeGreaterThanOrEqual(11)
        }
        // (e) lock-screen families never paint a background
        if (family.startsWith('accessory')) expect(r.backgrounds).toHaveLength(0)
        if (family === 'accessoryInline') expect(r.texts).toHaveLength(1)
        expect(r.widget.refreshAfterDate).toBeInstanceOf(Date)
      })
    }
  }
})

const T = (options: Options) => ({ now: NOW_TODAY, ...options })

describe('widget content: the daily plan', () => {
  it('leads every family with today\'s goal-safe number and names the target it protects', async () => {
    const small = await render(T({ fixture: goalSafe, family: 'small' }))
    expect(small.allText).toContain('You can spend today')
    expect(small.allText).toContain('$1,880')
    // The month's WEST target, never a blanket "on target" for every goal.
    expect(small.allText).toContain('WEST Oct target safe')
    expect(small.allText).not.toContain('stays on target')
    expect(small.allText).toContain('WEST · Oct')
    expect(small.allText).toContain('105%')
    const medium = await render(T({ fixture: goalSafe, family: 'medium' }))
    expect(medium.allText).toContain('Thu Oct 29')
    expect(medium.allText).toContain('3 days left')
    // The goal side shows where the allowance comes from: 3 × $1,880 ≈ $5.6k.
    expect(medium.allText).toContain('$5.6k free for 3 days')
    expect(medium.allText).not.toMatch(/ahead/)
    const rect = await render(T({ fixture: goalSafe, family: 'accessoryRectangular' }))
    expect(rect.allText).toContain('$1,880')
    expect(rect.allText).toContain('left today')
    expect(rect.allText).toContain('WEST 105%')
    const inline = await render(T({ fixture: goalSafe, family: 'accessoryInline' }))
    expect(inline.allText).toBe('$1,880 left today · WEST 105%')
    const circ = await render(T({ fixture: goalSafe, family: 'accessoryCircular' }))
    expect(circ.images[0].image.texts.map((t: { text: string }) => t.text)).toEqual(['$1.9k', 'today'])
  })

  it('a short forecast that today\'s room still fixes reads as a recovery, not "safe"', async () => {
    const small = await render(T({ fixture: goalShort, family: 'small' }))
    expect(small.allText).toContain('Gets WEST Oct to target')
    expect(small.allText).not.toContain('target safe')
    const medium = await render(T({ fixture: { ...goalShort, today: { ...goalShort.today, nudge: { kind: 'short', amount: 2500, url: '/finance/investments?tab=Real%20Estate' } } }, family: 'medium' }))
    expect(medium.allText).toContain('At your usual pace WEST ends $2.5k short. Today’s room closes it.')
    expect(medium.allText).not.toContain('Skip extras')
  })

  it('never puts the month\'s budget overrun in the hero when the goal is safe', async () => {
    for (const family of FAMILIES) {
      const r = await render(T({ fixture: goalSafe, family }))
      expect(r.allText).not.toMatch(/Over budget|\$5,569|\$5\.6k over/)
    }
  })

  it('celebrates momentum: the streak, yesterday and the week', async () => {
    const good = await render({ fixture: goodDay, family: 'medium', now: NOW_GOOD_DAY })
    expect(good.allText).toContain('10-day streak')
    expect(good.allText).toMatch(/✓ Yesterday \$[\d.,k]+ under/)
    const small = await render({ fixture: goodDay, family: 'small', now: NOW_GOOD_DAY })
    expect(small.allText).toContain('10-day streak')
    const large = await render(T({ fixture: goalSafe, family: 'large' }))
    expect(large.allText).toContain('This week · 4 of 6 on plan')
    expect(large.allText).toContain('Yesterday $33 over')
    expect(large.allText).toMatch(/^F\nS\nS\nM\nT\nW\nT$/m)
    const es = await render(T({ fixture: goalSafe, family: 'large', param: 'lang=es' }))
    // Unambiguous Spanish initials: X for miércoles.
    expect(es.allText).toMatch(/^V\nS\nD\nL\nM\nX\nJ$/m)
    expect(es.allText).toContain('Ayer, $33 de más')
    const esGood = await render({ fixture: goodDay, family: 'medium', now: NOW_GOOD_DAY, param: 'lang=es' })
    expect(esGood.allText).toMatch(/✓ Ayer, \$[\d.,k]+ por debajo/)
  })

  it('shows what is left and how much is spent once the day has spending', async () => {
    const r = await render(T({ fixture: spentToday, family: 'medium' }))
    expect(r.allText).toContain('Left today')
    expect(r.allText).toContain('$1,240')
    expect(r.allText).toContain('$640 of $1.9k spent')
  })

  it('past today\'s room: tomorrow\'s figure, calm amber, on every family', async () => {
    const r = await render(T({ fixture: overToday, family: 'medium' }))
    expect(r.allText).toContain('Tomorrow, up to')
    expect(r.allText).toContain('$1,520')
    expect(r.allText).toContain('$720 over today')
    expect(r.allText).toContain('Over today')
    // Lock screens lead with tomorrow too, never "$720 over".
    const rect = await render(T({ fixture: overToday, family: 'accessoryRectangular' }))
    expect(rect.allText).toContain('$1,520')
    expect(rect.allText).toContain('tomorrow')
    expect(rect.allText).not.toContain('over')
    const inline = await render(T({ fixture: overToday, family: 'accessoryInline' }))
    expect(inline.allText).toBe('$1,520 tomorrow · WEST 102%')
    const circ = await render(T({ fixture: overToday, family: 'accessoryCircular' }))
    expect(circ.images[0].image.texts.map((t: { text: string }) => t.text)).toEqual(['$1.5k', 'Fri'])
    const es = await render(T({ fixture: overToday, family: 'accessoryInline', param: 'lang=es' }))
    expect(es.allText).toBe('$1,520 mañana · WEST 102%')
    const esMedium = await render(T({ fixture: overToday, family: 'medium', param: 'lang=es' }))
    expect(esMedium.allText).toContain('$720 de más hoy')
    const last = await render({ fixture: { ...overToday, today: { ...overToday.today, tomorrow: null } }, family: 'small', now: NOW_TODAY })
    expect(last.allText).toContain('Past today’s room')
    expect(last.allText).toContain('WEST Oct target still safe')
  })

  it('a goal at risk always carries today\'s recovery step, in every family, under one name', async () => {
    for (const family of ['small', 'medium', 'large', 'accessoryRectangular', 'accessoryInline']) {
      const r = await render(T({ fixture: goalRisk, family }))
      expect(r.allText, family).toContain('No-spend day')
      if (family !== 'accessoryInline') expect(r.allText, family).toContain('lifts WEST to 95%')
      expect(r.allText, family).not.toMatch(/Save day|keeps WEST/)
    }
    // The nudge is the next bill, not "keep Other at $0" on top of a no-spend day.
    const medium = await render(T({ fixture: goalRisk, family: 'medium' }))
    expect(medium.allText).toContain('Rent +7 is due Sun · $48k. Keep it in the account.')
    expect(medium.allText).not.toContain('past its budget')
    const old = await render(T({ fixture: { ...goalRisk, today: { ...goalRisk.today, nudge: { kind: 'skip', category: 'Other', url: '/finance/budgets' } } }, family: 'medium' }))
    expect(old.allText).not.toContain('past its budget')
    const es = await render(T({ fixture: goalRisk, family: 'small', param: 'lang=es' }))
    expect(es.allText).toContain('Día sin gastos')
    expect(es.allText).toContain('sube WEST a 95%')
  })

  it('words today\'s nudge on the phone from its kind (EN and ES)', async () => {
    const skip = await render(T({ fixture: goalSafe, family: 'medium' }))
    expect(skip.allText).toContain('Other is past its budget. Keep it at $0 today.')
    const skipEs = await render(T({ fixture: goalSafe, family: 'medium', param: 'lang=es' }))
    // Everyday category names read natively in Spanish.
    expect(skipEs.allText).toContain('Otros ya pasó su presupuesto. Hoy déjalo en $0.')
    const fits = await render({ fixture: goodDay, family: 'large', now: NOW_GOOD_DAY })
    expect(fits.allText).toContain('Dining Out has $8.9k left. Dinner out tonight fits.')
    const due = await render({ fixture: lastDay, family: 'medium', now: NOW_LAST_DAY })
    expect(due.allText).toContain('Rent +7 is due tomorrow · $48k. Keep it in the account.')
    const nudge = (n: Record<string, unknown>) => ({ ...goalSafe, today: { ...goalSafe.today, nudge: n } })
    const easy = await render(T({ fixture: nudge({ kind: 'easy', category: 'Dining Out', left: 870, days: 3, url: '/finance/budgets' }), family: 'medium' }))
    expect(easy.allText).toContain('Dining Out has $870 for 3 days. Cook at home tonight.')
    const easyEs = await render(T({ fixture: nudge({ kind: 'easy', category: 'Dining Out', left: 870, days: 3, url: '/finance/budgets' }), family: 'medium', param: 'lang=es' }))
    expect(easyEs.allText).toContain('Comer fuera tiene $870 para 3 días. Hoy cocinen en casa.')
    const ahead = await render(T({ fixture: nudge({ kind: 'ahead', amount: 4258, url: '/finance/investments?tab=Real%20Estate' }), family: 'medium', param: 'lang=es' }))
    expect(ahead.allText).toContain('A su ritmo, WEST cierra el mes con $4.3k a favor. Sigan así.')
    const year = await render(T({ fixture: nudge({ kind: 'year', year: 2026, amount: 157201, url: '/finance/goals' }), family: 'medium' }))
    expect(year.allText).toContain('The 2026 goals are $157k short. What today doesn’t spend goes there.')
    expect(year.urls).toContain('https://finance.autonomis.co/finance/goals')
    // An unknown kind or an outside link never renders as a link out of the app.
    const odd = await render(T({ fixture: nudge({ kind: 'skip', category: 'Other', url: 'https://evil.example/x' }), family: 'medium' }))
    for (const url of odd.urls) expect(url).toMatch(URL_RE)
    const unknown = await render(T({ fixture: nudge({ kind: 'mystery', url: '/finance' }), family: 'medium' }))
    expect(unknown.allText).not.toContain('undefined')
  })

  it('lists the goals on large, saying in words when the year goals are short', async () => {
    const r = await render(T({ fixture: goalSafe, family: 'large' }))
    for (const s of ['WEST · Oct', '$5.6k free for 3 days', '2026 goals', '62%', '$157k short by Dec', 'WEST home', '14 mo to keys', 'Emergency fund', '5.8 mo covered']) expect(r.allText).toContain(s)
    // Never the "57% covered by Dec" share next to 62%, and never the monthly needs.
    expect(r.allText).not.toMatch(/covered by Dec|\/mo\b|needs/)
    const onTrack = await render(T({ fixture: { ...goalSafe, today: { ...goalSafe.today, goals: goalSafe.today.goals.map((g: { kind: string }) => g.kind === 'year' ? { ...g, on_track: true, shortfall: 0 } : g) } }, family: 'large' }))
    expect(onTrack.allText).toContain('on track for Dec')
    const es = await render(T({ fixture: goalSafe, family: 'large', param: 'lang=es' }))
    for (const s of ['Metas 2026', 'faltan $157k a dic', 'Depa WEST', 'Fondo de emergencia', 'entrega en 14 meses', '$5.6k libres en 3 días']) expect(es.allText).toContain(s)
  })

  it('keeps the next bills on large, flagging tomorrow\'s', async () => {
    const r = await render(T({ fixture: goalSafe, family: 'large' }))
    expect(r.allText).toContain('Coming up')
    expect(r.allText).toContain('Rent +7')
    expect(r.allText).toContain('$48k')
    const last = await render({ fixture: lastDay, family: 'large', now: NOW_LAST_DAY })
    expect(last.allText).toContain('Tomorrow')
    const later = await render({ fail: true, cache: goalSafe, family: 'large', now: '2026-11-02T08:00:00-06:00' })
    expect(later.allText).not.toContain('Rent')
    expect(later.allText).toContain('Seguro sportage')
  })

  it('day 1 on the goal path: a fresh room, an empty week, no history lines', async () => {
    const medium = await render({ fixture: dayOneToday, family: 'medium', now: NOW_DAY_ONE_TODAY })
    expect(medium.allText).toContain('You can spend today')
    expect(medium.allText).toContain('$2,060')
    expect(medium.allText).toContain('WEST Nov target safe')
    expect(medium.allText).not.toMatch(/Yesterday|streak/)
    const large = await render({ fixture: dayOneToday, family: 'large', now: NOW_DAY_ONE_TODAY })
    expect(large.allText).toContain('This week')
    expect(large.allText).not.toContain('on plan')
  })

  it('deep-links each region inside /finance', async () => {
    const r = await render(T({ fixture: goalSafe, family: 'large' }))
    expect(r.urls).toEqual(expect.arrayContaining([
      'https://finance.autonomis.co/finance',
      'https://finance.autonomis.co/finance/budgets',
      'https://finance.autonomis.co/finance/transactions',
      'https://finance.autonomis.co/finance/investments?tab=Real%20Estate',
      'https://finance.autonomis.co/finance/goals',
      'https://finance.autonomis.co/finance/subscriptions',
    ]))
    const small = await render(T({ fixture: goalSafe, family: 'small' }))
    expect(small.widget.url).toBe('https://finance.autonomis.co/finance')
    const goals = await render(T({ fixture: goalSafe, family: 'small', param: 'goals' }))
    expect(goals.widget.url).toBe('https://finance.autonomis.co/finance/investments?tab=Real%20Estate')
    const quick = await render(T({ fixture: goalSafe, family: 'accessoryRectangular', param: 'quickadd' }))
    expect(quick.widget.url).toBe('https://finance.autonomis.co/finance/transactions?add=1')
  })

  it('the "goals" parameter puts the WEST month first, with what it leaves for the days left', async () => {
    const small = await render(T({ fixture: goalSafe, family: 'small', param: 'goals' }))
    expect(small.allText.split('\n').slice(0, 3)).toEqual(['WEST · Oct', '105%', '$5.6k free for 3 days'])
    const circ = await render(T({ fixture: goalSafe, family: 'accessoryCircular', param: 'goals' }))
    expect(circ.images[0].image.texts.map((t: { text: string }) => t.text)).toEqual(['105%', 'WEST'])
  })

  it('drops the streak on narrow (SE) lock screens', async () => {
    const r = await render({ fixture: goodDay, family: 'accessoryRectangular', now: NOW_GOOD_DAY, screen: { width: 375, height: 667 } })
    expect(r.allText).toContain('WEST 112%')
    expect(r.allText).not.toContain('streak')
    const wide = await render({ fixture: goodDay, family: 'accessoryRectangular', now: NOW_GOOD_DAY })
    expect(wide.allText).toContain('WEST 112% · 10-day streak')
  })
})

describe('widget content: offline, errors and older payloads', () => {
  it('a 401 shows the re-install message, even with cached numbers', async () => {
    for (const family of ['medium', 'small', 'accessoryRectangular']) {
      const r = await render(T({ status: 401, cache: goalSafe, family }))
      expect(r.allText).toContain('Re-install the widget from Family › Phone widget')
      expect(r.allText).not.toContain('$1,880')
    }
  })

  it('serves cached numbers with an amber stamp when offline', async () => {
    const r = await render(T({ fail: true, cache: goalSafe, family: 'medium' }))
    expect(r.allText).toContain('$1,880')
    expect(r.allText).toContain('⚠︎ As of 9:44 AM')
    expect(r.allText).toContain('Other is past its budget')
    // A same-day cache is still today's plan: the large widget keeps its week row.
    const large = await render(T({ fail: true, cache: goalSafe, family: 'large' }))
    expect(large.allText).toContain('This week · 4 of 6 on plan')
    const rectSame = await render(T({ fail: true, cache: goalSafe, family: 'accessoryRectangular' }))
    expect(rectSame.allText).toContain('left today')
    expect(rectSame.allText).toContain('⚠︎ 9:44 AM · WEST 105%')
    const small = await render(T({ fail: true, cache: goalSafe, family: 'small' }))
    expect(small.allText).toContain('⚠︎ As of 9:44 AM')
    const old = await render({ fail: true, cache: cachedTwoDaysAgo, family: 'medium' })
    expect(old.allText).toContain('⚠︎ As of Mon 9:15 AM')
    const oldRect = await render({ fail: true, cache: cachedTwoDaysAgo, family: 'accessoryRectangular' })
    expect(oldRect.allText).toContain('⚠︎ Mon 9:15 AM')
    // Never an unlabelled figure: the cached room carries its day.
    expect(oldRect.allText).toContain('Mon: up to')
    const none = await render({ fail: true, family: 'medium' })
    expect(none.allText).toContain('Connect once to load your numbers')
  })

  it('never shows yesterday\'s plan as today\'s room', async () => {
    const r = await render({ fail: true, cache: goalSafe, family: 'medium', now: '2026-10-30T08:00:00-06:00' })
    expect(r.allText).toContain('Thu: up to')
    expect(r.allText).not.toMatch(/You can spend today|Left today|3-day streak|Yesterday/)
    // Yesterday's nudge is not today's advice.
    expect(r.allText).not.toContain('Keep it at $0 today')
    const rect = await render({ fail: true, cache: goalSafe, family: 'accessoryRectangular', now: '2026-10-30T08:00:00-06:00' })
    expect(rect.allText).toContain('⚠︎ Thu 9:44 AM')
    expect(rect.allText).toContain('Thu: up to')
    expect(rect.allText).not.toContain('left today')
    const inline = await render({ fail: true, cache: goalSafe, family: 'accessoryInline', now: '2026-10-30T08:00:00-06:00' })
    expect(inline.allText).toBe('⚠︎ Thu: up to $1,880 · WEST 105%')
    const circ = await render({ fail: true, cache: goalSafe, family: 'accessoryCircular', now: '2026-10-30T08:00:00-06:00' })
    expect(circ.images[0].image.texts.map((t: { text: string }) => t.text)).toEqual(['$1.9k', '⚠︎ Thu'])
  })

  it('never labels last month\'s cached numbers as this month\'s room', async () => {
    for (const family of ['small', 'medium', 'large']) {
      const r = await render({ fail: true, cache: cachedLastMonth, family })
      expect(r.allText).toContain('Last month')
      expect(r.allText).not.toMatch(/You can spend today|Left today/)
      expect(r.allText).toContain('As of Sep 30')
    }
    // A cached goal-path payload: the month's WEST result, never Oct 29's daily room.
    const NOV_1 = '2026-11-01T08:00:00-06:00'
    for (const family of ['small', 'medium', 'large']) {
      const r = await render({ fail: true, cache: goalSafe, family, now: NOV_1 })
      expect(r.allText, family).toContain('Last month · WEST')
      expect(r.allText, family).toContain('105%')
      expect(r.allText, family).not.toMatch(/\$1,880|target safe|You can spend/)
    }
    const inline = await render({ fail: true, cache: goalSafe, family: 'accessoryInline', now: NOV_1 })
    expect(inline.allText).toBe('⚠︎ WEST Oct 105%')
    const rect = await render({ fail: true, cache: goalSafe, family: 'accessoryRectangular', now: NOV_1 })
    expect(rect.allText).toContain('WEST Oct 105%')
    expect(rect.allText).not.toMatch(/\$1,880|left today/)
    const circ = await render({ fail: true, cache: goalSafe, family: 'accessoryCircular', now: NOV_1 })
    expect(circ.images[0].image.texts.map((t: { text: string }) => t.text)).toEqual(['105%', '⚠︎ Oct'])
  })

  it('falls back to the everyday budgets when the payload has no `today`', async () => {
    const r = await render({ fixture: underBudget, family: 'medium' })
    expect(r.allText).toContain('Left today')
    expect(r.allText).toContain('$3,225') // (14,380 left + 879 spent today) / 4 days, rounded down to $10, minus today's 879
    expect(r.allText).toContain('104%')
    const over = await render({ fixture: overBudget, family: 'medium' })
    // Calm, no "$0" hero: the budgets are spent, said in words.
    expect(over.allText).toContain('Essentials only')
    expect(over.allText).toContain('Everyday budgets are spent')
    expect(over.allText).not.toMatch(/^\$0$/m)
    expect(over.allText).toContain('Other is past its budget. Keep it at $0 today.')
    expect(over.allText).not.toContain('Over today') // no goal-based status chip on the fallback
    // The old server's WEST target is the stretch one: shown neutral, never amber "short".
    expect(over.allText).toContain('55%')
    expect(over.allText).not.toMatch(/short|faltan/)
    const v1 = await render({ fixture: legacyV1, family: 'medium' })
    expect(v1.allText).toContain('Essentials only')
    expect(v1.allText).not.toContain('cabe una cena')
    // Lock screens: "$0 left today", never "$0 over today".
    for (const family of ['accessoryInline', 'accessoryRectangular']) {
      const lock = await render({ fixture: legacyV1, family })
      expect(lock.allText, family).toContain('$0')
      expect(lock.allText, family).toContain('left today')
      expect(lock.allText, family).not.toContain('over')
    }
    const circ = await render({ fixture: legacyV1, family: 'accessoryCircular' })
    expect(circ.images[0].image.texts.map((t: { text: string }) => t.text)).toEqual(['$0', 'today'])
    // Day 1 on the fallback: no 0% forecast, just the target.
    const day1 = await render({ fixture: dayOne, family: 'medium', now: NOW_DAY_ONE })
    expect(day1.allText).not.toMatch(/\b0%|short/)
    expect(day1.allText).toContain('Target $140k')
  })

  it('shows no Mona/AI text at all (the brief is not part of the daily widget)', async () => {
    for (const family of FAMILIES) {
      const r = await render({ fixture: { ...overBudget, wolff: { top: { title: 'Sep 5–6: sí cabe una cena' } }, brief: { fresh: true, title: 'Hold Other spending', detail: '' } }, family })
      expect(r.allText).not.toMatch(/Sep 5|cabe una cena|Protege|Hold Other spending|Pause Other/)
    }
  })

  it('every v2 fixture\'s daily spend sums to the hero\'s spent', () => {
    for (const [name, f] of Object.entries(FIXTURES)) {
      const d = f as { v?: number; daily_spend?: number[]; variable?: { spent: number } }
      if (!d || typeof d !== 'object' || d.v !== 2) continue
      expect(d.daily_spend!.reduce((s, v) => s + v, 0), name).toBe(d.variable!.spent)
    }
  })

  it('every `today` fixture is internally consistent', () => {
    for (const [name, f] of Object.entries(FIXTURES)) {
      const t = (f as { today?: { allowance: number; spent: number; left: number; week: Array<{ spent: number; room: number; ok: boolean | null; today?: boolean }>; streak: number } }).today
      if (!t) continue
      expect(t.left, name).toBe(t.allowance - t.spent)
      const today = t.week[t.week.length - 1]
      expect(today, name).toMatchObject({ today: true, room: t.allowance, spent: t.spent })
      for (const d of t.week.slice(0, -1)) expect(d.ok, name).toBe(d.spent <= d.room)
    }
  })

  it('caches the last good payload and sends the read-only token', async () => {
    const r = await render(T({ fixture: goalSafe, family: 'medium' }))
    expect(JSON.parse(r.env.files.get('/lib/mona-widget-data.json') as string).today.allowance).toBe(1880)
    expect(r.env.requests[0].headers).toEqual({ 'x-widget-token': 'phone-token-0123456789' })
    expect(r.env.requests[0].timeoutInterval).toBe(10)
    const legacy = await render(T({ fixture: goalSafe, family: 'medium' }), { ...LOADER, WIDGET_TOKEN: undefined, API_KEY: 'legacy' })
    expect(legacy.env.requests[0].headers).toEqual({ 'x-api-key': 'legacy' })
  })

  it('refreshes within 30 minutes, or just after midnight', async () => {
    const r = await render({ fixture: goalSafe, family: 'medium' })
    expect(r.widget.refreshAfterDate.getTime() - new Date(NOW_WEEKDAY).getTime()).toBe(30 * 60 * 1000)
    const late = await render({ fixture: goalSafe, family: 'medium', now: '2026-10-28T23:50:00-06:00' })
    expect(late.widget.refreshAfterDate.getHours()).toBe(0)
    expect(late.widget.refreshAfterDate.getMinutes()).toBe(5)
  })

  it('previews in the app when not running in a widget', async () => {
    const r = await render(T({ fixture: goalSafe, runsInWidget: false }))
    expect(r.presented).toBe('medium')
  })
})

describe('Finance.js loader', () => {
  async function loaderResponse(env: Record<string, string | undefined>, query = 'slot=1') {
    const saved = { ...process.env }
    Object.assign(process.env, env)
    try {
      vi.resetModules()
      vi.doMock('@/lib/finance-api-auth', () => ({ authorizeFinanceRequest: async () => ({ ok: true }) }))
      const { GET } = await import('@/app/api/finance/widget-script/route')
      return await GET(new NextRequest(`https://finance.autonomis.co/api/finance/widget-script?${query}`))
    } finally {
      process.env = saved
    }
  }
  const loaderSource = async (env: Record<string, string | undefined>, query?: string) => (await loaderResponse(env, query)).text()

  it('embeds the per-phone read token, never FINANCE_API_KEY', async () => {
    const src = await loaderSource({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1,bbbbbbbbbbbbbbbb2', FINANCE_API_KEY: 'full-power-key' })
    expect(src).toContain('const WIDGET_TOKEN = "bbbbbbbbbbbbbbbb2"')
    expect(src).not.toContain('full-power-key')
    expect(() => new Function(`return (async () => {\n${src}\n})`)).not.toThrow()
  })

  it('fails closed while WIDGET_READ_TOKENS is unset, never embedding FINANCE_API_KEY', async () => {
    const res = await loaderResponse({ WIDGET_READ_TOKENS: '', FINANCE_API_KEY: 'legacy-key', WIDGET_ALLOW_LEGACY_KEY: '' })
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('legacy-key')
    const check = await loaderResponse({ WIDGET_READ_TOKENS: '', WIDGET_ALLOW_LEGACY_KEY: '' }, 'slot=0&check=1')
    expect(await check.json()).toMatchObject({ ready: false })
  })

  it('never hands Laura\u2019s slot Bernardo\u2019s token when only one is set', async () => {
    const res = await loaderResponse({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1', WIDGET_ALLOW_LEGACY_KEY: '' }, 'slot=1')
    expect(res.status).toBe(503)
    expect(await res.text()).not.toContain('aaaaaaaaaaaaaaaa1')
    const check = await loaderResponse({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1', WIDGET_ALLOW_LEGACY_KEY: '' }, 'slot=1&check=1')
    expect(await check.json()).toMatchObject({ ready: false, message: expect.stringContaining('second WIDGET_READ_TOKENS entry') })
  })

  it('embeds the legacy key only with the explicit WIDGET_ALLOW_LEGACY_KEY opt-in', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const src = await loaderSource({ WIDGET_READ_TOKENS: '', FINANCE_API_KEY: 'legacy-key', WIDGET_ALLOW_LEGACY_KEY: '1' })
    expect(src).toContain('const API_KEY = "legacy-key"')
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('caches the widget code and revalidates with the ETag at most every 6h', async () => {
    const src = await loaderSource({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1' }, 'slot=0')
    const files = new Map<string, string>()
    const calls: Array<{ url: string; headers: Record<string, string> }> = []
    const respond = ({ url, headers }: { url: string; headers: Record<string, string> }) => {
      calls.push({ url, headers })
      if (url.endsWith('/widget-code')) {
        return headers['If-None-Match'] === '"v1"' ? { status: 304, body: '' } : { status: 200, body: CODE, headers: { etag: '"v1"' } }
      }
      return { status: 200, body: JSON.stringify(goalSafe) }
    }
    const run = async (now: string) => {
      calls.length = 0
      const env = createScriptableEnv({ family: 'medium', now, files, respond })
      return { ...(await env.run(src)), calls: [...calls] }
    }

    const first = await run('2026-10-28T09:00:00-06:00')
    expect(first.calls.map(c => c.url)).toEqual(['https://finance.autonomis.co/api/finance/widget-code', 'https://finance.autonomis.co/api/finance/widget'])
    expect(first.calls[0].headers['x-widget-token']).toBe('aaaaaaaaaaaaaaaa1')
    expect(inspectWidget(first.widget).allText).toContain('$1,880')

    const soon = await run('2026-10-28T12:00:00-06:00')
    expect(soon.calls.map(c => c.url)).toEqual(['https://finance.autonomis.co/api/finance/widget'])

    const later = await run('2026-10-28T15:30:00-06:00')
    expect(later.calls[0].headers['If-None-Match']).toBe('"v1"')
    expect(inspectWidget(later.widget).allText).toContain('$1,880')
  })

  it('shows the re-install notice when the token is revoked before any code is cached', async () => {
    const src = await loaderSource({ WIDGET_READ_TOKENS: 'aaaaaaaaaaaaaaaa1' }, 'slot=0')
    const env = createScriptableEnv({ family: 'small', respond: () => ({ status: 401, body: '{"error":"Unauthorized"}' }) })
    const { widget } = await env.run(src)
    expect(inspectWidget(widget).allText).toContain('Re-install the widget')
  })
})
