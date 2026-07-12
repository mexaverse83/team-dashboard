import { describe, expect, it } from 'vitest'
import { normalizeInsights, parseInsightsResponse, remainingCalendarWeekEnvelope } from '@/lib/insights-prompt.mjs'

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
