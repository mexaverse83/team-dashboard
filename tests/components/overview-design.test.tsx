import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/finance-review.json'
import { DailySpendingPlan } from '@/components/finance/daily-spending-plan'
import { BudgetWatch } from '@/components/finance/budget-watch'
import { WolffWidget } from '@/components/finance/wolff-widget'
import AskWolffClient from '@/components/finance/ask-wolff-client'
import type { Summary } from '@/components/finance/command-center/types'

const summary = fixture.summary as unknown as Summary
vi.mock('@/components/finance/push-toggle', () => ({ PushToggle: () => null }))
vi.mock('@/components/brand-logo', () => ({ WolffAvatar: () => null }))
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

describe('overview decisions', () => {
  it('explains extra room on demand and switches the explanation with the selected amount', () => {
    render(<DailySpendingPlan summary={summary} westTarget={18000} />)
    const extra = screen.getByRole('button', { name: /Extra today/ })
    expect(extra).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(extra)
    expect(screen.getByText(/This is a forecast, not your bank balance/)).toBeInTheDocument()
    expect(extra).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Through Sunday/ }))
    expect(screen.getByText(/don’t add the two together/)).toBeInTheDocument()
    expect(extra).toHaveAttribute('aria-expanded', 'false')
  })
  it('shows the tighter WEST weekly limit when the projection is short', () => {
    render(<DailySpendingPlan summary={summary} westTarget={30000} />)
    fireEvent.click(screen.getByRole('button', { name: /Through Sunday/ }))
    expect(screen.getByText(/\$0 is the tighter limit/)).toBeInTheDocument()
  })
  it('prioritizes budget exceptions with a route to fix them', () => {
    render(<BudgetWatch summary={summary} />)
    expect(screen.getByText('1 category needs a look')).toBeInTheDocument()
    expect(screen.getByText(/\$2,400 over budget/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review budgets' })).toHaveAttribute('href', '/finance/budgets')
  })
  it('offers budget setup when there are no budget rows', () => {
    render(<BudgetWatch summary={{ ...summary, current_month: { ...summary.current_month, budget_vs_actual: [] } }} />)
    expect(screen.getByRole('link', { name: 'Set up budgets' })).toBeInTheDocument()
  })
  it('keeps Mona concise and carries suggested questions into chat', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('insights') ? fixture.insights : { messages: [] } })))
    render(<WolffWidget />)
    expect(await screen.findByText('Keep groceries inside the monthly plan')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Plan a date night/ })
    expect(new URL(link.getAttribute('href')!, 'http://localhost').searchParams.get('prompt')).toContain('date night')
    expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes('/widget'))).toBe(true)
  })
  it('prefills the selected question without sending it automatically', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    window.history.replaceState(null, '', '/finance/ask?prompt=Help%20me%20plan%20dinner')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ messages: [] }) })))
    render(<AskWolffClient />)
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Your question for Mona' })).toHaveValue('Help me plan dinner'))
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true)
  })
})
