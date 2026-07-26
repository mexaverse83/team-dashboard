import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MonthProjectionCard } from '@/components/finance/month-projection-card'

// The card reads the WEST monthly target from the shared client fetch.
vi.mock('@/lib/west-projection-client', () => ({
  fetchWestProjection: () => Promise.resolve({
    savings_plan: { months: [{ month: '2026-07', target: 73098 }] },
  }),
  westMonthTarget: (west: unknown, month: string) =>
    (west as { savings_plan: { months: Array<{ month: string; target: number }> } })
      .savings_plan.months.find(m => m.month === month)?.target ?? null,
}))

const projection = {
  expected_income: 209917,
  spent_so_far: 126300,
  projected_spend: 134385,
  known_upcoming_treatment: 0,
  projected_savings: 75532,
  method: 'pace',
}

describe('MonthProjectionCard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 6, 25, 19, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the projected savings figure', async () => {
    render(<MonthProjectionCard projection={projection} />)
    expect(screen.getByText('$75,532')).toBeInTheDocument()
    await act(async () => {})
  })

  it('renders nothing without a projection', async () => {
    const { container } = render(<MonthProjectionCard projection={null} />)
    await act(async () => {})
    expect(container).toBeEmptyDOMElement()
  })

  // The WEST transfer and the combined 2026 goals draw on the same GBM pot, so
  // the card must name which ask each bar measures — an unlabelled "covered"
  // read as a contradiction against the widget's over-committed warning.
  it('labels both monthly asks separately', async () => {
    render(<MonthProjectionCard projection={projection} goalMonthlyNeeded={103296} />)
    await waitFor(() => expect(screen.getByText(/WEST transfer \$73,098/)).toBeInTheDocument())
    expect(screen.getByText(/All 2026 goals \$103,296/)).toBeInTheDocument()
  })

  it('shows WEST ahead and goals short off the same projection', async () => {
    render(<MonthProjectionCard projection={projection} goalMonthlyNeeded={103296} />)
    await waitFor(() => expect(screen.getByText('+$2,434 ahead')).toBeInTheDocument())
    expect(screen.getByText(/\$27,764 short · 73%/)).toBeInTheDocument()
  })

  it('warns that the two targets are not additive', async () => {
    render(<MonthProjectionCard projection={projection} goalMonthlyNeeded={103296} />)
    await waitFor(() => expect(screen.getByText(/don’t add these targets/)).toBeInTheDocument())
  })

  it('omits the overlap note when only one target is known', async () => {
    render(<MonthProjectionCard projection={projection} />)
    await waitFor(() => expect(screen.getByText(/WEST transfer \$73,098/)).toBeInTheDocument())
    expect(screen.queryByText(/don’t add these targets/)).not.toBeInTheDocument()
    expect(screen.queryByText(/All 2026 goals/)).not.toBeInTheDocument()
  })

  it('ignores a zero or missing goal need', async () => {
    render(<MonthProjectionCard projection={projection} goalMonthlyNeeded={0} />)
    await waitFor(() => expect(screen.getByText(/WEST transfer \$73,098/)).toBeInTheDocument())
    expect(screen.queryByText(/All 2026 goals/)).not.toBeInTheDocument()
  })
})
