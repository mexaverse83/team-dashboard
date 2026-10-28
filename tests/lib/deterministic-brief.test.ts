import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/finance-review.json'
import { buildDeterministicBrief, deterministicBriefToInsights, type BriefSummary } from '@/lib/deterministic-brief'

const NOW = new Date('2026-10-28T18:00:00Z') // Wed Oct 28, 12:00 CDMX

function summary(over: Partial<BriefSummary> = {}): BriefSummary {
  return {
    current_month: {
      month: '2026-10',
      day_of_month: 28,
      days_in_month: 31,
      total_spent: 120_000,
      budget_vs_actual: [
        { category: 'Groceries', spent: 5_200, budget: 8_000 },
        { category: 'Dining Out', spent: 3_000, budget: 4_000 },
        { category: 'Rent/Mortgage', spent: 45_000, budget: 45_000, is_fixed: true },
      ],
    },
    month_projection: { projected_savings: 83_536 },
    income: { current_month_actual: 208_800 },
    subscriptions: { active: [] },
    ...over,
  }
}

describe('buildDeterministicBrief', () => {
  it('1. a category over 120% wins: "Pause <cat> — $X over"', () => {
    const brief = buildDeterministicBrief(summary({
      current_month: {
        ...summary().current_month!,
        budget_vs_actual: [
          { category: 'Other', spent: 3_390, budget: 1_000 },
          { category: 'Dining Out', spent: 6_000, budget: 4_000 },
          { category: 'Rent/Mortgage', spent: 60_000, budget: 45_000, is_fixed: true },
        ],
      },
    }), { now: NOW })
    expect(brief.directive.rule).toBe('over-budget')
    expect(brief.directive.title).toBe('Pause Other — $2.4k over')
    expect(brief.directive.tone).toBe('negative')
    expect(brief.directive.url).toBe('/finance/budgets?month=2026-10')
    expect(brief.source).toBe('live')
  })

  it('2. a ≥$10k bill within 3 days', () => {
    const brief = buildDeterministicBrief(summary({
      upcoming: [
        { date: '2026-11-04', label: 'Insurance', amount: 20_000, kind: 'bill' },
        { date: '2026-10-31', label: 'Rent', amount: 35_000, kind: 'bill' },
        { date: '2026-10-29', label: 'Netflix', amount: 300, kind: 'bill' },
      ],
    }), { now: NOW })
    expect(brief.directive.rule).toBe('big-bill')
    expect(brief.directive.title).toBe('Rent $35k due Sat')
    expect(brief.coach.url).toBe(`/finance/ask?prompt=${encodeURIComponent('Are we covered for Rent?')}`)
  })

  it('2b. falls back to subscriptions when summary.upcoming is absent', () => {
    const brief = buildDeterministicBrief(summary({
      subscriptions: { active: [{ name: 'Colegiatura', amount: 12_000, last_charge: '2026-10-29' }] },
    }), { now: NOW })
    expect(brief.directive.title).toBe('Colegiatura $12k due tomorrow')
  })

  it('3. WEST below capacity — never adds the 2026 goal need', () => {
    const brief = buildDeterministicBrief(summary({
      west_plan: { capacity_target: 152_583, projected_savings: 83_536, month_target: 152_583 },
    }), { now: NOW })
    expect(brief.directive.rule).toBe('west-behind')
    expect(brief.directive.title).toBe('WEST: $69k to go this month')
    expect(brief.directive.url).toBe('/finance/investments?tab=Real%20Estate')
    expect(brief.household.detail).toBe('55% of the $152.6k WEST capacity.')
  })

  it('4. on plan: signed weekly room from summary.variable', () => {
    const ok = buildDeterministicBrief(summary({ variable: { left: 6_742, through_label: 'Sun Nov 1', days_left: 4 } }), { now: NOW })
    expect(ok.directive.rule).toBe('on-plan')
    expect(ok.directive.title).toBe('On plan — $6,742 left this week')
    expect(ok.week.title).toBe('$6,742 left this week')
    expect(ok.week.through_label).toBe('Sun Nov 1')

    const over = buildDeterministicBrief(summary({ variable: { left: -5_486, through_label: 'Sat Oct 31', days_left: 4 } }), { now: NOW })
    expect(over.directive.title).toBe('Over plan — $5,486 past this week\'s room')
    expect(over.directive.tone).toBe('negative')
    expect(over.week.left).toBe(-5_486)
  })

  it('4b. without summary.variable, derives the week from controllable budgets', () => {
    const brief = buildDeterministicBrief(summary(), { now: NOW })
    // Controllable room: (8000−5200)+(4000−3000) = 3,800 over 4 days left → Wed..Sat = 4 days → all of it
    expect(brief.week.left).toBe(3_800)
    expect(brief.week.through_label).toBe('Sat Oct 31')
  })

  it('works on the review fixture and in Spanish', () => {
    const en = buildDeterministicBrief(fixture.summary as unknown as BriefSummary, { now: NOW })
    expect(en.directive.title.length).toBeGreaterThan(5)
    const es = buildDeterministicBrief(summary({ variable: { left: 1_000, through_label: 'dom 1 nov', days_left: 4 } }), { now: NOW, lang: 'es' })
    expect(es.directive.title).toBe('En plan — quedan $1,000 esta semana')
  })

  it('survives an empty summary', () => {
    const brief = buildDeterministicBrief({}, { now: NOW })
    expect(brief.directive.rule).toBe('on-plan')
    expect(brief.household.title).toBe('Projected savings $0 this month')
  })

  it('maps to WIDGET/WEEK/HOUSEHOLD insight rows', () => {
    const rows = deterministicBriefToInsights(buildDeterministicBrief(summary(), { now: NOW }))
    expect(rows.map(r => r.category)).toEqual(['WIDGET', 'WEEK', 'HOUSEHOLD'])
    expect(rows.every(r => r.source === 'live')).toBe(true)
  })
})
