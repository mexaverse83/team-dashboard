import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { completeNetWorthPoints, computePortfolio, groupFixedIncome, paddedDomain } from '@/components/finance/investments/portfolio'
import { HoldingFormModal } from '@/components/finance/investments/holding-form-modal'
import { PrivateEquityCard } from '@/components/finance/private-equity-card'
import type { FixedIncomeInstrument, RealEstateProperty, StockHolding } from '@/components/finance/investments/types'
import { FamilyFutureStrip } from '@/components/finance/family-tracker'

vi.mock('recharts', () => {
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  const Nil = () => null
  return { ResponsiveContainer: Box, PieChart: Box, AreaChart: Box, Pie: Box, Cell: Nil, Tooltip: Nil, Area: Nil, Line: Nil, XAxis: Nil, YAxis: Nil, CartesianGrid: Nil }
})
// Lazy tabs resolve synchronously in tests
vi.mock('next/dynamic', async () => {
  const React = await import('react')
  return {
    default: (loader: () => Promise<React.ComponentType<Record<string, unknown>>>) => {
      return function Dynamic(props: Record<string, unknown>) {
        const [C, setC] = React.useState<React.ComponentType<Record<string, unknown>> | null>(null)
        React.useEffect(() => { loader().then(c => setC(() => c)) }, [])
        return C ? React.createElement(C, props) : null
      }
    },
  }
})
vi.mock('@/components/finance/west-tracker', () => ({ WestTracker: () => null, WestProjectionWithScenarios: () => null }))

const fi = (over: Partial<FixedIncomeInstrument>): FixedIncomeInstrument => ({
  id: 'fi', instrument_type: 'debt_fund', name: 'GBM+ Fondo', institution: 'GBM', principal: 100000, annual_rate: 0.12,
  term_days: null, maturity_date: null, is_liquid: true, auto_renew: false, owner: 'Bernardo', tier: 2, notes: null,
  commission_rate: null, net_annual_rate: null, settlement_days: null, updated_at: '2026-01-15T00:00:00Z', ...over,
})
const NOW = new Date('2026-10-28T12:00:00Z')

describe('investments portfolio math (F12)', () => {
  // Real rows mix casing: real estate / equity / retirement say 'bernardo', fixed income says 'Bernardo'
  const stocks: StockHolding[] = [
    { id: 'pe', ticker: 'NXM', name: 'Nexaminds — Employee Equity', exchange: 'US', asset_type: 'private_equity', shares: 10000, avg_cost_basis: 0.5, currency: 'USD', broker: null, owner: 'bernardo', notes: null, current_price_usd: 2 },
    { id: 'voo', ticker: 'VOO', name: 'Vanguard S&P 500', exchange: 'US', asset_type: 'etf', shares: 2, avg_cost_basis: 10000, currency: 'MXN', broker: 'GBM', owner: 'laura', notes: null },
  ]
  const realEstate: RealEstateProperty[] = [
    { id: 'west', name: 'WEST Apartment', property_type: 'pre_sale', purchase_price: 11204000, purchase_date: null, current_value: 11204000, last_valuation_date: null, mortgage_balance: 8000000, monthly_mortgage: null, mortgage_rate: null, mortgage_bank: null, rental_income: null, monthly_expenses: null, address: null, owner: 'bernardo', notes: null },
  ]
  const fixedIncome = [fi({ id: 'b', owner: 'Bernardo' }), fi({ id: 'l', owner: 'Laura', principal: 50000 })]
  const base = { stocks, realEstate, fixedIncome, crypto: [], prices: { BTC: { usd: 1, mxn: 18 } }, retirement: [{ owner: 'laura', current_balance: 350000 }], now: NOW }

  it('keeps lowercase-owned assets when filtering to an owner', () => {
    const p = computePortfolio({ ...base, ownerFilter: 'Bernardo' })
    expect(p.realEstate.map(r => r.id)).toEqual(['west'])
    expect(p.privateEquity.map(s => s.id)).toEqual(['pe'])
    expect(p.totals.realEstate).toBe(3204000)
    const laura = computePortfolio({ ...base, ownerFilter: 'Laura' })
    expect(laura.publicStocks.map(s => s.id)).toEqual(['voo'])
    expect(laura.totals.retirement).toBe(350000)
    expect(laura.realEstate).toEqual([])
  })

  it('values per-owner fixed income at the accrued estimate, not bare principal', () => {
    const p = computePortfolio({ ...base, ownerFilter: 'All' })
    expect(p.byOwner.fixedIncome.a).toBeGreaterThan(100000)
    expect(p.byOwner.fixedIncome.b).toBeGreaterThan(50000)
    expect(p.byOwner.fixedIncome.a + p.byOwner.fixedIncome.b).toBeCloseTo(p.totals.fixedIncome, 6)
    expect(p.byOwner.realEstate.a).toBe(3204000)
    expect(p.byOwner.stocks.a).toBeCloseTo(10000 * 2 * 18, 6)
  })

  it('computes P&L only over classes that have a cost basis', () => {
    const p = computePortfolio({ ...base, realEstate: [], stocks: [stocks[1]], retirement: [], ownerFilter: 'All' })
    // VOO is valued at cost; fixed income gains only its accrual
    expect(p.pl).toBeCloseTo(p.totals.fixedIncome - p.totals.fixedIncomeCost, 6)
  })

  it('counts only AFORE as locked retirement; Infonavit is earmarked for WEST', () => {
    const p = computePortfolio({ ...base, retirement: [
      { owner: 'bernardo', current_balance: 1000000, instrument_type: 'afore' },
      { owner: 'laura', current_balance: 350000, instrument_type: 'infonavit' },
    ], ownerFilter: 'All' })
    expect(p.totals.retirement).toBe(1350000)
    expect(p.totals.retirementLocked).toBe(1000000)
  })

  it('drops leading incomplete net-worth snapshots and pads the sparkline domain', () => {
    const pts = [{ date: 'a', net_worth: 2000000 }, { date: 'a2', net_worth: 10000000 }, { date: 'b', net_worth: 13000000 }, { date: 'c', net_worth: 13700000 }]
    expect(completeNetWorthPoints(pts).map(p => p.date)).toEqual(['b', 'c'])
    const [lo, hi] = paddedDomain([13000000, 13700000])
    expect(lo).toBeLessThan(13000000)
    expect(hi).toBeGreaterThan(13700000)
  })

  it('groups one fund held by both owners into a single card', () => {
    const groups = groupFixedIncome(fixedIncome, 'All', NOW)
    expect(groups).toHaveLength(1)
    expect(groups[0].allMembers).toHaveLength(2)
    expect(groups[0].totalPrincipal).toBe(150000)
    expect(groupFixedIncome(fixedIncome, 'laura', NOW)[0].filtered.map(i => i.id)).toEqual(['l'])
  })
})

