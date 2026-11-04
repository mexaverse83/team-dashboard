import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AskWolffClient, { detectLang, mergeMessages, noteStamp } from '@/components/finance/ask-wolff-client'

vi.mock('@/components/brand-logo', () => ({ WolffAvatar: ({ className }: { className?: string }) => <span data-testid="mona-avatar" className={className} /> }))

const messages = [
  { id: 'q1', role: 'user', content: 'Can we eat out?', status: 'answered', created_at: '2026-10-27T10:00:00Z' },
  { id: 'a1', role: 'wolff', content: 'Yes — you have **$6,742** left this week.\n- Keep it under $1,500', status: 'answered', reply_to: 'q1', created_at: '2026-10-27T10:00:05Z' },
  { id: 'm1', role: 'user', content: 'tx 123', status: 'answered', asked_by: 'wolff-monitor:tx', created_at: '2026-10-27T11:00:00Z' },
  { id: 'a2', role: 'wolff', content: 'Vi un gasto de $1,840 en Monita, ¿es para la semana?', status: 'answered', reply_to: 'm1', created_at: '2026-10-27T11:00:05Z' },
]

// The chat shows the current conversation only (Mexico City day or the last
// "new chat"), so pin the clock to the fixtures' day: Oct 27, 2:00 PM in CDMX.
const TODAY = new Date('2026-10-27T20:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(TODAY)
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ messages }) })))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

describe('Ask Mona', () => {
  it('renders Mona’s markdown as formatting, not asterisks', async () => {
    render(<AskWolffClient />)
    expect((await screen.findByText('$6,742')).closest('strong')).not.toBeNull()
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
    // Amounts are their own data-money spans (privacy mode), so match the list item by its text.
    expect(screen.getByText((_, el) => el?.tagName === 'LI' && el.textContent === 'Keep it under $1,500')).toBeInTheDocument()
  })

  it('announces new messages politely and uses the avatar as the only Mona marker', async () => {
    render(<AskWolffClient />)
    const log = screen.getByRole('log', { name: 'Conversation with Mona' })
    expect(log).toHaveAttribute('aria-live', 'polite')
    await screen.findByText('$6,742')
    expect(log.textContent).not.toMatch(/🐺|🐕/)
    expect(screen.getAllByTestId('mona-avatar').length).toBeGreaterThan(1)
  })

  it('labels the proactive review and marks Spanish bubbles', async () => {
    render(<AskWolffClient />)
    const label = await screen.findByText(/^Mona noticed/)
    expect(label.parentElement).toHaveAttribute('lang', 'es')
    // Stacked notes carry their time so older ones read as older.
    expect(label.textContent).toMatch(/^Mona noticed · \S/)
    expect(screen.queryByText('tx 123')).not.toBeInTheDocument()
  })

  it('stamps proactive notes with their age', () => {
    const now = new Date('2026-10-29T18:00:00Z')
    expect(noteStamp('2026-10-29T15:00:00Z', now)).toEqual({ label: 'today 9:00 AM', today: true })
    expect(noteStamp('2026-10-28T21:02:00Z', now)).toEqual({ label: 'yesterday 3:02 PM', today: false })
    expect(noteStamp('2026-10-26T15:00:00Z', now)).toEqual({ label: 'Mon 9:00 AM', today: false })
    expect(noteStamp('2026-10-01T15:00:00Z', now).label).toBe('Oct 1')
  })

  it('keeps suggestion chips visible after the conversation starts', async () => {
    render(<AskWolffClient />)
    await screen.findByText('$6,742')
    expect(screen.getByRole('button', { name: 'Can we afford dinner out this weekend?' })).toBeInTheDocument()
  })

  it('prefills ?prompt= without sending and first reads the latest page', async () => {
    window.history.replaceState(null, '', '/finance/ask?prompt=Help%20me%20plan%20dinner')
    render(<AskWolffClient />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your question for Mona' })).toHaveValue('Help me plan dinner'))
    const calls = vi.mocked(fetch).mock.calls
    expect(calls.every(([, options]) => (options as RequestInit | undefined)?.method !== 'POST')).toBe(true)
    expect(String(calls[0][0])).toBe('/api/finance/wolff-chat')
  })

  it('polls only for new messages once nothing is pending', async () => {
    render(<AskWolffClient />)
    await screen.findByText('$6,742')
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => String(url))
    expect(urls.length).toBeGreaterThan(1)
    expect(urls.at(-1)).toBe(`/api/finance/wolff-chat?since=${encodeURIComponent('2026-10-27T11:00:05Z')}`)
  })

  it('stops waiting when a pending question flips to failed', async () => {
    const question = { id: 'q9', role: 'user', content: 'Are we ok?', status: 'pending', created_at: '2026-10-28T10:00:00Z' }
    let status = 'pending'
    // The daemon PATCHes the row's status; created_at never moves, so only a full read sees it.
    vi.mocked(fetch).mockImplementation((async (url: string) => ({
      ok: true,
      json: async () => ({ messages: String(url).includes('since=') ? [] : [{ ...question, status }] }),
    })) as never)
    render(<AskWolffClient />)
    expect(await screen.findByText('Mona is checking the numbers…')).toBeInTheDocument()
    status = 'failed'
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })
    expect(await screen.findByText(/Mona couldn.t answer this one/)).toBeInTheDocument()
    expect(screen.queryByText('Mona is checking the numbers…')).not.toBeInTheDocument()
  })
})

