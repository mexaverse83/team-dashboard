-- ================================================================
-- Recurring Income Auto-Registration
-- Run in: Finance Supabase SQL Editor (ebzvuszpqqtcvwewxcli)
-- ================================================================

-- 1. Add `source` column to finance_transactions
--    Tracks whether a transaction was auto-generated or manual
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

COMMENT ON COLUMN finance_transactions.source IS
  'Origin of the transaction: null=manual, recurring_income, recurring_expense';

CREATE INDEX IF NOT EXISTS idx_transactions_source
  ON finance_transactions(source) WHERE source IS NOT NULL;

-- 2. Create finance_recurring_income table
CREATE TABLE IF NOT EXISTS finance_recurring_income (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  owner         TEXT        NOT NULL DEFAULT 'bernardo',   -- bernardo | laura | joint
  category      TEXT        NOT NULL DEFAULT 'salary',     -- salary | freelance | passive | bonus | other
  recurrence    TEXT        NOT NULL DEFAULT 'monthly',    -- monthly | bimonthly | annual
  day_of_month  INTEGER     NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  active        BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_income_active
  ON finance_recurring_income(active) WHERE active = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_recurring_income_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recurring_income_updated_at ON finance_recurring_income;
CREATE TRIGGER trg_recurring_income_updated_at
  BEFORE UPDATE ON finance_recurring_income
  FOR EACH ROW EXECUTE FUNCTION update_recurring_income_updated_at();

-- 3. Seed data
INSERT INTO finance_recurring_income (name, amount, owner, category, recurrence, day_of_month, active)
VALUES
  ('Nexaminds Salary', 120000.00, 'bernardo', 'salary', 'monthly', 1, true),
  ('Laura Salary',      74000.00, 'laura',    'salary', 'monthly', 1, true),
  ('Aguinaldo (avg)',    3000.00, 'joint',    'bonus',  'monthly', 1, false)  -- inactive; log $36K manually each December
ON CONFLICT DO NOTHING;

-- 4. pg_cron job (Option A — only if pg_cron extension is enabled in Supabase)
-- To check: SELECT * FROM pg_extension WHERE extname = 'pg_cron';
-- To enable: go to Supabase Dashboard → Database → Extensions → enable pg_cron
--
-- Uncomment the block below ONLY if pg_cron is enabled:

/*
SELECT cron.schedule(
  'auto-register-recurring-income',
  '0 6 * * *',   -- Daily at 06:00 UTC (midnight CST) — catches all day_of_month values
  $$
  INSERT INTO finance_transactions (
    type, amount, currency, amount_mxn,
    merchant, description,
    transaction_date, is_recurring,
    tags, source, owner
  )
  SELECT
    'income',
    ri.amount,
    'MXN',
    ri.amount,
    ri.name,
    'Auto: ' || ri.name || ' (' || ri.category || ')',
    CURRENT_DATE,
    true,
    ARRAY['auto-income'],
    'recurring_income',
    ri.owner
  FROM finance_recurring_income ri
  WHERE ri.active = true
    AND ri.recurrence = 'monthly'
    AND ri.day_of_month = EXTRACT(DAY FROM CURRENT_DATE)
    -- Duplicate guard: skip if already registered this month
    AND NOT EXISTS (
      SELECT 1 FROM finance_transactions ft
      WHERE ft.source = 'recurring_income'
        AND ft.merchant = ri.name
        AND date_trunc('month', ft.transaction_date) = date_trunc('month', CURRENT_DATE)
    );
  $$
);
*/

-- 5. Verify setup
SELECT
  'finance_recurring_income' AS table_name,
  COUNT(*) AS row_count,
  SUM(CASE WHEN active THEN amount ELSE 0 END) AS active_monthly_income
FROM finance_recurring_income;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'finance_transactions' AND column_name = 'source';
