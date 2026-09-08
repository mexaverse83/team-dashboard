// Synthetic, isolated visual regression review. Start a dev server with
// NEXT_PUBLIC_AUTH_BYPASS=1 and a dummy Supabase URL, then run this script.
// No finance API or Supabase request reaches a real account.
import puppeteer from 'puppeteer-core'
import { readFileSync, mkdirSync } from 'node:fs'
import { mexicoCityDateParts } from '../src/lib/insights-prompt.mjs'

const origin = process.argv[2] || 'http://localhost:3210'
const output = process.argv[3] || 'artifacts/finance-review-2026-09'
const chrome = process.env.CHROME_BIN || '/home/bernardo/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Use a local fixture server')
const fixture = JSON.parse(readFileSync('tests/fixtures/finance-review.json', 'utf8'))
const mx = mexicoCityDateParts()
const month = `${mx.year}-${String(mx.month).padStart(2, '0')}`
fixture.summary.current_month.month = month
fixture.summary.current_month.day_of_month = mx.day
fixture.west.savings_plan.months[0].month = month
fixture.transactions.forEach(tx => { tx.transaction_date = `${month}-01` })
mkdirSync(output, { recursive: true })
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setRequestInterception(true)
  const calls = []
  page.on('request', request => {
    const url = new URL(request.url())
    let data
    if (url.pathname.startsWith('/api/')) {
      calls.push(url.pathname)
      data = url.pathname.endsWith('/summary') ? fixture.summary
        : url.pathname.endsWith('/forecast') ? fixture.forecast
        : url.pathname.endsWith('/net-worth') ? fixture.netWorth
        : url.pathname.endsWith('/west-projection') ? fixture.west
        : url.pathname.endsWith('/insights') ? fixture.insights
        : url.pathname.endsWith('/wolff-chat') ? { messages: [] } : {}
    } else if (url.pathname.startsWith('/rest/v1/')) {
      data = url.pathname.endsWith('finance_transactions') ? fixture.transactions
        : url.pathname.endsWith('finance_categories') ? fixture.categories : []
    } else if (url.origin !== new URL(origin).origin && !url.protocol.startsWith('data')) {
      return request.abort()
    }
    return data === undefined ? request.continue() : request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, OPTIONS' }, body: JSON.stringify(data) })
  })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 })
    await page.goto(`${origin}/finance`, { waitUntil: 'networkidle0' })
    await page.waitForFunction(() => document.body.textContent.includes('net this month'))
    await page.screenshot({ path: `${output}/dashboard-${width}.png`, fullPage: true })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    if (overflow) throw new Error(`Horizontal overflow at ${width}px`)
    console.log(`${width}px: dashboard loaded, no page overflow`)
  }
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 })
  await page.goto(`${origin}/finance`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.body.textContent.includes('net this month'))
  await page.evaluate(() => document.querySelector('[aria-controls="cash-flow-details"]').click())
  await page.waitForSelector('#cash-flow-details .recharts-wrapper')
  await page.screenshot({ path: `${output}/details-390.png`, fullPage: true })
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Expanded details overflow')
  await page.goto(`${origin}/finance/transactions?add=1`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[role="dialog"]')
  const modal = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    const rect = dialog.getBoundingClientRect()
    return { focusInside: dialog.contains(document.activeElement), fitsWidth: rect.left >= 0 && rect.right <= innerWidth }
  })
  if (!modal.focusInside || !modal.fitsWidth) throw new Error(`Mobile modal failed: ${JSON.stringify(modal)}`)
  await page.screenshot({ path: `${output}/entry-390.png`, fullPage: true })
  if (errors.length) throw new Error(errors.join('\n'))
  console.log(JSON.stringify({ pageErrors: errors.length, summaryRequests: calls.filter(x => x.endsWith('/summary')).length, widgetRequests: calls.filter(x => x.endsWith('/widget')).length, modal }))
} finally {
  await browser.close()
}
