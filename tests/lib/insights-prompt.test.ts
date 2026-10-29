import { describe, expect, it } from 'vitest'
import { buildInsightsPrompt, insightsLanguage, mexicoCityDateParts, normalizeInsights, parseInsightsResponse, remainingCalendarWeekEnvelope } from '@/lib/insights-prompt.mjs'
import { CONTROLLABLE } from '@/lib/controllable-categories'

describe('mexicoCityDateParts', () => {
  // Vercel runs in UTC. At 7pm on July 25 in Mexico City the server clock has
  // already rolled to July 26, which shifted day_of_month for six hours daily
  // and skewed every pace divisor built from it.
  it('reports the household date, not the UTC date', () => {
    const parts = mexicoCityDateParts(new Date('2026-07-26T01:30:00Z'))

    expect(parts).toMatchObject({ year: 2026, month: 7, day: 25 })
  })

  it('keeps the household in the previous month across a month boundary', () => {
    // 8pm July 31 in Mexico City = August 1 in UTC.
    const parts = mexicoCityDateParts(new Date('2026-08-01T02:00:00Z'))

    expect(parts).toMatchObject({ year: 2026, month: 7, day: 31 })
  })

  it('agrees with UTC during the Mexico City morning', () => {
    const parts = mexicoCityDateParts(new Date('2026-07-25T18:00:00Z'))

    expect(parts).toMatchObject({ year: 2026, month: 7, day: 25 })
  })
})

const insight = (title: string, category: string, type = 'recommendation') => ({
  title,
  category,
  type,
  detail: `${title} detail`,
  icon: '🐺',
  priority: 'high',
})

describe('Wolff insight boundary', () => {
  it('uses only the remaining calendar-week days for the spending envelope', () => {
    expect(remainingCalendarWeekEnvelope(25_309, 20, 0)).toEqual({
      daysThroughSunday: 1,
      dailyEnvelope: 1265,
      weekEnvelope: 1265,
    })
    expect(remainingCalendarWeekEnvelope(25_309, 20, 1)).toEqual({
      daysThroughSunday: 7,
      dailyEnvelope: 1265,
      weekEnvelope: 8858,
    })
  })

  it('does not allocate beyond month end', () => {
    expect(remainingCalendarWeekEnvelope(3_000, 2, 4)).toEqual({
      daysThroughSunday: 2,
      dailyEnvelope: 1500,
      weekEnvelope: 3000,
    })
  })

  it('parses JSON wrapped in a markdown fence', () => {
    expect(parseInsightsResponse('```json\n[{"title":"Move funds"}]\n```')).toHaveLength(1)
  })

  it('caps repeated categories and the total brief size', () => {
    const result = normalizeInsights([
      insight('Today one', 'WIDGET'),
      insight('Today duplicate', 'WIDGET'),
      insight('Household', 'HOUSEHOLD'),
      insight('Projection', 'PROJECTION', 'forecast'),
      insight('Week one', 'WEEK'),
      insight('Week two', 'WEEK'),
      insight('Week three', 'WEEK'),
      insight('West one', 'WEST', 'forecast'),
      insight('West two', 'WEST'),
      insight('West three', 'WEST'),
      insight('Extra one', 'Dining'),
      insight('Extra two', 'Groceries'),
      insight('Extra three', 'Crypto'),
    ])

    expect(result).toHaveLength(9)
    expect(result.filter(item => item.category === 'WIDGET')).toHaveLength(1)
    expect(result.filter(item => item.category === 'WEEK')).toHaveLength(2)
    expect(result.filter(item => item.category === 'WEST')).toHaveLength(2)
  })

  it('deduplicates titles and truncates verbose output', () => {
    const result = normalizeInsights([
      { ...insight('Same move', 'WIDGET'), detail: 'x'.repeat(700) },
      insight('same move', 'Dining'),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].detail).toHaveLength(500)
  })
})

describe('buildInsightsPrompt', () => {
  const summary = {
    current_month: {
      month: '2026-10', day_of_month: 28, days_in_month: 31, month_progress_pct: 90, total_spent: 50_000,
      budget_vs_actual: [
        { category: 'Dining Out', spent: 4_000, budget: 6_000, pct_used: 67, status: 'ok' },
        { category: 'Rent/Mortgage', spent: 45_000, budget: 45_000, pct_used: 100, status: 'ok', is_fixed: true },
      ],
    },
    fertility_plan: { remaining_amount: 8_370, current_month_commitment: 0, monthly_gap_to_keep_goals: 10_488 },
    income: { total_monthly: 200_000 },
  }

  it('never mentions the completed fertility plan (F14)', () => {
    const prompt = buildInsightsPrompt(summary, null, { controllable: CONTROLLABLE })
    expect(prompt).not.toMatch(/fertility|treatment/i)
    expect(prompt).not.toContain('8370')
    expect(prompt).not.toContain('monthly_gap_to_keep_goals')
  })

  it('pins one output language from FINANCE_LOCALE (W11)', () => {
    expect(buildInsightsPrompt(summary, null, { lang: 'es' })).toContain('Write every title and detail in natural Mexican Spanish')
    expect(buildInsightsPrompt(summary, null, { lang: 'en-US' })).toContain('Write every title and detail in English')
    expect(insightsLanguage(undefined)).toBe('es')
  })

  it('takes the weekly coach categories from the shared CONTROLLABLE set', () => {
    const prompt = buildInsightsPrompt(summary, null, { controllable: CONTROLLABLE })
    expect(prompt).toMatch(/Dining Out: \$2,000 left/)
    expect(prompt).not.toMatch(/Rent\/Mortgage: \$0 left/)
  })
})
