import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { FamilyClient, groupPlanEvents, BABY_KEYWORDS } from '@/components/finance/family-client'

vi.mock('@/components/finance/family-tracker', () => ({ EducationProjectionWithScenarios: () => null }))

const ev = (month: string, amount: number, label: string) => ({ date: `${month}-15`, month, amount, minAmount: 0, maxAmount: 0, label })
const monthly = [
  ev('2026-09', 4000, 'Prenatal care (consultas, ultrasonido, labs)'),
  ...['2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].map(m => ev(m, 4000, 'Prenatal care')),
  ev('2027-03', 29000, 'Prenatal care + gear & setup'),
  ev('2027-04', 45000, 'Birth — coinsurance'),
]
const summary = {
  baby_plan: {
    name: 'Baby — April 2027', due_month: '2027-04', months_to_birth: 6, planning_total: 98000,
    monthly_events: monthly, remaining_events: monthly.slice(1), remaining_amount: 94000, spent_to_date: 0,
    current_month_commitment: 4000, current_month_event: monthly[1], checklist: [],
    education: { name: 'Education Fund 2045', monthly_contribution: 5000, start_month: '2027-05', target_month: '2045-08', annual_return_rate: 0.1, education_inflation_rate: 0.06, months: 220, contributed: 1100000, projected_value: 4000000, tec_cost_min: 2000000, tec_cost_max: 3500000, coverage_pct_min: 114, coverage_pct_max: 200 },
  },
}

const rows = [
  { id: 't1', transaction_date: '2026-10-12', merchant: 'Eco bebe', description: null, amount_mxn: 2800, tags: [], owner: 'Laura', category_id: 'health' },
  { id: 't2', transaction_date: '2026-10-05', merchant: 'Cita gine', description: null, amount_mxn: 2100, tags: [], owner: 'laura', category_id: 'health' },
  { id: 't3', transaction_date: '2026-10-03', merchant: 'Farmacia', description: 'Ibuprofeno', amount_mxn: 300, tags: [], owner: 'Bernardo', category_id: 'health' },
  { id: 't4', transaction_date: '2026-09-20', merchant: 'Dha prenatal vitamins', description: null, amount_mxn: 753, tags: ['baby'], owner: 'Laura', category_id: 'shopping' },
]

const update = vi.fn()
function mockSupabase() {
  vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
    const data = table === 'finance_categories'
      ? [{ id: 'health', name: 'Health' }, { id: 'shopping', name: 'Shopping' }, { id: 'dining', name: 'Dining Out' }]
      : rows
    const chain: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) }
    for (const m of ['select', 'eq', 'gte', 'in', 'order', 'range']) chain[m] = vi.fn(() => chain)
    chain.update = (patch: unknown) => {
      update(patch)
      return { eq: (_col: string, id: string) => Promise.resolve({ data: null, error: null, id }) }
    }
    return chain as unknown as ReturnType<typeof supabase.from>
  })
}

beforeEach(() => {
  update.mockReset()
  mockSupabase()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => summary })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Family & Baby', () => {
  it('collapses repeated prenatal months into one row', () => {
    const groups = groupPlanEvents(monthly)
    expect(groups.map(g => [g.label, g.count])).toEqual([['Prenatal care', 6], ['Prenatal care + gear & setup', 1], ['Birth — coinsurance', 1]])
  })

  it('names the page after its nav label and shows the grouped schedule', async () => {
    render(<FamilyClient />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Family & Baby' })).toBeInTheDocument()
    expect(screen.getByText('/mo × 6')).toBeInTheDocument()
  })

  it('lists untagged prenatal-looking spend and tags only what the user selects', async () => {
    render(<FamilyClient />)
    expect(await screen.findByText('Eco bebe')).toBeInTheDocument()
    expect(screen.getByText('Cita gine')).toBeInTheDocument()
    expect(screen.queryByText('Farmacia')).not.toBeInTheDocument()
    expect(screen.queryByText('Dha prenatal vitamins')).not.toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('checkbox', { name: /Eco bebe/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Tag 1 as baby' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update).toHaveBeenCalledWith({ tags: ['baby'] })
  })

  it('matches the prenatal keywords', () => {
    for (const text of ['Eco bebe ', 'Cita gine', 'ULTRASONIDO 3D', 'Pañales', 'Pediatra']) expect(BABY_KEYWORDS.test(text)).toBe(true)
    expect(BABY_KEYWORDS.test('Ibuprofeno farmacia')).toBe(false)
  })
})
