// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSavingsPlan, projectWest, type WestSchedule } from '@/lib/west-projection'
import { getWestProjection } from '@/lib/server/west'
import { monthlyNetHistory, recentNetRunRate } from '@/lib/summary/history'
import { fakeSupabase } from './summary/fake-supabase'

vi.mock('@/lib/crypto-prices', () => ({ fetchCryptoPrices: async () => ({ BTC: { usd: 100000, mxn: 1800000, change24h: 0 } }) }))

const schedule: WestSchedule = {
  target_amount: 11_204_000,
  delivery_date: '2027-09-01',
  monthly_payment: 10_000,
  monthly_payment_end_month: '2027-03',
  lump_sum_amount: 90_000,
  lump_sum_month: '2026-12',
  lump_sum_date: '2026-12-01',
  sale_remaining_date: null,
  sale_net_proceeds: 0,
  infonavit: 350_000,
  current_market_value: 11_204_000,
}
const balances = { paid: 2_600_000, investments: 5_950_000, crypto: 500_000 }
const rates = { annual_return: 0.095, crypto_growth: 0.15, appreciation: 0.125 }

const ORIGINAL_TZ = process.env.TZ
afterEach(() => { process.env.TZ = ORIGINAL_TZ })

describe('projectWest', () => {
  it('places the balloon in its month on any server timezone', () => {
    const runs = ['UTC', 'America/Mexico_City'].map(tz => {
      process.env.TZ = tz
      return projectWest(schedule, balances, rates, '2026-10-28')
    })
    expect(runs[0]).toEqual(runs[1])
    const byMonth = Object.fromEntries(runs[0].months.map(m => [m.month, m.paid]))
    expect(byMonth['2026-11']).toBe(2_610_000)
    expect(byMonth['2026-12']).toBe(2_710_000) // +10k monthly +90k balloon
    expect(byMonth['2027-04']).toBe(byMonth['2027-03']) // payments ended
    expect(runs[0].months.at(-1)?.month).toBe('2027-09')
  })

  it('treats the current month as a snapshot', () => {
    const run = projectWest(schedule, balances, rates, '2026-10-28')
    expect(run.months[0]).toMatchObject({ month: '2026-10', paid: 2_600_000, investments: 5_950_000, total: 2_600_000 + 5_950_000 + 500_000 + 350_000 })
  })
})

describe('buildSavingsPlan', () => {
  it('reports feasibility and the options when the stretch exceeds capacity', () => {
    const plan = buildSavingsPlan({
      schedule, today: '2026-10-28', baseCapacity: 85_000, annualReturn: 0.095,
      purchaseGap: 1_442_447, furnishingBudget: 1_000_000, installments: [], yearlyBonus: 37_400,
      babyEvents: [{ month: '2027-03', amount: 29_000 }, { month: '2027-04', amount: 45_000 }], babyRoutine: 4_000,
      education: { monthlyContribution: 7_000, startMonth: '2027-05' },
    })
    expect(plan.feasible).toBe(false)
    expect(plan.projected_shortfall_at_delivery).toBeGreaterThan(0)
    expect(plan.options.map(o => o.kind)).toEqual(['finance', 'cut_furnishing', 'raise_savings'])
    const cap = Object.fromEntries(plan.months.map(m => [m.month, m.capacity]))
    expect(cap['2026-12']).toBe(85_000 + 37_400 - 90_000)
    expect(cap['2027-03']).toBe(85_000 - 25_000)
    expect(cap['2027-04']).toBe(85_000 + 10_000 - 41_000) // WEST payments end, birth
    expect(cap['2027-05']).toBe(85_000 + 10_000 - 7_000) // education fund starts
  })
})

