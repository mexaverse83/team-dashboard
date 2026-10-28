import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AskWolffClient, { detectLang, mergeMessages } from '@/components/finance/ask-wolff-client'

vi.mock('@/components/brand-logo', () => ({ WolffAvatar: ({ className }: { className?: string }) => <span data-testid="mona-avatar" className={className} /> }))

const messages = [
  { id: 'q1', role: 'user', content: 'Can we eat out?', status: 'answered', created_at: '2026-10-27T10:00:00Z' },
  { id: 'a1', role: 'wolff', content: 'Yes — you have **$6,742** left this week.\n- Keep it under $1,500', status: 'answered', reply_to: 'q1', created_at: '2026-10-27T10:00:05Z' },
  { id: 'm1', role: 'user', content: 'tx 123', status: 'answered', asked_by: 'wolff-monitor:tx', created_at: '2026-10-27T11:00:00Z' },
  { id: 'a2', role: 'wolff', content: 'Vi un gasto de $1,840 en Monita, ¿es para la semana?', status: 'answered', reply_to: 'm1', created_at: '2026-10-27T11:00:05Z' },
]

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ messages }) })))
})
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

describe('Ask Mona', () => {
  it('renders Mona’s markdown as formatting, not asterisks', async () => {
    render(<AskWolffClient />)
    expect(await screen.findByText('$6,742')).toHaveProperty('tagName', 'STRONG')
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
    expect(screen.getByText('Keep it under $1,500').tagName).toBe('LI')
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
    const label = await screen.findByText('Mona noticed')
    expect(label.parentElement).toHaveAttribute('lang', 'es')
    expect(screen.queryByText('tx 123')).not.toBeInTheDocument()
  })

  it('keeps suggestion chips visible after the conversation starts', async () => {
    render(<AskWolffClient />)
    await screen.findByText('$6,742')
    expect(screen.getByRole('button', { name: 'Can we afford dinner out this weekend?' })).toBeInTheDocument()
  })

  it('prefills ?prompt= without sending, then polls only for new messages', async () => {
    window.history.replaceState(null, '', '/finance/ask?prompt=Help%20me%20plan%20dinner')
    render(<AskWolffClient />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your question for Mona' })).toHaveValue('Help me plan dinner'))
    const calls = vi.mocked(fetch).mock.calls
    expect(calls.every(([, options]) => (options as RequestInit | undefined)?.method !== 'POST')).toBe(true)
    expect(String(calls[0][0])).toBe('/api/finance/wolff-chat')
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
