import { describe, expect, it } from 'vitest'
import { suggestCoveragePeriod } from '@/lib/finance-utils'

describe('transaction coverage periods', () => {
  it('keeps a first-of-month payment in the intended calendar month', () => {
    expect(suggestCoveragePeriod('2026-07-01', 'quarterly')).toEqual({
      start: '2026-04-01',
      end: '2026-06-30',
    })
  })

  it('handles coverage periods that cross a year boundary', () => {
    expect(suggestCoveragePeriod('2026-02-15', 'semi-annual')).toEqual({
      start: '2025-08-01',
      end: '2026-01-31',
    })
  })
})
