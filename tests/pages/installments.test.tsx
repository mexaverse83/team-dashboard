/**
 * Unit Tests — MSI Installments page (/finance/installments)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { supabase } from '@/lib/supabase'
import { SEED_CATEGORIES } from '@/lib/seed-finance'
import { addMonthsKey, localDateKey } from '@/lib/dates'
import { monthlyIncomeFrom } from '@/components/finance/installments-client'

vi.setConfig({ testTimeout: 20000 })

vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const icons: Record<string, unknown> = {}
  for (const key of Object.keys(actual)) {
    icons[key] = (props: Record<string, unknown>) => <svg data-testid={`icon-${key.toLowerCase()}`} {...props} />
  }
  return icons
})

vi.mock('recharts', () => {
  const Pass = ({ children }: any) => <div>{children}</div>
  const Nil = () => null
  return { BarChart: Pass, ResponsiveContainer: Pass, Bar: Nil, XAxis: Nil, YAxis: Nil, CartesianGrid: Nil, Tooltip: Nil }
})

vi.mock('@/components/ui/modal', () => ({
  Modal: ({ children, open, title }: any) => open ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null,
}))

const TODAY = localDateKey()
const PLAN = {
  id: 'i1', name: 'MacBook Pro', merchant: 'Liverpool', total_amount: 48000, installment_count: 12, installment_amount: 4000,
  start_date: `${addMonthsKey(TODAY.slice(0, 7), -3)}-15`, end_date: `${addMonthsKey(TODAY.slice(0, 7), 8)}-15`,
  payments_made: 4, credit_card: 'BBVA Infinite', category_id: 'cat-other', notes: null, is_active: true, owner: 'Bernardo',
}

function chain(res: any) {
  const c: any = { then: (ok: any, err: any) => Promise.resolve(res).then(ok, err) }
  for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'limit', 'single', 'range']) c[m] = vi.fn(() => c)
  return c
}

function setup(tables: Record<string, any[]>) {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve({
    ok: true, json: () => Promise.resolve({ data: url.includes('recurring-income') ? tables.finance_recurring_income ?? [] : [] }),
  })))
  vi.mocked(supabase.from).mockImplementation(((table: string) => ({
    select: vi.fn(() => chain({ data: tables[table] ?? [], error: null })),
  })) as unknown as typeof supabase.from)
}

async function renderPage() {
  const { InstallmentsClient } = await import('@/components/finance/installments-client')
  render(<InstallmentsClient />)
  await waitFor(() => expect(screen.getByRole('heading', { name: 'MSI Installments' })).toBeInTheDocument())
}

describe('Installments page', () => {
  beforeEach(() => vi.clearAllMocks())

  it('counts salaries from finance_recurring_income, so a normal MSI load raises no warning', async () => {
    setup({
      finance_installments: [PLAN],
      finance_categories: SEED_CATEGORIES,
      finance_income_sources: [{ id: 's1', name: 'Rent', amount: 6000, frequency: 'monthly', is_active: true }],
      finance_recurring_income: [{ id: 'r1', amount: 90000, recurrence: 'monthly', active: true, start_date: null }],
    })
    await renderPage()
    expect(screen.queryByText(/of monthly income/)).not.toBeInTheDocument()
  })

  it('warns when MSI really is a large share of income', async () => {
    setup({ finance_installments: [PLAN], finance_categories: SEED_CATEGORIES, finance_income_sources: [{ id: 's1', amount: 6000, frequency: 'monthly', is_active: true }] })
    await renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('MSI takes 67% of monthly income')
  })

  it('shows neutral amounts, plain progress copy and labelled actions (no emoji markers)', async () => {
    setup({ finance_installments: [PLAN], finance_categories: SEED_CATEGORIES })
    await renderPage()
    expect(screen.getByText(/4 of 12 paid · ends/)).toHaveTextContent(/[89] months left/)
    expect(screen.getByRole('button', { name: 'Log payment 5 of 12 for MacBook Pro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit MacBook Pro' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/💳|✅/)
    expect(document.querySelector('.text-rose-600, .text-red-600, .text-emerald-600')).toBeNull()
  })
})

describe('monthlyIncomeFrom', () => {
  it('adds recurring salaries (pro-rated, started, not ended) to income-source extras', () => {
    expect(monthlyIncomeFrom(
      [{ amount: 1200, frequency: 'yearly' }],
      [
        { amount: 50000, recurrence: 'monthly', active: true, start_date: '2026-01-01' },
        { amount: 20000, recurrence: 'bimonthly', active: true, start_date: null },
        { amount: 18500, recurrence: 'monthly', active: true, start_date: '2026-11-01' },
        { amount: 9000, recurrence: 'monthly', active: true, start_date: null, end_date: '2026-09-30' },
      ],
      '2026-10-28',
    )).toBe(100 + 50000 + 10000)
  })
})
