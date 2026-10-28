'use client'

import { useFinanceData } from '@/hooks/use-finance-data'
import type {
  CryptoHoldingLite, CryptoPrices, FixedIncomeInstrument, InvestmentSource, NetWorthPoint,
  RealEstateProperty, RetirementRecordLite, StockHolding,
} from './types'

export interface InvestmentsData {
  stocks: StockHolding[]
  fixedIncome: FixedIncomeInstrument[]
  realEstate: RealEstateProperty[]
  crypto: CryptoHoldingLite[]
  prices: CryptoPrices | null
  retirement: RetirementRecordLite[]
  /** One flag per source: a failed source renders '—' + Retry, never $0 (VIS-17). */
  errors: Partial<Record<InvestmentSource, string>>
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try { message = (await res.json())?.error || message } catch { /* non-JSON body */ }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

export async function fetchInvestments(signal: AbortSignal): Promise<InvestmentsData> {
  const [crypto, stocks, fi, re, retirement] = await Promise.allSettled([
    getJson<{ holdings?: CryptoHoldingLite[]; prices?: CryptoPrices | null }>('/api/finance/crypto', signal),
    getJson<{ stocks?: StockHolding[] }>('/api/finance/investments/stocks', signal),
    getJson<{ instruments?: FixedIncomeInstrument[] }>('/api/finance/investments/fixed-income', signal),
    getJson<{ properties?: RealEstateProperty[] }>('/api/finance/investments/real-estate', signal),
    getJson<{ records?: RetirementRecordLite[] }>('/api/finance/retirement', signal),
  ])
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const errors: InvestmentsData['errors'] = {}
  const pick = <T,>(r: PromiseSettledResult<T>, key: InvestmentSource): T | null => {
    if (r.status === 'fulfilled') return r.value
    errors[key] = r.reason instanceof Error ? r.reason.message : 'Unavailable'
    return null
  }
  const c = pick(crypto, 'crypto')
  return {
    crypto: c?.holdings ?? [],
    prices: c?.prices ?? null,
    stocks: pick(stocks, 'stocks')?.stocks ?? [],
    fixedIncome: pick(fi, 'fixedIncome')?.instruments ?? [],
    realEstate: pick(re, 'realEstate')?.properties ?? [],
    retirement: pick(retirement, 'retirement')?.records ?? [],
    errors,
  }
}

export function useInvestmentsData() {
  return useFinanceData<InvestmentsData>('investments', fetchInvestments)
}

export interface NetWorthData { latest: { date: string; net_worth: number } | null; points: NetWorthPoint[] }

async function fetchNetWorth(signal: AbortSignal): Promise<NetWorthData> {
  const json = await getJson<{ snapshots?: Array<{ snapshot_date: string; net_worth: number }>; summary?: { latest?: { date: string; net_worth: number } | null } }>(
    '/api/finance/net-worth?days=365', signal,
  )
  return {
    latest: json.summary?.latest ?? null,
    points: (json.snapshots ?? []).map(s => ({ date: s.snapshot_date, net_worth: Number(s.net_worth) || 0 })),
  }
}

/** Household net worth from the snapshot history — the same source as Home. */
export function useNetWorth() {
  return useFinanceData<NetWorthData>('investments:net-worth', fetchNetWorth)
}
