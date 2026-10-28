import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MonthProjectionCard } from '@/components/finance/month-projection-card'
import { resolveWestPlan, type HomeWestPlan } from '@/components/finance/command-center/west-plan'

const projection = {
  expected_income: 208800,
  income_received: 208800,
  income_still_scheduled: 0,
  spent_so_far: 116466,
  projected_spend: 125264,
  projected_savings: 83536,
  method: 'pace',
}

const plan: HomeWestPlan = {
  month_target: 152583,
  capacity_target: 118129,
  purchase_gap: 1442447,
  furnishing_budget: 1000000,
  months_to_delivery: 14,
  funded_pct: 87,
  cumulative_vs_capacity_since_jan: null,
  source: 'projection',
}

describe('MonthProjectionCard (This month hero)', () => {
  it('leads with a verdict and the projected savings figure', () => {
    render(<MonthProjectionCard projection={projection} westPlan={plan} monthLabel="October" monthEndLabel="Oct 31" dayOfMonth={28} daysInMonth={31} />)
    expect(screen.getByText('On track to save 40% of income')).toBeInTheDocument()
    expect(screen.getByText('$83,536')).toBeInTheDocument()
    expect(screen.getByText(/projected savings by Oct 31 · 4 days left/)).toBeInTheDocument()
  })

  it('measures one bar against the WEST capacity, amber below it, with the stretch as a marker', () => {
    render(<MonthProjectionCard projection={projection} westPlan={plan} />)
    const bar = screen.getByRole('progressbar', { name: 'Projected savings vs the WEST plan' })
    expect(bar).toHaveAttribute('aria-valuemax', '118129')
    expect(bar.firstElementChild).toHaveClass('bg-warning')
    expect(within(bar).getByTestId('plan-marker')).toBeInTheDocument()
    expect(screen.getByText('$34.6k to reach the plan')).toBeInTheDocument()
    expect(screen.getByText('Below plan')).toBeInTheDocument()
    // The stretch is broken into its two gaps, never a second target to add.
    expect(screen.getByText(/Stretch/)).toHaveTextContent('Stretch $152.6k/mo funds WEST fully · purchase gap $1.4M · furnishing $1M')
    expect(screen.queryByText(/2026 goals/)).not.toBeInTheDocument()
  })

  it('turns green once the projection reaches capacity', () => {
    render(<MonthProjectionCard projection={{ ...projection, projected_savings: 120000 }} westPlan={plan} />)
    expect(screen.getByRole('progressbar').firstElementChild).toHaveClass('bg-positive')
    expect(screen.getByText('$1.9k ahead of the plan')).toBeInTheDocument()
    expect(screen.getByText('On plan')).toBeInTheDocument()
  })

  it('shows a skeleton while WEST loads and a note when it is unavailable', () => {
    const { rerender } = render(<MonthProjectionCard projection={projection} westPlan={undefined} />)
    expect(screen.getByLabelText('Loading WEST plan')).toBeInTheDocument()
    rerender(<MonthProjectionCard projection={projection} westPlan={null} />)
    expect(screen.getByText(/WEST plan unavailable/)).toBeInTheDocument()
  })

  it('splits spend by owner in any casing', () => {
    render(<MonthProjectionCard projection={projection} westPlan={plan} ownerSpend={{ bernardo: 73500, Laura: 43000 }} />)
    expect(screen.getByLabelText('Spent this month by owner')).toHaveTextContent('B$73.5kL$43k')
    expect(screen.getByText('Still expected').nextElementSibling).toHaveTextContent('$8.8k')
  })

  it('renders nothing without a projection', () => {
    const { container } = render(<MonthProjectionCard projection={null} westPlan={plan} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('resolveWestPlan', () => {
  const projectionPayload = {
    target: 11204000,
    months_to_delivery: 14,
    projected_at_delivery: { total_projected: 9761553 },
    savings_plan: { purchase_gap: 1442447, furnishing_budget: 1000000, months: [{ month: '2026-10', capacity: 118129, target: 152583 }] },
  }

  it('prefers summary.west_plan when present', () => {
    const fromSummary = resolveWestPlan({ month_target: 1, capacity_target: 2, projected_savings: 0, pct_of_capacity: 0, pct_of_target: 0, purchase_gap: 3, furnishing_budget: 4, cumulative_vs_capacity_since_jan: -5, months_to_delivery: 6, funded_pct: 7 }, projectionPayload, '2026-10')
    expect(fromSummary).toMatchObject({ capacity_target: 2, cumulative_vs_capacity_since_jan: -5, source: 'summary' })
  })

  it('falls back to the WEST projection for the month', () => {
    expect(resolveWestPlan(undefined, projectionPayload, '2026-10')).toMatchObject({ capacity_target: 118129, month_target: 152583, funded_pct: 87, months_to_delivery: 14, source: 'projection' })
    expect(resolveWestPlan(undefined, projectionPayload, '2026-12')).toBeNull()
  })
})
