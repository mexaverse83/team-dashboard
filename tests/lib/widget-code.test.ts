import { describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const routePath = resolve(process.cwd(), 'src/app/api/finance/widget-code/route.ts')
const source = readFileSync(routePath, 'utf8')

function embeddedScript() {
  const startMarker = 'const script = `'
  const endMarker = '`\n\n  return new NextResponse(script'
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return source.slice(start + startMarker.length, end)
}

describe('medium Scriptable widget', () => {
  it('keeps the generated Scriptable payload syntactically valid', () => {
    const script = embeddedScript()
    expect(() => new Function(`return (async () => {\n${script}\n})`)).not.toThrow()
  })

  it('prioritizes the household decision hierarchy', () => {
    const script = embeddedScript()
    const directive = script.indexOf("TODAY'S MOVE")
    const extra = script.indexOf('EXTRA TODAY')
    const week = script.indexOf('THROUGH SUNDAY')
    const goal = script.indexOf("west ? 'WEST PACE' : 'GOAL PACE'")

    expect(script).toContain('function mediumScreen')
    expect(directive).toBeGreaterThan(-1)
    expect(extra).toBeGreaterThan(directive)
    expect(week).toBeGreaterThan(extra)
    expect(goal).toBeGreaterThan(week)
    expect(script).toContain('mediumScreen(w, d, avatar)')
  })

  it('ships a lightweight dedicated Wolff avatar', () => {
    const avatar = resolve(process.cwd(), 'public/brand/wolff-widget.png')
    expect(statSync(avatar).size).toBeLessThan(100_000)
    expect(embeddedScript()).toContain('/brand/wolff-widget.png')
  })
})
