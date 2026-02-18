-- Crypto Holdings table for finance portfolio tracking
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS finance_crypto_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  symbol TEXT NOT NULL CHECK (symbol IN ('BTC', 'ETH', 'SOL')),
  name TEXT NOT NULL,
  quantity NUMERIC(18,8) NOT NULL DEFAULT 0,
  avg_cost_basis_usd NUMERIC(12,2),
  wallet_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS policies
ALTER TABLE finance_crypto_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON finance_crypto_holdings
  FOR ALL USING (true) WITH CHECK (true);

-- Index for quick lookups
CREATE INDEX idx_crypto_holdings_symbol ON finance_crypto_holdings(symbol);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_crypto_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crypto_holdings_updated_at
  BEFORE UPDATE ON finance_crypto_holdings
  FOR EACH ROW
  EXECUTE FUNCTION update_crypto_updated_at();
