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


-- ─── AUTO-CATEGORIZATION RULES + ANOMALY FLAGS + NET WORTH SNAPSHOTS ─────

CREATE TABLE IF NOT EXISTS finance_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_pattern text NOT NULL,
  match_mode text NOT NULL DEFAULT 'contains' CHECK (match_mode IN ('contains', 'exact', 'starts_with')),
  amount_min numeric,
  amount_max numeric,
  owner text,
  category_id uuid REFERENCES finance_categories(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  learned boolean NOT NULL DEFAULT false,
  match_count integer NOT NULL DEFAULT 0,
  last_matched_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_rules_active ON finance_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_finance_rules_pattern ON finance_rules(merchant_pattern);

ALTER TABLE finance_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_rules_all" ON finance_rules;
CREATE POLICY "finance_rules_all" ON finance_rules FOR ALL USING (true) WITH CHECK (true);

-- Anomaly / price-change flags column on transactions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'finance_transactions' AND column_name = 'flags') THEN
    ALTER TABLE finance_transactions ADD COLUMN flags text[] DEFAULT '{}';
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_flags
  ON finance_transactions USING gin(flags);

-- Net worth snapshots
CREATE TABLE IF NOT EXISTS finance_net_worth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  total_assets numeric NOT NULL DEFAULT 0,
  total_liabilities numeric NOT NULL DEFAULT 0,
  net_worth numeric GENERATED ALWAYS AS (total_assets - total_liabilities) STORED,
  cash_amount numeric DEFAULT 0,
  crypto_amount numeric DEFAULT 0,
  stocks_amount numeric DEFAULT 0,
  fixed_income_amount numeric DEFAULT 0,
  real_estate_amount numeric DEFAULT 0,
  retirement_amount numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nws_date ON finance_net_worth_snapshots(snapshot_date DESC);
ALTER TABLE finance_net_worth_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "finance_nws_all" ON finance_net_worth_snapshots;
CREATE POLICY "finance_nws_all" ON finance_net_worth_snapshots FOR ALL USING (true) WITH CHECK (true);

-- ─── PAYMENT METHOD ──────────────────────────────────────────

-- Payment method on transactions (BBVA Infinite, Amex, cash, transfer).
-- Used to total each owner's BBVA Infinite statement (corte 9, pago 29).
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT NULL;

ALTER TABLE finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_payment_method_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('bbva_infinite', 'amex', 'cash', 'transfer'));

CREATE INDEX IF NOT EXISTS idx_transactions_payment_method
  ON finance_transactions(payment_method, transaction_date) WHERE payment_method IS NOT NULL;

-- Payment method on subscriptions, copied onto the transactions the
-- recurring processor creates (so BBVA-charged subscriptions hit the card).
ALTER TABLE finance_recurring
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT NULL;

ALTER TABLE finance_recurring
  DROP CONSTRAINT IF EXISTS finance_recurring_payment_method_check;
ALTER TABLE finance_recurring
  ADD CONSTRAINT finance_recurring_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('bbva_infinite', 'amex', 'cash', 'transfer'));

-- Sub-peso coins (KAS, etc.) lost precision: prices and average cost were
-- stored with only 2 decimals. Widen to 8 and recover exact per-coin prices
-- from the stored totals (total_mxn was computed from the unrounded price).
ALTER TABLE crypto_transactions
  ALTER COLUMN price_per_coin_mxn TYPE NUMERIC(18,8);
ALTER TABLE finance_crypto_holdings
  ALTER COLUMN avg_cost_basis_usd TYPE NUMERIC(18,8);

UPDATE crypto_transactions
  SET price_per_coin_mxn = total_mxn / quantity
  WHERE quantity > 0 AND total_mxn IS NOT NULL;

-- ═══ 2026-10 (Mona v2 WS6) ═══════════════════════════════════
-- Copies of the files below, in dependency order. NOT part of this
-- block (need a decision first): supabase-2026-10-rls-lockdown.sql (NU-3)
-- and supabase-2026-10-pg-cron.sql (NU-4).