describe('Ask Mona conversations', () => {
  const yesterday = [
    { id: 'y1', role: 'user', content: 'October advice please', status: 'answered', created_at: '2026-10-26T16:00:00Z' },
    { id: 'y2', role: 'wolff', content: 'Old October verdict', status: 'done', reply_to: 'y1', created_at: '2026-10-26T16:00:05Z' },
  ]
  const reset = { id: 'r1', role: 'wolff', content: 'New conversation', status: 'reset', created_at: '2026-10-27T19:00:00Z' }
  const fresh = [
    { id: 'f1', role: 'user', content: 'Fresh question', status: 'answered', created_at: '2026-10-27T19:05:00Z' },
    { id: 'f2', role: 'wolff', content: 'Fresh answer', status: 'done', reply_to: 'f1', created_at: '2026-10-27T19:05:05Z' },
  ]
  const serve = (rows: unknown[]) => vi.mocked(fetch).mockImplementation((async () => ({ ok: true, json: async () => ({ messages: rows }) })) as never)

  it('shows only the current conversation until Show earlier is tapped', async () => {
    serve([...yesterday, ...messages, reset, ...fresh])
    render(<AskWolffClient />)
    expect(await screen.findByText('Fresh answer')).toBeInTheDocument()
    expect(screen.queryByText('Old October verdict')).not.toBeInTheDocument()
    expect(screen.queryByText('Can we eat out?')).not.toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'New conversation · Tue Oct 27' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show earlier' }))
    expect(screen.getByText('Old October verdict')).toBeInTheDocument()
    expect(screen.getByText('Can we eat out?')).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Mon Oct 26' })).toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'Tue Oct 27' })).toBeInTheDocument()
    // The opening marker is drawn once, not again among the earlier items.
    expect(screen.getAllByRole('separator', { name: 'New conversation · Tue Oct 27' })).toHaveLength(1)
    // The marker itself is a divider, never a Mona bubble.
    expect(screen.queryByText('New conversation')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide earlier' }))
    expect(screen.queryByText('Old October verdict')).not.toBeInTheDocument()
  })

  it('resets daily: yesterday is behind Show earlier with no marker', async () => {
    serve([...yesterday, ...messages])
    render(<AskWolffClient />)
    expect(await screen.findByText('$6,742')).toBeInTheDocument()
    expect(screen.queryByText('Old October verdict')).not.toBeInTheDocument()
    expect(screen.getByRole('separator', { name: 'New day · Tue Oct 27 · Mona starts fresh' })).toBeInTheDocument()
  })

  it('explains the daily fresh start when today is still empty', async () => {
    serve(yesterday)
    render(<AskWolffClient />)
    expect(await screen.findByText(/Fresh start for today/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show earlier' })).toBeInTheDocument()
  })

  it('New chat posts a reset and starts an empty conversation', async () => {
    const marker = { id: 'r9', role: 'wolff', content: 'New conversation', status: 'reset', created_at: '2026-10-27T20:00:01Z' }
    vi.mocked(fetch).mockImplementation((async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => (init?.method === 'POST' ? { ok: true, message: marker } : { messages }),
    })) as never)
    render(<AskWolffClient />)
    await screen.findByText('$6,742')
    fireEvent.click(screen.getByRole('button', { name: 'New chat' }))
    await waitFor(() => expect(screen.queryByText('$6,742')).not.toBeInTheDocument())
    const post = vi.mocked(fetch).mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ action: 'reset' })
    expect(screen.getByText('Make the next decision simple.')).toBeInTheDocument()
    expect(screen.getByText(/^Fresh start: Mona no longer uses earlier chats/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show earlier' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled()
    // Show earlier right after a reset draws the new marker's divider once.
    fireEvent.click(screen.getByRole('button', { name: 'Show earlier' }))
    expect(screen.getAllByRole('separator', { name: /^New conversation/ })).toHaveLength(1)
    // Polling continues from the marker.
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000) })
    expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toBe(`/api/finance/wolff-chat?since=${encodeURIComponent(marker.created_at)}`)
  })
})

describe('chat helpers', () => {
  it('detects Spanish without flagging English', () => {
    expect(detectLang('¿Podemos gastar más esta semana para la cena?')).toBe('es')
    expect(detectLang('You have $6,742 left this week for dinner.')).toBeUndefined()
  })

  it('merges incremental pages and drops confirmed optimistic messages', () => {
    const local = [
      { id: 'a', role: 'user' as const, content: 'hi', status: 'answered', created_at: '1' },
      { id: 'tmp-1', role: 'user' as const, content: 'new q', status: 'pending', created_at: '3' },
    ]
    const merged = mergeMessages(local, [{ id: 'b', role: 'user', content: 'new q', status: 'pending', created_at: '2' }])
    expect(merged.map(m => m.id)).toEqual(['a', 'b'])
  })
})
