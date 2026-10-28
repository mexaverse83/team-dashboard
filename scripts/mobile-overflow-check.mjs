import puppeteer from 'puppeteer-core'
import { execSync } from 'node:child_process'
const bin = execSync("ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome | tail -1").toString().trim()
const browser = await puppeteer.launch({ executablePath: bin, args: ['--no-sandbox'] })
const page = await browser.newPage()
// Read-only: only GETs (and their CORS preflights) leave the browser.
await page.setRequestInterception(true)
page.on('request', req => {
  const preflightForGet = req.method() === 'OPTIONS' && /^(GET|HEAD)$/i.test(req.headers()['access-control-request-method'] || '')
  if (req.method() !== 'GET' && !preflightForGet) req.abort()
  else req.continue()
})
if (process.env.THEME) await page.evaluateOnNewDocument(t => { try { localStorage.setItem('mona:theme', t) } catch {} }, process.env.THEME)
await page.setViewport({ width: Number(process.argv[4] || 390), height: 844 })
await page.goto(process.argv[2], { waitUntil: 'networkidle0', timeout: 60000 }).catch(() => {})
await new Promise(r => setTimeout(r, 2500))
const result = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth
  let count = 0
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect()
    if (r.right > vw + 2) count++
  })
  return { vw, scrollW: document.documentElement.scrollWidth, count }
})
console.log(JSON.stringify(result))
if (process.argv[3]) await page.screenshot({ path: process.argv[3], fullPage: true })
await browser.close()
