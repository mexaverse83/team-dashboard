import { describe, expect, it } from 'vitest'
import { conversationStart, currentConversation, isResetMarker, mexicoCityDayStart } from '@/lib/mona-chat-session.mjs'

type Row = { id: string; role: string; content: string; status: string; created_at: string; reply_to?: string | null; asked_by?: string | null }
const q = (id: string, at: string, status = 'answered', extra: Partial<Row> = {}): Row => ({ id, role: 'user', content: id, status, created_at: at, ...extra })
const a = (id: string, at: string, replyTo: string): Row => ({ id, role: 'wolff', content: id, status: 'done', created_at: at, reply_to: replyTo })
const marker = (id: string, at: string): Row => ({ id, role: 'wolff', content: 'New conversation', status: 'reset', created_at: at })
const ids = (rows: Row[]) => rows.map(r => r.id)

describe('mona chat session', () => {
  it('finds Mexico City midnight from UTC timestamps', () => {
    // 05:30 UTC on Nov 5 is still 23:30 on Nov 4 in Mexico City (UTC-6).
    expect(new Date(mexicoCityDayStart(new Date('2026-11-05T05:30:00Z'))).toISOString()).toBe('2026-11-04T06:00:00.000Z')
    expect(new Date(mexicoCityDayStart(new Date('2026-11-05T06:00:00Z'))).toISOString()).toBe('2026-11-05T06:00:00.000Z')
  })

  it('resets automatically at the start of the Mexico City day', () => {
    const rows = [
      q('late-q', '2026-11-04T05:50:00Z'), // Nov 3, 23:50 in CDMX
      a('late-a', '2026-11-04T05:51:00Z', 'late-q'),
      q('today-q', '2026-11-04T06:05:00Z'), // Nov 4, 00:05 in CDMX
      a('today-a', '2026-11-04T06:06:00Z', 'today-q'),
    ]
    const now = new Date('2026-11-04T18:00:00Z')
    expect(conversationStart(rows, now)).toMatchObject({ kind: 'day', at: Date.parse('2026-11-04T06:00:00Z'), marker: null })
    expect(ids(currentConversation(rows, now))).toEqual(['today-q', 'today-a'])
    // Before CDMX midnight the late exchange is still today's conversation.
    expect(ids(currentConversation(rows.slice(0, 2), new Date('2026-11-04T05:59:00Z')))).toEqual(['late-q', 'late-a'])
  })

  it('starts after a "new chat" marker later than the day start, and excludes markers', () => {
    const rows = [
      marker('old-mark', '2026-11-03T20:00:00Z'),
      q('morning-q', '2026-11-04T15:00:00Z'),
      a('morning-a', '2026-11-04T15:00:20Z', 'morning-q'),
      marker('mark', '2026-11-04T16:00:00Z'),
      q('fresh-q', '2026-11-04T16:05:00Z'),
      a('fresh-a', '2026-11-04T16:05:20Z', 'fresh-q'),
    ]
    const now = new Date('2026-11-04T18:00:00Z')
    expect(conversationStart(rows, now)).toMatchObject({ kind: 'marker', marker: { id: 'mark' } })
    expect(ids(currentConversation(rows, now))).toEqual(['fresh-q', 'fresh-a'])
    expect(currentConversation(rows, now).some(isResetMarker)).toBe(false)
    // A marker from yesterday loses to today's midnight.
    expect(conversationStart(rows.slice(0, 3), now).kind).toBe('day')
    // Right after a reset the conversation is empty.
    expect(currentConversation(rows.slice(0, 4), now)).toEqual([])
  })

  it('keeps a question pending across a reset and counts its answer in the new conversation', () => {
    const asked = q('asked', '2026-11-04T16:59:00Z', 'pending')
    const mark = marker('mark', '2026-11-04T17:00:00Z')
    const now = new Date('2026-11-04T17:00:30Z')
    // Still waiting: it carries into the new conversation.
    expect(ids(currentConversation([asked, mark], now))).toEqual(['asked'])
    // Answered after the boundary: the answer counts, and its question comes with it.
    const answered = { ...asked, status: 'answered' }
    expect(ids(currentConversation([answered, mark, a('reply', '2026-11-04T17:01:00Z', 'asked')], now))).toEqual(['asked', 'reply'])
    // A failed question before the boundary stays behind.
    expect(currentConversation([{ ...asked, status: 'failed' }, mark], now)).toEqual([])
  })

  it('recognises only reset rows from Mona as markers', () => {
    expect(isResetMarker(marker('m', '2026-11-04T17:00:00Z'))).toBe(true)
    expect(isResetMarker(q('u', '2026-11-04T17:00:00Z', 'reset'))).toBe(false)
    expect(isResetMarker(a('r', '2026-11-04T17:00:00Z', 'u'))).toBe(false)
    expect(isResetMarker(null)).toBe(false)
  })
})
