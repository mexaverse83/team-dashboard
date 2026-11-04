// Which rows of finance_wolff_chat make up Mona's CURRENT conversation.
//
// Plain ESM + JSDoc so both the Next app and the home-PC answer daemon
// (scripts/wolff-chat-daemon.mjs, plain Node) share one rule:
//
//   the current conversation is every row after the latest boundary, where a
//   boundary is (a) a "new chat" marker row (role 'wolff', status 'reset'), or
//   (b) the start of the current Mexico City day (the automatic daily reset).
//
// Two carry-overs keep a reset from swallowing a live exchange:
//   - a question asked before the boundary that is still pending stays in the
//     current conversation (it will be answered there);
//   - a question whose answer landed after the boundary is pulled in next to
//     its answer, so the reply never reads as an orphan.
// Marker rows are boundaries, never conversation content.

export const MONA_TIME_ZONE = 'America/Mexico_City'
export const RESET_STATUS = 'reset'
export const RESET_LABEL = 'New conversation'

/**
 * @typedef {object} ChatRow
 * @property {string} id
 * @property {string} role            'user' | 'wolff'
 * @property {string} content
 * @property {string} [status]
 * @property {string} created_at
 * @property {string | null} [reply_to]
 * @property {string | null} [asked_by]
 */

/**
 * @typedef {object} ConversationStart
 * @property {'marker' | 'day'} kind  what opened the current conversation
 * @property {number} at              epoch ms of the boundary
 * @property {ChatRow | null} marker  the marker row when kind is 'marker'
 */

/** @param {{ role?: string; status?: string | null } | null | undefined} row */
export function isResetMarker(row) {
  return Boolean(row && row.role === 'wolff' && row.status === RESET_STATUS)
}

/** @param {string} iso */
function ms(iso) {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? 0 : t
}

const mxParts = new Intl.DateTimeFormat('en-US', {
  timeZone: MONA_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
})

/** @param {number} t epoch ms → that instant's Mexico City wall clock, read as if it were UTC */
function mxWallAsUtc(t) {
  /** @type {Record<string, number>} */
  const p = {}
  for (const part of mxParts.formatToParts(new Date(t))) if (part.type !== 'literal') p[part.type] = Number(part.value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

/**
 * Epoch ms of 00:00 in Mexico City on the day containing `now`.
 * @param {Date} [now]
 */
export function mexicoCityDayStart(now = new Date()) {
  const t = now.getTime()
  const wall = mxWallAsUtc(t)
  const midnightWall = Date.UTC(new Date(wall).getUTCFullYear(), new Date(wall).getUTCMonth(), new Date(wall).getUTCDate())
  // Shift the wall-clock midnight back into real time with the zone's offset.
  let start = midnightWall + (t - wall)
  start += midnightWall - mxWallAsUtc(start) // settle if the offset differs at midnight
  return start
}

/**
 * The latest boundary at or before `now`: the newest marker, or today's
 * Mexico City midnight when that is later.
 * @param {ChatRow[]} rows
 * @param {Date} [now]
 * @returns {ConversationStart}
 */
export function conversationStart(rows, now = new Date()) {
  const dayStart = mexicoCityDayStart(now)
  /** @type {ChatRow | null} */
  let marker = null
  for (const row of rows) {
    if (isResetMarker(row) && (!marker || ms(row.created_at) >= ms(marker.created_at))) marker = row
  }
  if (marker && ms(marker.created_at) >= dayStart) return { kind: 'marker', at: ms(marker.created_at), marker }
  return { kind: 'day', at: dayStart, marker: null }
}

/**
 * True when this row belongs to the conversation that began at `start`.
 * @param {ChatRow} row
 * @param {ConversationStart} start
 */
function afterStart(row, start) {
  return !isResetMarker(row) && ms(row.created_at) >= start.at
}

/**
 * The rows of the current conversation, oldest first, markers excluded.
 * @template {ChatRow} T
 * @param {T[]} rows
 * @param {Date} [now]
 * @returns {T[]}
 */
export function currentConversation(rows, now = new Date()) {
  const start = conversationStart(rows, now)
  const inside = new Set(rows.filter(r => afterStart(r, start)).map(r => r.id))
  // An answer inside pulls in its question; a still-pending question carries over.
  const repliedTo = new Set(rows.filter(r => inside.has(r.id) && r.role === 'wolff' && r.reply_to).map(r => r.reply_to))
  const answered = new Set(rows.filter(r => r.role === 'wolff' && r.reply_to && !isResetMarker(r)).map(r => r.reply_to))
  for (const r of rows) {
    if (r.role !== 'user' || inside.has(r.id)) continue
    if (repliedTo.has(r.id) || (r.status === 'pending' && !answered.has(r.id))) inside.add(r.id)
  }
  return rows
    .filter(r => inside.has(r.id))
    .sort((a, b) => ms(a.created_at) - ms(b.created_at))
}
