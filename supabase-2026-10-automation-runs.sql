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
