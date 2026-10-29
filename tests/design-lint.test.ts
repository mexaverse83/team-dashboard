/**
 * Design guardrails (CH-20, VIS spec §8). Greps the component tree for patterns
 * that break one of the two themes or the date rules:
 *   - pastel text-*-300/400 shades (illegible on light surfaces)
 *   - raw #hex / hsl(<digit> colours in finance components (bypass the tokens)
 *   - toISOString().slice(…) date keys (shift to tomorrow after 18:00 in CDMX)
 *
 * Existing offenders are listed as a ratchet: a file may only go DOWN from its
 * baseline, and files not listed must be clean. Lower a number (or delete the
 * entry) when you migrate a file; never raise one.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(__dirname, '..')

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, exts))
    else if (exts.some(ext => name.endsWith(ext))) out.push(full)
  }
  return out
}

function countMatches(files: string[], pattern: RegExp): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const file of files) {
    const n = (readFileSync(file, 'utf8').match(pattern) || []).length
    if (n > 0) counts[relative(ROOT, file).replace(/\\/g, '/')] = n
  }
  return counts
}

function overBaseline(counts: Record<string, number>, baseline: Record<string, number>): string[] {
  return Object.entries(counts)
    .filter(([file, n]) => n > (baseline[file] ?? 0))
    .map(([file, n]) => `${file}: ${n} (allowed ${baseline[file] ?? 0})`)
}

const PASTEL_TEXT = /\btext-(?:gray|slate|zinc|neutral|stone|red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink)-(?:300|400)\b/g
const RAW_COLOR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|hsl\(\s*\d/g
// slice/substring/substr/split all cut a UTC timestamp into a (wrong) local date key.
const ISO_DATE_KEY = /toISOString\(\)\.(?:slice|substring|substr|split)\(/g

// Baselines as of Mona v2 Wave 1 (files owned by other streams at the time).
const PASTEL_BASELINE: Record<string, number> = {
  'src/components/Sidebar.tsx': 2,
  'src/components/finance/ask-wolff-client.tsx': 1,
  'src/components/finance/budget-watch.tsx': 4,
  'src/components/finance/card-statement.tsx': 1,
  'src/components/finance/command-center-client.tsx': 4,
  'src/components/finance/daily-spending-plan.tsx': 5,
  'src/components/finance/month-projection-card.tsx': 2,
  'src/components/finance/transactions-client.tsx': 17,
  'src/components/finance/wolff-widget.tsx': 3,
}

const RAW_COLOR_BASELINE: Record<string, number> = {
  'src/components/finance/command-center-client.tsx': 1,
  'src/components/finance/family-tracker.tsx': 5,
  'src/components/finance/goals-client.tsx': 8,
  'src/components/finance/installments-client.tsx': 2,
  'src/components/finance/investments-client.tsx': 5,
  'src/components/finance/month-projection-card.tsx': 1,
  'src/components/finance/overview-client.tsx': 5,
  'src/components/finance/transactions-client.tsx': 2,
  'src/components/finance/west-tracker.tsx': 10,
}

const ISO_BASELINE: Record<string, number> = {
  'src/components/finance/bills-timeline.tsx': 1,
  'src/components/finance/budget-builder-client.tsx': 1,
  'src/components/finance/crypto-client.tsx': 1,
  'src/components/finance/installments-client.tsx': 2,
  'src/components/finance/insights-client.tsx': 2,
  'src/components/finance/subscriptions-client.tsx': 4,
}

const components = walk(join(ROOT, 'src/components'), ['.tsx', '.ts'])
const financeComponents = components.filter(f => f.replace(/\\/g, '/').includes('/src/components/finance/'))

describe('design lint', () => {
  it('no new pastel text-*-300/400 shades in components', () => {
    expect(overBaseline(countMatches(components, PASTEL_TEXT), PASTEL_BASELINE)).toEqual([])
  })

  it('no new raw #hex / hsl(<digit>) colours in finance components (use tokens)', () => {
    expect(overBaseline(countMatches(financeComponents, RAW_COLOR), RAW_COLOR_BASELINE)).toEqual([])
  })

  it('no new toISOString() date-key cuts in components (use src/lib/dates.ts)', () => {
    expect(overBaseline(countMatches(components, ISO_DATE_KEY), ISO_BASELINE)).toEqual([])
  })

  it('the analysis pages and shared UI are fully clean', () => {
    const reference = components.filter(f => /\/(ui\/|finance\/(reports|audit|emergency-fund|debt)-client|finance\/(forecast-chart|owner-dot))/.test(f.replace(/\\/g, '/')))
    expect(reference.length).toBeGreaterThanOrEqual(10)
    const dirty = [
      ...Object.keys(countMatches(reference, PASTEL_TEXT)),
      ...Object.keys(countMatches(reference, RAW_COLOR)),
      ...Object.keys(countMatches(reference, ISO_DATE_KEY)),
    ]
    expect(dirty).toEqual([])
  })
})
