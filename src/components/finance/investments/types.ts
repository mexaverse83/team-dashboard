export interface StockHolding {
  id: string; ticker: string; name: string; exchange: string; asset_type: string
  shares: number; avg_cost_basis: number; currency: string; broker: string | null
  owner: string; notes: string | null
  // Private equity fields
  current_price_usd?: number; target_price_usd?: number
  expected_exit_start?: string; expected_exit_end?: string
  is_liquid?: boolean; valuation_type?: string
}

export interface FixedIncomeInstrument {
  id: string; instrument_type: string; name: string; institution: string
  principal: number; annual_rate: number; term_days: number | null
  maturity_date: string | null; is_liquid: boolean; auto_renew: boolean
  owner: string; tier: number; notes: string | null
  commission_rate: number | null; net_annual_rate: number | null; settlement_days: number | null
  balance_confirmed_at?: string | null; updated_at?: string | null
}

export interface RealEstateProperty {
  id: string; name: string; property_type: string
  purchase_price: number; purchase_date: string | null; current_value: number
  last_valuation_date: string | null; mortgage_balance: number | null
  monthly_mortgage: number | null; mortgage_rate: number | null
  mortgage_bank: string | null; rental_income: number | null
  monthly_expenses: number | null; address: string | null; owner: string; notes: string | null
}

export interface CryptoHoldingLite {
  quantity: number; symbol: string; avg_cost_basis_usd: number | null; cost_currency: string; owner: string
}

export type CryptoPrices = Record<string, { usd: number; mxn: number; change24h?: number }>

export interface RetirementRecordLite {
  owner: string
  current_balance: number
  /** 'afore' is locked until 65; 'infonavit' is earmarked for WEST. */
  instrument_type?: string
}

export interface NetWorthPoint { date: string; net_worth: number }

export type InvestmentsTab = 'Portfolio' | 'Crypto' | 'Stocks' | 'Fixed Income' | 'Real Estate' | 'Retirement'
export const INVESTMENT_TABS: InvestmentsTab[] = ['Portfolio', 'Crypto', 'Stocks', 'Fixed Income', 'Real Estate', 'Retirement']

/** 'All' or one of OWNERS (canonical casing). */
export type OwnerFilter = string

export interface FIGroup {
  representative: FixedIncomeInstrument
  allMembers: FixedIncomeInstrument[]
  filtered: FixedIncomeInstrument[]
  totalPrincipal: number
  totalValue: number
}

export type InvestmentSource = 'crypto' | 'stocks' | 'fixedIncome' | 'realEstate' | 'retirement'
