-- WEST Target Tracker — Real Estate Targets Table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS finance_real_estate_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  target_amount NUMERIC(14,2) NOT NULL,
  delivery_date DATE NOT NULL,

  -- Payments made
  amount_paid NUMERIC(14,2) DEFAULT 0,

  -- Scheduled payments
  monthly_payment NUMERIC(12,2),
  monthly_payment_end DATE,
  lump_sum_amount NUMERIC(12,2),
  lump_sum_date DATE,

  -- Apartment sale funding
  sale_price NUMERIC(14,2),
  sale_deposit_received NUMERIC(14,2),
  sale_remaining_date DATE,
  debt_ids_to_payoff UUID[],

  -- Investment assumptions
  investment_annual_return NUMERIC(6,4),

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE finance_real_estate_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON finance_real_estate_targets FOR ALL USING (true);

-- Seed the WEST apartment target
INSERT INTO finance_real_estate_targets (
  name, target_amount, delivery_date,
  amount_paid, monthly_payment, monthly_payment_end,
  lump_sum_amount, lump_sum_date,
  sale_price, sale_deposit_received, sale_remaining_date,
  investment_annual_return, is_active
) VALUES (
  'WEST Apartment', 11204000, '2027-12-31',
  2504700, 10000, '2027-03-31',
  100000, '2026-12-01',
  7200000, 750000, '2026-04-01',
  0.103, true
);