describe('capacity history', () => {
  it('excludes windfall income and one-off lumps', () => {
    const rows = [
      { transaction_date: '2026-05-01', type: 'income', amount_mxn: 200000, tags: [] },
      { transaction_date: '2026-05-20', type: 'income', amount_mxn: 80000, tags: ['fertility', 'windfall'] },
      { transaction_date: '2026-05-15', type: 'expense', amount_mxn: 92000, tags: ['fertility'] },
      ...[1, 2, 3, 4, 5].map(d => ({ transaction_date: `2026-05-0${d}`, type: 'expense', amount_mxn: 22000, tags: [] })),
      ...['2026-06', '2026-07', '2026-08'].flatMap(m => [
        { transaction_date: `${m}-01`, type: 'income', amount_mxn: 200000, tags: [] },
        ...[1, 2, 3, 4, 5].map(d => ({ transaction_date: `${m}-1${d}`, type: 'expense', amount_mxn: 23000, tags: [] })),
      ]),
    ]
    const history = monthlyNetHistory(rows, { beforeMonth: '2026-09' })
    expect(history[0]).toMatchObject({ month: '2026-05', income: 200000, windfall_excluded: 80000, lumps_excluded: 92000, net: 90000 })
    expect(recentNetRunRate(history)).toBe(85000)
  })
})

describe('getWestProjection', () => {
  const tables = () => ({
    finance_real_estate_targets: [{
      is_active: true, target_amount: 11_204_000, delivery_date: '2027-09-01', monthly_payment: 10000, monthly_payment_end: '2027-03-01',
      lump_sum_amount: 90000, lump_sum_date: '2026-12-01', amount_paid: 2_600_000, updated_at: '2026-10-01T00:00:00Z',
      sale_price: 7_200_000, sale_deposit_received: 750_000, sale_remaining_date: '2026-04-10', laura_infonavit_mxn: 350000,
    }],
    finance_debts: [],
    finance_fixed_income: [{ institution: 'GBM', principal: 5_950_000, annual_rate: 0, updated_at: '2026-10-20T00:00:00Z' }],
    finance_crypto_holdings: [{ symbol: 'BTC', quantity: 0.25 }],
    finance_installments: [],
    finance_income_sources: [{ name: 'Aguinaldo', amount: 37400, frequency: 'yearly', is_active: true }],
    finance_transactions: [
      { id: 'w1', transaction_date: '2026-10-05', type: 'expense', amount_mxn: 10000, merchant: 'WEST', tags: [] },
      ...['2026-07', '2026-08', '2026-09'].flatMap((m, i) => [
        { id: `i${i}`, transaction_date: `${m}-01`, type: 'income', amount_mxn: 200000, tags: [] },
        ...[1, 2, 3, 4, 5].map(d => ({ id: `e${i}${d}`, transaction_date: `${m}-1${d}`, type: 'expense', amount_mxn: 23000, tags: [] })),
      ]),
    ],
  })

  it('client sliders and server agree on the gap (same engine, same schedule)', async () => {
    const data = await getWestProjection(fakeSupabase(tables()), { now: new Date('2026-10-28T18:00:00Z') })
    const client = projectWest(data.schedule, {
      paid: data.current_status.amount_paid, investments: data.current_status.investment_value, crypto: data.current_status.crypto_value,
    }, { annual_return: data.assumptions.investment_return, crypto_growth: data.assumptions.crypto_growth, appreciation: data.assumptions.appreciation_rate }, '2026-10-28')
    expect(client.gap).toBe(data.projected_at_delivery?.gap)
  })

  it('reports the live position (paid + GBM + crypto + Infonavit) and staleness', async () => {
    const data = await getWestProjection(fakeSupabase(tables()), { now: new Date('2026-10-28T18:00:00Z') })
    expect(data.current_status).toMatchObject({ amount_paid: 2_610_000, investment_value: 5_950_000, crypto_value: 450_000, crypto_value_known: true })
    expect(data.current_status.total_available).toBe(2_610_000 + 5_950_000 + 450_000 + 350_000)
    expect(data.savings_plan.assumptions.base_capacity).toBe(85000)
    expect(data.savings_plan.months.find(m => m.month === '2026-12')?.notes.join(' ')).toMatch(/balloon/)
    expect(data.staleness.gbm_confirmed_at).toBe('2026-10-20T00:00:00Z')
    expect(data.months_to_delivery).toBe(11)
  })
})
