import { describe, expect, it } from 'vitest'
import { insightAgeHours, insightFreshnessLevel, isInsightUsable, partitionInsights } from '@/lib/insight-freshness'

const OCT_28_NOON_CDMX = new Date('2026-10-28T18:00:00Z')

describe('isInsightUsable', () => {
  it('the Sep 4 brief is not usable on Oct 28 (any category)', () => {
    const generated = '2026-09-04T13:30:53Z'
    for (const category of ['WIDGET', 'WEEK', 'HOUSEHOLD', 'BUDGET', undefined]) {
      expect(isInsightUsable(generated, { now: OCT_28_NOON_CDMX, category })).toBe(false)
    }
  })

  it('day-scoped categories expire at Mexico City midnight', () => {
    const thisMorning = '2026-10-28T13:30:00Z' // 07:30 CDMX
    expect(isInsightUsable(thisMorning, { now: OCT_28_NOON_CDMX, category: 'WIDGET' })).toBe(true)
    expect(isInsightUsable(thisMorning, { now: OCT_28_NOON_CDMX, category: 'week' })).toBe(true)
    const yesterdayEvening = '2026-10-28T01:00:00Z' // Oct 27, 19:00 CDMX (already Oct 28 in UTC)
    expect(isInsightUsable(yesterdayEvening, { now: OCT_28_NOON_CDMX, category: 'HOUSEHOLD' })).toBe(false)
  })

  it('other categories last up to 72h within the same month', () => {
    expect(isInsightUsable('2026-10-26T13:30:00Z', { now: OCT_28_NOON_CDMX, category: 'BUDGET' })).toBe(true)
    expect(isInsightUsable('2026-10-25T13:30:00Z', { now: OCT_28_NOON_CDMX, category: 'BUDGET' })).toBe(false)
  })

  it('never crosses a month boundary', () => {
    const nov1 = new Date('2026-11-01T15:00:00Z')
    expect(isInsightUsable('2026-10-31T15:00:00Z', { now: nov1, category: 'BUDGET' })).toBe(false)
    expect(isInsightUsable('2026-10-28T13:30:00Z', { now: OCT_28_NOON_CDMX, category: 'BUDGET', periodMonth: '2026-09-01' })).toBe(false)
    expect(isInsightUsable('2026-10-28T13:30:00Z', { now: OCT_28_NOON_CDMX, category: 'BUDGET', periodMonth: '2026-10-01' })).toBe(true)
  })

  it('missing/invalid/future timestamps are not usable', () => {
    expect(isInsightUsable(null, { now: OCT_28_NOON_CDMX })).toBe(false)
    expect(isInsightUsable('not a date', { now: OCT_28_NOON_CDMX })).toBe(false)
    expect(isInsightUsable('2026-10-30T12:00:00Z', { now: OCT_28_NOON_CDMX })).toBe(false)
  })
})

describe('freshness helpers', () => {
  it('levels: fresh < 24h, aging < 72h, stale otherwise', () => {
    expect(insightFreshnessLevel('2026-10-28T13:30:00Z', OCT_28_NOON_CDMX)).toBe('fresh')
    expect(insightFreshnessLevel('2026-10-26T20:00:00Z', OCT_28_NOON_CDMX)).toBe('aging')
    expect(insightFreshnessLevel('2026-09-04T13:30:53Z', OCT_28_NOON_CDMX)).toBe('stale')
    expect(insightFreshnessLevel(null, OCT_28_NOON_CDMX)).toBe('missing')
    expect(insightAgeHours('2026-10-28T12:00:00Z', OCT_28_NOON_CDMX)).toBe(6)
  })

  it('partitions a brief into usable and archived items', () => {
    const items = [
      { title: 'Today', category: 'WIDGET' },
      { title: 'Trend', category: 'PATTERN' },
      { title: 'No category' },
    ]
    const twoDaysAgo = '2026-10-26T19:00:00Z'
    const { usable, archived } = partitionInsights(items, twoDaysAgo, { now: OCT_28_NOON_CDMX })
    expect(usable.map(i => i.title)).toEqual(['Trend', 'No category'])
    expect(archived.map(i => i.title)).toEqual(['Today'])
  })
})
