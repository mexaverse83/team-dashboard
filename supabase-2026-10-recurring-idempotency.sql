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