describe('Investments page states', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('shows "—" and a retry for a source that failed instead of $0', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/investments/stocks')) return new Response(JSON.stringify({ error: 'Failed' }), { status: 500 })
      if (url.includes('/investments/fixed-income')) return Response.json({ instruments: [fi({})] })
      if (url.includes('/net-worth')) return Response.json({ snapshots: [], summary: { latest: null } })
      if (url.includes('/summary')) return Response.json({ baby_plan: null })
      if (url.includes('/investments/real-estate')) return Response.json({ properties: [] })
      if (url.includes('/retirement')) return Response.json({ records: [] })
      return Response.json({ holdings: [], prices: {} })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { InvestmentsClient } = await import('@/components/finance/investments-client')
    render(<InvestmentsClient />)
    expect(await screen.findByText(/Couldn.t load stocks\./)).toBeInTheDocument()
    const stocksCard = await screen.findByRole('button', { name: /Stocks didn.t load\. Retry/ })
    expect(stocksCard).toHaveTextContent('—')
    expect(stocksCard).not.toHaveTextContent('$0')
    expect(screen.getByRole('button', { name: /Fixed Income: \$/ })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0)
    const stockCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes('/investments/stocks')).length
    const before = stockCalls()
    fireEvent.click(stocksCard)
    await waitFor(() => expect(stockCalls()).toBeGreaterThan(before))
  })
})

describe('FamilyFutureStrip', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('renders from the baby prop without fetching the summary itself (perf-11)', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<FamilyFutureStrip baby={{
      due_month: '2027-04', months_to_birth: 6, planning_total: 120000, remaining_amount: 80000, spent_to_date: 40000,
      education: { monthly_contribution: 7000, projected_value: 4100000, tec_cost_min: 3000000, tec_cost_max: 5000000, coverage_pct_min: 100, start_month: '2027-05', target_month: '2045-08' },
    }} />)
    expect(screen.getByText('Birth envelope')).toBeInTheDocument()
    expect(screen.getByText('$80k to fund')).toBeInTheDocument()
    expect(screen.getByText('Tec degree fund')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('renders nothing without a plan', async () => {
    const { container } = render(<FamilyFutureStrip baby={null} />)
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })
})

describe('HoldingFormModal', () => {
  it('selects the owner segment for lowercase-owned rows and offers delete when editing', () => {
    const onDelete = vi.fn()
    render(
      <HoldingFormModal<{ id: string; owner: string }>
        open title="Edit stock" value={{ id: 's1', owner: 'laura' }} onChange={() => {}}
        fields={[{ kind: 'owner', key: 'owner' }]} onSubmit={() => {}} onClose={() => {}}
        saving={false} submitLabel="Save" onDelete={onDelete} deleteLabel="Delete holding" />,
    )
    expect(screen.getByRole('radio', { name: /Laura/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Delete holding' }))
    expect(onDelete).toHaveBeenCalled()
  })
})

describe('PrivateEquityCard', () => {
  afterEach(() => { vi.unstubAllEnvs() })

  it('reads the exit window as local calendar years (Jan 1 is not the previous year)', () => {
    vi.stubEnv('TZ', 'America/Mexico_City')
    render(<PrivateEquityCard fxRate={18} holding={{
      id: 'pe', name: 'Acme', ticker: 'ACME', owner: 'bernardo', shares: 1000, current_price_usd: 2, target_price_usd: 10,
      avg_cost_basis: 0.5, expected_exit_start: '2028-01-01', expected_exit_end: '2029-01-01',
    }} />)
    expect(screen.getAllByText(/2028–2029/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/2027/)).toBeNull()
  })
})