-- ─── AUTOMATION RUN LEDGER + HEARTBEATS (supabase-2026-10-automation-runs.sql) ───
-- Automation run ledger + per-job heartbeats (AUTO-06, CH-22).
-- Written only by the service role (API routes); read by signed-in users.
-- Idempotent. NOT applied by agents — run in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS finance_automation_runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job           TEXT        NOT NULL,
  trigger       TEXT,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  ok            BOOLEAN     NOT NULL DEFAULT true,
  status        TEXT        NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'warning', 'error')),
  created_count INTEGER     NOT NULL DEFAULT 0,
  details       JSONB,
  error         TEXT,
  -- Reminders and other one-shot sends claim a key like
  -- 'card-due:BBVA Infinite:Laura:2026-10-29'; the unique index makes the
  -- second claim a no-op, so a retried cron never double-sends.
  dedupe_key    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_job_started
  ON finance_automation_runs(job, started_at DESC);
-- Plain (not partial) unique index: NULL keys never conflict, and PostgREST
-- upserts can target it with on_conflict=dedupe_key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_runs_dedupe_key
  ON finance_automation_runs(dedupe_key);

CREATE TABLE IF NOT EXISTS finance_automation_heartbeats (
  job              TEXT        PRIMARY KEY,
  last_run_at      TIMESTAMPTZ,
  last_ok_at       TIMESTAMPTZ,
  last_status      TEXT        CHECK (last_status IN ('ok', 'warning', 'error')),
  last_error       TEXT,
  last_trigger     TEXT,
  expected_every_h NUMERIC,
  details          JSONB,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finance_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_automation_heartbeats ENABLE ROW LEVEL SECURITY;

-- The service role bypasses RLS; these policies only grant signed-in reads.
DROP POLICY IF EXISTS "authenticated read automation runs" ON finance_automation_runs;
CREATE POLICY "authenticated read automation runs" ON finance_automation_runs
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "authenticated read automation heartbeats" ON finance_automation_heartbeats;
CREATE POLICY "authenticated read automation heartbeats" ON finance_automation_heartbeats
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON finance_automation_runs, finance_automation_heartbeats FROM anon;
REVOKE INSERT, UPDATE, DELETE ON finance_automation_runs, finance_automation_heartbeats FROM authenticated;

-- Keep 180 days of runs (heartbeats are one row per job). Run manually or
-- schedule it next to the jobs in supabase-2026-10-pg-cron.sql:
--   DELETE FROM finance_automation_runs
--    WHERE dedupe_key IS NULL AND started_at < now() - interval '180 days';

-- ─── RECURRING PROCESSOR IDEMPOTENCY + SCHEDULE FIELDS (supabase-2026-10-recurring-idempotency.sql) ───
-- Recurring processor: database-level idempotency and schedule fields
-- (AUTO-10, AUTO-11, AUTO-13, F08, F10, F17). NOT applied by agents.
--
-- 1. New columns (all nullable, safe on a live table).
-- 2. Backfill installment_number from the processor's "(n/N)" descriptions.
-- 3. REPORT existing duplicates. Each unique index is created only when its
--    duplicate report is empty; otherwise a NOTICE lists what to clean up and
--    the rest of the migration still runs. Re-run after cleaning.
--
-- Indexes are plain (not partial): NULL keys never conflict, and PostgREST's
-- on_conflict=(a,b) can only target a non-partial index.

-- ─── 1. Columns ───────────────────────────────────────────────
ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS recurring_income_id UUID,
  ADD COLUMN IF NOT EXISTS income_source_id    UUID,
  ADD COLUMN IF NOT EXISTS installment_number  INTEGER;

-- WEST stops after March 2027 (F10): the processor skips and deactivates past end_date.
ALTER TABLE finance_recurring
  ADD COLUMN IF NOT EXISTS end_date DATE;

-- Raises become a new row with a later start_date; the old row gets an end_date (AUTO-11).
ALTER TABLE finance_recurring_income
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date   DATE;

-- Yearly/quarterly sources post in pay_month (aguinaldo = 12, F08); income is
-- attributed to an owner instead of NULL (F17). Lowercase, like the other
-- source tables; the processor canonicalizes on insert.
ALTER TABLE finance_income_sources
  ADD COLUMN IF NOT EXISTS owner     TEXT,
  ADD COLUMN IF NOT EXISTS pay_month INTEGER CHECK (pay_month IS NULL OR pay_month BETWEEN 1 AND 12);

-- ─── 2. Backfill MSI payment numbers ─────────────────────────
UPDATE finance_transactions
   SET installment_number = (regexp_match(description, '\((\d+)/\d+\)'))[1]::int
 WHERE installment_id IS NOT NULL
   AND installment_number IS NULL
   AND description ~ '\(\d+/\d+\)';

-- ─── 3. Duplicate report + unique indexes ────────────────────
DO $$
DECLARE
  v_dupes integer;
  v_row record;
BEGIN
  -- Subscriptions: one post per recurring item per due date.
  SELECT count(*) INTO v_dupes FROM (
    SELECT recurring_id, transaction_date FROM finance_transactions
     WHERE recurring_id IS NOT NULL
     GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v_dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_recurring_period
      ON finance_transactions(recurring_id, transaction_date);
  ELSE
    RAISE NOTICE 'uq_tx_recurring_period NOT created: % duplicate (recurring_id, transaction_date) groups', v_dupes;
    FOR v_row IN SELECT recurring_id, transaction_date, count(*) AS n, array_agg(id) AS ids
                   FROM finance_transactions WHERE recurring_id IS NOT NULL
                  GROUP BY 1, 2 HAVING count(*) > 1 LOOP
      RAISE NOTICE '  recurring % on %: % rows %', v_row.recurring_id, v_row.transaction_date, v_row.n, v_row.ids;
    END LOOP;
  END IF;

  -- Recurring income: one post per row per pay date.
  SELECT count(*) INTO v_dupes FROM (
    SELECT recurring_income_id, transaction_date FROM finance_transactions
     WHERE recurring_income_id IS NOT NULL
     GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v_dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_recurring_income_period
      ON finance_transactions(recurring_income_id, transaction_date);
  ELSE
    RAISE NOTICE 'uq_tx_recurring_income_period NOT created: % duplicate groups', v_dupes;
  END IF;

  -- Income sources: one post per source per date.
  SELECT count(*) INTO v_dupes FROM (
    SELECT income_source_id, transaction_date FROM finance_transactions
     WHERE income_source_id IS NOT NULL
     GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v_dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_income_source_period
      ON finance_transactions(income_source_id, transaction_date);
  ELSE
    RAISE NOTICE 'uq_tx_income_source_period NOT created: % duplicate groups', v_dupes;
  END IF;

  -- MSI: one post per installment payment number.
  SELECT count(*) INTO v_dupes FROM (
    SELECT installment_id, installment_number FROM finance_transactions
     WHERE installment_id IS NOT NULL AND installment_number IS NOT NULL
     GROUP BY 1, 2 HAVING count(*) > 1) d;
  IF v_dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_installment_number
      ON finance_transactions(installment_id, installment_number);
  ELSE
    RAISE NOTICE 'uq_tx_installment_number NOT created: % duplicate (installment_id, installment_number) groups', v_dupes;
    FOR v_row IN SELECT installment_id, installment_number, count(*) AS n, array_agg(id) AS ids
                   FROM finance_transactions WHERE installment_id IS NOT NULL AND installment_number IS NOT NULL
                  GROUP BY 1, 2 HAVING count(*) > 1 LOOP
      RAISE NOTICE '  installment % payment %: % rows %', v_row.installment_id, v_row.installment_number, v_row.n, v_row.ids;
    END LOOP;
  END IF;
END $$;

-- Recurring-income names with more than one active row (AUTO-11): the
-- processor posts the latest start_date ≤ today; review the others.
SELECT name, count(*) AS active_rows, array_agg(amount ORDER BY start_date NULLS FIRST) AS amounts,
       array_agg(start_date ORDER BY start_date NULLS FIRST) AS start_dates
  FROM finance_recurring_income
 WHERE active
 GROUP BY name
HAVING count(*) > 1;

-- ─── ATOMIC MSI POSTING (supabase-2026-10-msi-atomic.sql) ───
-- Atomic MSI posting (AUTO-10, AUTO-13). Inserting the payment and advancing
-- payments_made used to be two statements; a crash in between left the plan a
-- month long. This function does both in one transaction, under a row lock.
-- Requires supabase-2026-10-recurring-idempotency.sql (installment_number).
-- Service role only. NOT applied by agents.
CREATE OR REPLACE FUNCTION public.finance_post_msi_payment(
  p_installment_id uuid,
  p_number integer,
  p_tx jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_msi finance_installments%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_msi FROM finance_installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'installment % not found', p_installment_id;
  END IF;
  IF p_number IS NULL OR p_number < 1 OR p_number > v_msi.installment_count THEN
    RAISE EXCEPTION 'payment % is outside 1..%', p_number, v_msi.installment_count;
  END IF;

  -- Already posted (by number, or a legacy row whose description says "(n/N)"):
  -- repair a lagging payments_made and report "nothing new".
  IF coalesce(v_msi.payments_made, 0) >= p_number OR EXISTS (
    SELECT 1 FROM finance_transactions
     WHERE installment_id = p_installment_id
       AND (installment_number = p_number
            OR (installment_number IS NULL AND description LIKE '%(' || p_number || '/' || v_msi.installment_count || ')%'))
  ) THEN
    UPDATE finance_installments
       SET payments_made = greatest(coalesce(payments_made, 0), p_number),
           is_active = greatest(coalesce(payments_made, 0), p_number) < installment_count,
           updated_at = now()
     WHERE id = p_installment_id;
    RETURN NULL;
  END IF;
  IF coalesce(v_msi.payments_made, 0) + 1 <> p_number THEN
    RAISE EXCEPTION 'payment % cannot post before payment %', p_number, coalesce(v_msi.payments_made, 0) + 1;
  END IF;

  INSERT INTO finance_transactions (
    type, amount, currency, amount_mxn, category_id, merchant, description,
    transaction_date, is_recurring, tags, owner, payment_method,
    installment_id, installment_number
  ) VALUES (
    'expense',
    (p_tx->>'amount')::numeric,
    coalesce(p_tx->>'currency', 'MXN'),
    coalesce((p_tx->>'amount_mxn')::numeric, (p_tx->>'amount')::numeric),
    nullif(p_tx->>'category_id', '')::uuid,
    p_tx->>'merchant',
    p_tx->>'description',
    (p_tx->>'transaction_date')::date,
    true,
    coalesce(ARRAY(SELECT jsonb_array_elements_text(p_tx->'tags')), ARRAY['auto-msi']),
    p_tx->>'owner',
    p_tx->>'payment_method',
    p_installment_id,
    p_number
  )
  RETURNING id INTO v_id;

  UPDATE finance_installments
     SET payments_made = p_number,
         is_active = p_number < installment_count,
         updated_at = now()
   WHERE id = p_installment_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_post_msi_payment(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_post_msi_payment(uuid, integer, jsonb) TO service_role;

-- ─── BABY CHECKLIST STATUS (supabase-2026-10-checklist-status.sql) ───
-- Baby-plan checklist completion (OPP-04). The items live in code
-- (src/lib/baby-plan.ts BABY_CHECKLIST); this table only records which are
-- done. Signed-in household members may read and write; anon gets nothing.
-- Idempotent. NOT applied by agents.
CREATE TABLE IF NOT EXISTS finance_checklist_status (
  item_id    TEXT        PRIMARY KEY,
  done_at    TIMESTAMPTZ,
  done_by    TEXT,
  note       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE finance_checklist_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated manage checklist status" ON finance_checklist_status;
CREATE POLICY "authenticated manage checklist status" ON finance_checklist_status
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON finance_checklist_status FROM anon;

-- ─── DONE ─────────────────────────────────────────────────────
SELECT 'All pending migrations applied successfully' AS result;
