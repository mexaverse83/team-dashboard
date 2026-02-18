-- Investments Hub — New Tables
-- Run in Supabase SQL Editor
-- Creates: finance_stock_holdings, finance_fixed_income, finance_real_estate, finance_portfolio_snapshots

-- 1. Stock Holdings
CREATE TABLE IF NOT EXISTS finance_stock_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  exchange TEXT DEFAULT 'US',
  asset_type TEXT DEFAULT 'stock',
  shares NUMERIC(12,6) NOT NULL DEFAULT 0,
  avg_cost_basis NUMERIC(12,2),
  currency TEXT DEFAULT 'MXN',
  broker TEXT,
  owner TEXT DEFAULT 'bernardo',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_stock_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON finance_stock_holdings FOR ALL USING (true);

-- 2. Fixed Income
CREATE TABLE IF NOT EXISTS finance_fixed_income (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  instrument_type TEXT NOT NULL,
  name TEXT NOT NULL,
  institution TEXT NOT NULL,
  principal NUMERIC(14,2) NOT NULL,
  annual_rate NUMERIC(6,4),
  term_days INT,
  maturity_date DATE,
  is_liquid BOOLEAN DEFAULT false,
  auto_renew BOOLEAN DEFAULT false,
  owner TEXT DEFAULT 'bernardo',
  tier INT DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_fixed_income ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON finance_fixed_income FOR ALL USING (true);

-- 3. Real Estate
CREATE TABLE IF NOT EXISTS finance_real_estate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  property_type TEXT DEFAULT 'apartment',
  purchase_price NUMERIC(14,2),
  purchase_date DATE,
  current_value NUMERIC(14,2),
  last_valuation_date DATE,
  mortgage_balance NUMERIC(14,2),
  monthly_mortgage NUMERIC(12,2),
  mortgage_rate NUMERIC(6,4),
  mortgage_bank TEXT,
  rental_income NUMERIC(12,2),
  monthly_expenses NUMERIC(12,2),
  address TEXT,
  owner TEXT DEFAULT 'bernardo',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_real_estate ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON finance_real_estate FOR ALL USING (true);

-- 4. Portfolio Snapshots (daily history)
CREATE TABLE IF NOT EXISTS finance_portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  snapshot_date DATE NOT NULL,
  crypto_value_mxn NUMERIC(14,2) DEFAULT 0,
  stocks_value_mxn NUMERIC(14,2) DEFAULT 0,
  fixed_income_value_mxn NUMERIC(14,2) DEFAULT 0,
  real_estate_equity_mxn NUMERIC(14,2) DEFAULT 0,
  total_value_mxn NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

ALTER TABLE finance_portfolio_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON finance_portfolio_snapshots FOR ALL USING (true);
