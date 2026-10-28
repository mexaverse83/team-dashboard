import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from '../fixtures/finance-review.json'
import { supabase } from '@/lib/supabase'
import CommandCenter from '@/components/finance/command-center-client'
import { buildAttentionItems } from '@/components/finance/command-center/attention'

const west = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/west-projection-client', () => ({ fetchWestProjection: west.fetch, westMonthTarget: () => null }))
vi.mock('@/components/finance/install-prompt', () => ({ InstallPrompt: () => null }))
vi.mock('@/components/finance/push-toggle', () => ({ PushToggle: () => null }))
vi.mock('@/components/brand-logo', () => ({ WolffAvatar: () => null, BrandLogo: () => null }))
vi.mock('@/components/finance/forecast-chart', () => ({ ForecastChart: () => null }))

// Today's month so the deterministic brief and attention rows see "this month".
const now = new Date()
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const summary = {
  ...fixture.summary,
  current_month: { ...fixture.summary.current_month, month },
  month_projection: { ...fixture.summary.month_projection, projected_savings: 22000 },
  owner_spend: { Bernardo: 5200, Laura: 3000 },
  recent_transactions: [
    { id: 'r1', date: `${month}-02`, merchant: 'Weekly groceries', amount: 5200, owner: 'bernardo', category_name: 'Groceries', category_icon: '🛒' },
    { id: 'r2', date: `${month}-03`, merchant: 'Tacos', amount: 3000, owner: 'Laura', category_name: 'Dining Out', category_icon: '🍽️' },
  ],
}

// A September brief, in Spanish: never current advice in October.
const staleInsights = {
  generated_at: '2026-09-04T13:30:00Z',
  stale: true,
  insights: [{ type: 'alert', icon: '', title: 'Protege $108,231 para WEST hoy', detail: 'La proyección determinista de ahorro es $119,400.', priority: 'high', category: 'WIDGET' }],
}

function stubFetch(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const key = Object.keys(overrides).find(k => url.includes(k))
    const body = key ? overrides[key]
      : url.includes('summary') ? summary
      : url.includes('forecast') ? fixture.forecast
      : url.includes('net-worth') ? fixture.netWorth
      : url.includes('insights') ? staleInsights
      : url.includes('wolff-chat') ? null
      : {}
    return { ok: true, json: async () => body }
  }))
}

beforeEach(() => {
  vi.restoreAllMocks()
  west.fetch.mockReset()
  west.fetch.mockResolvedValue(fixture.west)
  stubFetch()
})
afterEach(() => vi.unstubAllGlobals())

describe('home', () => {
  it('renders the hero from summary alone while the WEST plan is still loading', async () => {
    west.fetch.mockReturnValue(new Promise(() => {}))
    render(<CommandCenter />)
    expect(await screen.findByText('$22,000')).toBeInTheDocument()
    expect(screen.getByLabelText('Loading WEST plan')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Can we spend?' })).toBeInTheDocument()
  })

  it('colours the WEST bar against capacity and shows the stretch target as a marker only', async () => {
    west.fetch.mockResolvedValue({ ...fixture.west, savings_plan: { ...fixture.west.savings_plan, purchase_gap: 400000, months: [{ month, target: 26000, capacity: 20000 }] } })
    render(<CommandCenter />)
    const bar = await screen.findByRole('progressbar', { name: 'Projected savings vs the WEST plan' })
    expect(bar).toHaveAttribute('aria-valuemax', '20000')
    expect(within(bar).getByTestId('plan-marker')).toBeInTheDocument()
    expect(screen.getByText('$2k ahead of the plan')).toBeInTheDocument()
    expect(screen.getByText(/Stretch/)).toHaveTextContent('Stretch $26k/mo funds WEST fully · purchase gap $400k')
    expect(screen.queryByText(/All 2026 goals/)).not.toBeInTheDocument()
  })

  it('never shows a stale Spanish brief as current advice', async () => {
    render(<CommandCenter />)
    const mona = (await screen.findByRole('heading', { name: 'Mona’s take' })).closest('[aria-labelledby="wolff-command-title"]') as HTMLElement
    await waitFor(() => expect(within(mona).getByText('Live plan')).toBeInTheDocument())
    expect(screen.queryByText(/Protege/)).not.toBeInTheDocument()
    fireEvent.click(within(mona).getByRole('button', { name: /Show last brief/ }))
    expect(within(mona).getByText(/Protege \$108,231/)).toBeInTheDocument()
    expect(within(mona).getByText(/may be out of date/)).toBeInTheDocument()
  })

  it('has a single alert surface', async () => {
    render(<CommandCenter />)
    await screen.findByRole('heading', { name: 'Needs attention' })
    expect(screen.queryByText(/budget alert/)).not.toBeInTheDocument()
    expect(screen.queryByText(/projected to overshoot/)).not.toBeInTheDocument()
    expect(screen.queryByText(/needs? a look/)).not.toBeInTheDocument()
  })

  it('reads owner spend and recent activity from the summary without browser queries', async () => {
    const from = vi.spyOn(supabase, 'from')
    render(<CommandCenter />)
    expect(await screen.findByText('Tacos')).toBeInTheDocument()
    expect(screen.getByLabelText('Spent this month by owner')).toHaveTextContent('B$5.2k')
    expect(from).not.toHaveBeenCalledWith('finance_transactions')
  })

  it('offers recovery instead of showing zero balances when initial loading fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    render(<CommandCenter />)
    expect(await screen.findByText('Your finances are unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('keeps the last successful data after a failed refresh', async () => {
    render(<CommandCenter />)
    await screen.findByText('$22,000')
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('last successful update'))
    expect(screen.getByText('$22,000')).toBeInTheDocument()
  })
})

describe('needs attention', () => {
  const row = (category: string, spent: number, budget: number, extra = {}) => ({ category, spent, budget, projected_month_total: spent, is_non_monthly: false, ...extra })

  it('caps at three rows, worst budget first, and skips fixed or non-monthly rows', () => {
    const items = buildAttentionItems({
      current_month: { month: '2026-10', budget_vs_actual: [row('Transport', 5767, 5500), row('Other', 16961, 5000), row('Rent', 46000, 45000, { is_fixed: true }), row('Electricity', 6067, 5000, { is_non_monthly: true })] },
      baby_plan: { checklist: [{ id: 'imss', title: 'Confirm IMSS weeks', window_end: '2026-10-31' }], untagged_candidates: 4 },
      goal_funding: { overdue_goals: [{ name: 'Car' }] },
    }, '2026-10-28')
    expect(items).toHaveLength(3)
    expect(items[0].title).toBe('Other is $12k over budget')
    expect(items[0].detail).toContain('1 more category over')
    expect(items[1].title).toMatch(/BBVA Infinite: pay by Oct 29/)
    expect(items[2].title).toBe('Confirm IMSS weeks')
  })

  it('links untagged baby spend to the family review', () => {
    const items = buildAttentionItems({ current_month: { month: '2026-10', budget_vs_actual: [] }, baby_plan: { untagged_candidates: 2 } }, '2026-10-12')
    expect(items).toEqual([expect.objectContaining({ id: 'baby-untagged', href: '/finance/family#baby-review' })])
  })
})
