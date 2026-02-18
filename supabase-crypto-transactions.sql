-- Crypto transaction log — run in Supabase SQL Editor
-- Run AFTER supabase-crypto.sql and supabase-crypto-add-owner.sql

CREATE TABLE IF NOT EXISTS crypto_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES finance_crypto_holdings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  quantity NUMERIC(18,8) NOT NULL,
  price_per_coin_mxn NUMERIC(14,2) NOT NULL,
  total_mxn NUMERIC(14,2) NOT NULL,
  fee_mxn NUMERIC(10,2) DEFAULT 0,
  exchange TEXT,
  notes TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE crypto_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for service role" ON crypto_transactions
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_crypto_tx_holding ON crypto_transactions(holding_id);
CREATE INDEX idx_crypto_tx_date ON crypto_transactions(transaction_date DESC);
