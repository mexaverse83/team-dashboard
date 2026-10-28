// When may an LLM brief still be shown as current advice? (W1, UX-01, F01, AUTO-01)
// Day-scoped categories (WIDGET / WEEK / HOUSEHOLD) speak about "today" and
// "this week", so they expire at Mexico City midnight. Everything else may be
// shown for up to 72h. Nothing from a different month is ever current.
import { mexicoCityDateParts } from './dates'

export const DAY_SCOPED_INSIGHT_CATEGORIES: ReadonlySet<string> = new Set(['WIDGET', 'WEEK', 'HOUSEHOLD'])

export const INSIGHT_MAX_AGE_MS = 72 * 60 * 60 * 1000

export interface InsightUsableOptions {
  now?: Date
  /** Insight category ('WIDGET', 'WEEK', …). Omitted → the stricter day-scoped rule. */
  category?: string | null
  /** The cache row's period_month ('YYYY-MM' or 'YYYY-MM-01'), when known. */
  periodMonth?: string | null
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function mxDayKey(d: Date): string {
  const p = mexicoCityDateParts(d)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

export function isInsightUsable(
  generatedAt: string | Date | null | undefined,
  { now = new Date(), category, periodMonth }: InsightUsableOptions = {},
): boolean {
  const generated = toDate(generatedAt)
  if (!generated) return false

  const today = mxDayKey(now)
  const generatedDay = mxDayKey(generated)
  if (generatedDay > today) return generated.getTime() - now.getTime() < 5 * 60 * 1000 // tolerate small clock skew only
  if (generatedDay.slice(0, 7) !== today.slice(0, 7)) return false
  if (periodMonth && String(periodMonth).slice(0, 7) !== today.slice(0, 7)) return false

  const dayScoped = !category || DAY_SCOPED_INSIGHT_CATEGORIES.has(String(category).toUpperCase())
  if (dayScoped) return generatedDay === today
  return now.getTime() - generated.getTime() <= INSIGHT_MAX_AGE_MS
}

export type FreshnessLevel = 'fresh' | 'aging' | 'stale' | 'missing'

/** For the freshness dot: green < 24h, amber < 72h, grey otherwise. */
export function insightFreshnessLevel(generatedAt: string | Date | null | undefined, now: Date = new Date()): FreshnessLevel {
  const generated = toDate(generatedAt)
  if (!generated) return 'missing'
  const age = now.getTime() - generated.getTime()
  if (age < 24 * 60 * 60 * 1000) return 'fresh'
  if (age < INSIGHT_MAX_AGE_MS) return 'aging'
  return 'stale'
}

export function insightAgeHours(generatedAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  const generated = toDate(generatedAt)
  return generated ? Math.max(0, (now.getTime() - generated.getTime()) / 3_600_000) : null
}

/** Split a cached brief into what may be shown as current and what belongs behind "Show last brief". */
export function partitionInsights<T extends { category?: string | null }>(
  insights: readonly T[],
  generatedAt: string | Date | null | undefined,
  opts: Omit<InsightUsableOptions, 'category'> = {},
): { usable: T[]; archived: T[] } {
  const usable: T[] = []
  const archived: T[] = []
  for (const insight of insights) {
    if (isInsightUsable(generatedAt, { ...opts, category: insight.category ?? 'OTHER' })) usable.push(insight)
    else archived.push(insight)
  }
  return { usable, archived }
}
