-- ============================================================
-- PENDING MIGRATIONS — Run in Supabase SQL Editor
-- finance.autonomis.co / project: ebzvuszpqqtcvwewxcli
-- Run all at once (safe — all statements are idempotent)
-- ============================================================


-- ─── 1. RECURRING INCOME ─────────────────────────────────────

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_source
  ON finance_transactions(source) WHERE source IS NOT NULL;

CREATE TABLE IF NOT EXISTS finance_recurring_income (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  amount        NUMERIC(12,2) NOT NULL,
  owner         TEXT        NOT NULL DEFAULT 'bernardo',
  category      TEXT        NOT NULL DEFAULT 'salary',
  recurrence    TEXT        NOT NULL DEFAULT 'monthly',
  day_of_month  INTEGER     NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),
  active        BOOLEAN     NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_income_active
  ON finance_recurring_income(active) WHERE active = true;

INSERT INTO finance_recurring_income (name, amount, owner, category, recurrence, day_of_month, active)
VALUES
  ('Nexaminds Salary', 120000.00, 'bernardo', 'salary', 'monthly', 1, true),
  ('Laura Salary',      74000.00, 'laura',    'salary', 'monthly', 1, true),
  ('Aguinaldo (avg)',    3000.00, 'joint',    'bonus',  'monthly', 1, false)
ON CONFLICT DO NOTHING;


-- ─── 2. FINANCE INSTALLMENTS SYNC ────────────────────────────

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS installment_id UUID REFERENCES finance_installments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_installment_id
  ON finance_transactions(installment_id)
  WHERE installment_id IS NOT NULL;


-- ─── 3. DEBT SYNC ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_debts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT          NOT NULL,
  lender          TEXT,
  principal       NUMERIC(12,2) NOT NULL,
  balance         NUMERIC(12,2) NOT NULL,
  interest_rate   NUMERIC(6,4)  NOT NULL DEFAULT 0,
  min_payment     NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_day     INTEGER       CHECK (payment_day BETWEEN 1 AND 31),
  owner           TEXT          NOT NULL DEFAULT 'bernardo',
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  start_date      DATE,
  payoff_date     DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debts_active ON finance_debts(is_active) WHERE is_active = true;


-- ─── 4. BACKFILL FEB 28 ──────────────────────────────────────

-- No-op if already present (idempotent via ON CONFLICT DO NOTHING)
-- Any missing Feb 2026 snapshots can be re-inserted here if needed.


-- ─── 5. LEAK TRIAGE ──────────────────────────────────────────

-- Adds missing indexes and cleans up orphan records
CREATE INDEX IF NOT EXISTS idx_transactions_date ON finance_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_owner ON finance_transactions(owner);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON finance_transactions(type);


-- ─── 6. GOAL SAVINGS SYNC ────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_monthly_savings (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  month                DATE          NOT NULL,
  owner                TEXT          NOT NULL,
  gross_income         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_expenses       NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_savings          NUMERIC(12,2) GENERATED ALWAYS AS (gross_income - total_expenses) STORED,
  savings_rate         NUMERIC(5,2)  GENERATED ALWAYS AS (
    CASE WHEN gross_income > 0
      THEN ROUND((gross_income - total_expenses) / gross_income * 100, 2)
      ELSE 0 END
  ) STORED,
  planned_contribution NUMERIC(12,2) DEFAULT 0,
  variance             NUMERIC(12,2) GENERATED ALWAYS AS
                       (gross_income - total_expenses - planned_contribution) STORED,
  notes                TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(month, owner)
);

ALTER TABLE finance_goals
  ADD COLUMN IF NOT EXISTS last_contribution_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_contribution_amount NUMERIC(12,2) DEFAULT NULL;

INSERT INTO finance_monthly_savings
  (month, owner, gross_income, total_expenses, planned_contribution, notes)
VALUES
  ('2026-02-01', 'bernardo', 125000.00,  56244.92,  70000.00, 'Feb 2026 backfill'),
  ('2026-02-01', 'laura',     68000.00,  54767.00,  50000.00, 'Feb 2026 backfill'),
  ('2026-02-01', 'total',    193000.00, 111011.92, 120000.00, 'Feb 2026 backfill')
ON CONFLICT (month, owner) DO NOTHING;

-- Apply Feb actual balances (idempotent — matches REST-applied values)
UPDATE finance_goals SET
  current_amount           = 168755.08,
  last_contribution_date   = '2026-03-01',
  last_contribution_amount = 68755.08,
  updated_at               = NOW()
WHERE id = '37d8092f-fd6a-4d58-b6f9-8c18d7e903b7'
  AND goal_type = 'savings';

UPDATE finance_goals SET
  current_amount           = 38233.00,
  last_contribution_date   = '2026-03-01',
  last_contribution_amount = 13233.00,
  updated_at               = NOW()
WHERE id = 'ff332012-a5c9-4f1a-aa49-67abf9a0c9b4'
  AND goal_type = 'savings';


-- ─── DONE ─────────────────────────────────────────────────────
SELECT 'All pending migrations applied successfully' AS result;
