import { describe, it, expect } from 'vitest'
import { dailyCounts, percentDelta } from '@/lib/utils'
import { effectiveStatus, STALE_AGENT_MS, AGENT_COLORS, agentColor, FALLBACK_AGENT_COLOR, agentConfigs } from '@/lib/agents'

describe('dailyCounts', () => {
  const now = new Date('2026-06-11T12:00:00Z')

  it('buckets timestamps into trailing days, oldest first', () => {
    const dates = [
      '2026-06-11T08:00:00Z', // today
      '2026-06-11T01:00:00Z', // today
      '2026-06-10T13:00:00Z', // yesterday
      '2026-06-05T13:00:00Z', // 6 days ago (oldest bucket)
    ]
    expect(dailyCounts(dates, 7, now)).toEqual([1, 0, 0, 0, 0, 1, 2])
  })

  it('ignores out-of-window, future, and invalid dates', () => {
    const dates = ['2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z', 'not-a-date']
    expect(dailyCounts(dates, 7, now)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('returns all zeros for empty input', () => {
    expect(dailyCounts([], 7, now)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('percentDelta', () => {
  it('computes rounded percent change', () => {
    expect(percentDelta(15, 10)).toBe(50)
    expect(percentDelta(5, 10)).toBe(-50)
  })

  it('returns null when there is no baseline', () => {
    expect(percentDelta(5, 0)).toBeNull()
  })
})

describe('effectiveStatus', () => {
  const now = Date.parse('2026-06-11T12:00:00Z')

  it('keeps fresh online/busy statuses', () => {
    const recent = new Date(now - 60_000).toISOString()
    expect(effectiveStatus('online', recent, now)).toBe('online')
    expect(effectiveStatus('busy', recent, now)).toBe('busy')
  })

  it('downgrades stale agents to offline', () => {
    const stale = new Date(now - STALE_AGENT_MS - 1000).toISOString()
    expect(effectiveStatus('online', stale, now)).toBe('offline')
    expect(effectiveStatus('busy', stale, now)).toBe('offline')
  })

  it('passes through offline and unknown statuses as offline', () => {
    expect(effectiveStatus('offline', new Date(now).toISOString(), now)).toBe('offline')
    expect(effectiveStatus('weird', new Date(now).toISOString(), now)).toBe('offline')
  })

  it('trusts the reported status when last_seen is missing or invalid', () => {
    expect(effectiveStatus('online', null, now)).toBe('online')
    expect(effectiveStatus('online', 'garbage', now)).toBe('online')
  })
})

describe('agent colors', () => {
  it('covers every configured agent', () => {
    for (const config of agentConfigs) {
      expect(AGENT_COLORS[config.id], `missing color for ${config.id}`).toBeTruthy()
    }
  })

  it('falls back for unknown agents', () => {
    expect(agentColor('unknown-agent')).toBe(FALLBACK_AGENT_COLOR)
  })
})
