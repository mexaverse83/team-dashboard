import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/finance-review.json'
import { DailySpendingPlan } from '@/components/finance/daily-spending-plan'
import { BudgetWatch } from '@/components/finance/budget-watch'
import { WolffWidget, proactiveFromChat } from '@/components/finance/wolff-widget'
import type { Summary } from '@/components/finance/command-center/types'

const summary = fixture.summary as unknown as Summary
vi.mock('@/components/finance/push-toggle', () => ({ PushToggle: () => null }))
vi.mock('@/components/brand-logo', () => ({ WolffAvatar: () => null }))
afterEach(() => { vi.unstubAllGlobals() })

describe('Can we spend?', () => {
  it('leads with today, explains each number on demand, and keeps numbers neutral', () => {
    render(<DailySpendingPlan summary={summary} westTarget={18000} />)
    const today = screen.getByRole('button', { name: /^Today/ })
    expect(today.querySelector('.num-metric')).toHaveClass('text-fg')
    fireEvent.click(today)
    expect(screen.getByText(/already in the plan/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /This week/ }))
    expect(screen.getByText(/don’t add the two/)).toBeInTheDocument()
    expect(today).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the signed weekly room and through label from summary.variable', () => {
    render(<DailySpendingPlan summary={{ ...summary, variable: { budget: 20000, spent: 25486, left: -5486, days_left: 4, through_label: 'Sat Oct 31', status: 'over' } }} westTarget={null} />)
    const week = screen.getByRole('button', { name: /This week/ })
    expect(week).toHaveTextContent('−$5,486')
    expect(week).toHaveTextContent('over plan through Sat Oct 31')
    expect(week.querySelector('.num-metric')).toHaveClass('text-negative')
  })

  it('shows a neutral dash when the plan leaves no free extra', () => {
    const tight = { ...summary, goal_funding: { ...summary.goal_funding, total_monthly_needed: 999999 } }
    render(<DailySpendingPlan summary={tight} westTarget={null} />)
    const extra = screen.getByRole('button', { name: /Free extra/ })
    expect(extra).toHaveTextContent('—')
    expect(extra).toHaveTextContent('all slack goes to WEST')
  })
})

describe('Budgets card', () => {
  it('uses the shared tone words and a pace marker, not alerts', () => {
    render(<BudgetWatch summary={summary} />)
    expect(screen.getByText('Marker shows day 8 of 30')).toBeInTheDocument()
    expect(screen.getAllByTestId('progress-marker')).toHaveLength(2)
    expect(screen.getByRole('progressbar', { name: 'Groceries budget' })).toBeInTheDocument()
    expect(screen.queryByText(/needs? a look/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Review budgets/ })).toHaveAttribute('href', `/finance/budgets?month=${summary.current_month.month}`)
  })

  it('offers budget setup when there are no budget rows', () => {
    render(<BudgetWatch summary={{ ...summary, current_month: { ...summary.current_month, budget_vs_actual: [] } }} />)
    expect(screen.getByRole('link', { name: /Set up budgets/ })).toBeInTheDocument()
  })
})

describe("Mona's take", () => {
  const now = new Date('2026-10-28T18:00:00Z')
  const liveSummary = { ...summary, current_month: { ...summary.current_month, month: '2026-10', day_of_month: 28, days_in_month: 31 } }

  it('shows a same-day LLM brief with a fresh dot', () => {
    render(<WolffWidget now={now} summary={liveSummary} insights={{ ...fixture.insights, generated_at: '2026-10-28T13:30:00Z' }} proactive={null} />)
    expect(screen.getByText('Keep groceries inside the monthly plan')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Under 24h old' })).toBeInTheDocument()
    expect(screen.queryByText('Live plan')).not.toBeInTheDocument()
  })

  it('replaces an old brief with the live plan and keeps it behind a toggle', () => {
    render(<WolffWidget now={now} summary={liveSummary} insights={fixture.insights} proactive={null} />)
    expect(screen.getByText('Live plan')).toBeInTheDocument()
    expect(screen.queryByText('Keep groceries inside the monthly plan')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show last brief (Sep 8)' }))
    expect(screen.getByText('Keep groceries inside the monthly plan')).toBeInTheDocument()
  })

  it('carries suggested questions into chat and labels the proactive review', () => {
    render(<WolffWidget now={now} summary={liveSummary} insights={fixture.insights} proactive={{ content: 'Saw **$1,840** at Monita.', created_at: '2026-10-27T15:00:00Z' }} />)
    const link = screen.getByRole('link', { name: /Plan a date night/ })
    expect(new URL(link.getAttribute('href')!, 'http://localhost').searchParams.get('prompt')).toContain('date night')
    fireEvent.click(screen.getByText('Mona noticed · this week'))
    expect(screen.getByText('$1,840').tagName).toBe('STRONG')
  })

  it('reads both wolff-chat shapes', () => {
    expect(proactiveFromChat({ question: {}, reply: { content: 'Hi', created_at: 'x' } })).toEqual({ content: 'Hi', created_at: 'x' })
    expect(proactiveFromChat({ messages: [
      { id: 'q', role: 'user', content: 'tx', asked_by: 'wolff-monitor:1', created_at: 'a' },
      { id: 'a', role: 'wolff', content: 'Reply', reply_to: 'q', created_at: 'b' },
    ] })).toEqual({ content: 'Reply', created_at: 'b' })
    expect(proactiveFromChat(null)).toBeNull()
  })

  it('fetches its own data when used standalone, without polling the widget API', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('insights') ? fixture.insights : null })))
    render(<WolffWidget />)
    expect(await screen.findByText('Brief out of date')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('latest_proactive=1'))).toBe(true)
    expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes('/widget'))).toBe(true)
  })
})
