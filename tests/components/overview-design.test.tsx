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
    // A negative room is the month's overspend, so the tile says so (not "this week").
    const week = screen.getByRole('button', { name: /This month/ })
    expect(week).toHaveTextContent('−$5,486')
    expect(week).toHaveTextContent('everyday budgets over')
    expect(week.querySelector('.num-metric')).toHaveClass('text-negative')
  })

  describe('one number for Today and This week (W3)', () => {
    // Wed Oct 28 in Mexico City: 4 days left through Sat Oct 31 (month end).
    const october = (rows: Array<{ category: string; budget: number; spent: number }>) => ({
      ...summary,
      current_month: { ...summary.current_month, month: '2026-10', day_of_month: 28, days_in_month: 31, budget_vs_actual: rows.map(r => ({ ...r, is_non_monthly: false })) },
    }) as unknown as Summary
    afterEach(() => { vi.useRealTimers() })

    it('nets an over-budget category instead of ignoring it', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-28T18:00:00Z'))
      // Groceries has $4k left, Other is $12k over: the week is over plan.
      render(<DailySpendingPlan summary={october([{ category: 'Groceries', budget: 8000, spent: 4000 }, { category: 'Other', budget: 2000, spent: 14000 }])} westTarget={null} />)
      const today = screen.getByRole('button', { name: /^Today/ })
      const week = screen.getByRole('button', { name: /This month/ })
      expect(week).toHaveTextContent('−$8,000')
      expect(today).toHaveTextContent('$0')
      expect(today).toHaveTextContent('pause extras until')
    })

    it('spreads the same weekly room over its days', () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-28T18:00:00Z'))
      render(<DailySpendingPlan summary={october([{ category: 'Groceries', budget: 8000, spent: 4000 }, { category: 'Dining Out', budget: 3000, spent: 3400 }])} westTarget={null} />)
      expect(screen.getByRole('button', { name: /This week/ })).toHaveTextContent('$3,600')
      expect(screen.getByRole('button', { name: /^Today/ })).toHaveTextContent('$900')
    })
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

  it('dates the archived brief by llm_generated_at, not the live rebuild time', () => {
    const live = {
      source: 'live' as const, expired: true, insights: [],
      archived: fixture.insights.insights,
      generated_at: '2026-10-28T17:59:00Z',
      llm_generated_at: '2026-09-04T13:30:53Z',
    }
    render(<WolffWidget now={now} summary={liveSummary} insights={live} proactive={null} />)
    expect(screen.getByRole('button', { name: 'Show last brief (Sep 4)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Oct 28/ })).not.toBeInTheDocument()
  })

  it('carries suggested questions into chat and labels the proactive review', () => {
    render(<WolffWidget now={now} summary={liveSummary} insights={fixture.insights} proactive={{ content: 'Saw **$1,840** at Monita.', created_at: '2026-10-27T15:00:00Z' }} />)
    const link = screen.getByRole('link', { name: /Plan a date night/ })
    expect(new URL(link.getAttribute('href')!, 'http://localhost').searchParams.get('prompt')).toContain('date night')
    // Written two days ago: it sits behind a dated "earlier note", not as today's take.
    expect(screen.queryByText(/Mona noticed/)).toBeNull()
    expect(screen.getByText('$1,840').closest('[data-proactive="earlier"]')).not.toBeNull()
    expect(screen.getByText('$1,840').closest('strong')).not.toBeNull()
  })

  it('shows a proactive note written today as current', () => {
    render(<WolffWidget now={now} summary={liveSummary} insights={fixture.insights} proactive={{ content: 'Saw **$900** at Oxxo.', created_at: now.toISOString() }} />)
    expect(screen.getByText('Mona noticed · today')).toBeInTheDocument()
    expect(screen.getByText('$900').closest('[data-proactive="earlier"]')).toBeNull()
  })

  it('reads the wolff-chat shapes', () => {
    // The route's real ?latest_proactive=1 shape (tests/api/wolff-chat.test.ts).
    expect(proactiveFromChat({ latest_proactive: { question: { id: 'q' }, reply: { content: 'Hi', created_at: 'x' } } })).toEqual({ content: 'Hi', created_at: 'x' })
    expect(proactiveFromChat({ latest_proactive: null })).toBeNull()
    expect(proactiveFromChat({ latest_proactive: { question: { id: 'q' }, reply: null } })).toBeNull()
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
