-- Debt-Subscription Sync: Add debt_id to finance_recurring
-- Run this in Supabase SQL Editor

-- 1. Add debt_id column to link subscriptions to debts
ALTER TABLE finance_recurring 
ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES finance_debts(id) ON DELETE SET NULL;

-- 2. Auto-link existing subscriptions to their debts
UPDATE finance_recurring SET debt_id = 'd1d47f75-848f-40ff-9dc4-fb16b04e4a9e' 
WHERE name ILIKE '%BBVA%' AND debt_id IS NULL;

UPDATE finance_recurring SET debt_id = '40fffad6-977a-4973-8c5a-c65d520c1cb3' 
WHERE name ILIKE '%Infonavit%' AND debt_id IS NULL;

-- 3. Verify the links
SELECT r.name, r.amount, r.debt_id, d.name as debt_name, d.balance
FROM finance_recurring r
LEFT JOIN finance_debts d ON r.debt_id = d.id
WHERE r.debt_id IS NOT NULL;

-- 4. Make sure finance_debt_payments table exists with correct schema
CREATE TABLE IF NOT EXISTS finance_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid REFERENCES finance_debts(id) ON DELETE CASCADE,
  payment_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  principal_portion numeric(12,2) NOT NULL,
  interest_portion numeric(12,2) NOT NULL,
  remaining_balance numeric(12,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON finance_debt_payments(debt_id, payment_date DESC);
