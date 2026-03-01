/**
 * POST /api/finance/migrate
 *
 * Secure migration runner. Executes arbitrary SQL against the Supabase
 * database using a direct pg connection (bypasses PostgREST limitations).
 *
 * Auth: requires `x-migration-secret` header matching MIGRATION_SECRET env var.
 * NEVER expose this endpoint publicly. Keep MIGRATION_SECRET strong and secret.
 *
 * Usage:
 *   curl -X POST https://finance.autonomis.co/api/finance/migrate \
 *     -H "x-migration-secret: {MIGRATION_SECRET}" \
 *     -H "Content-Type: application/json" \
 *     -d '{"sql": "SELECT 1;"}'
 *
 * Or run named migrations:
 *   -d '{"migration": "recurring-income"}'
 */

import { NextRequest, NextResponse } from 'next/server'
import { Pool } from 'pg'

const POOLER_REGIONS = [
  'aws-0-us-east-1', 'aws-0-us-east-2', 'aws-0-us-west-1', 'aws-0-us-west-2',
  'aws-0-eu-west-1', 'aws-0-eu-west-2', 'aws-0-eu-central-1',
  'aws-0-ap-southeast-1', 'aws-0-ap-northeast-1', 'aws-0-sa-east-1',
]
const PROJECT_REF = 'ebzvuszpqqtcvwewxcli'
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD || 'BE911529g@'

async function getWorkingPool(): Promise<Pool> {
  // Try primary DB URL first
  const dbUrl = process.env.SUPABASE_DB_URL
  if (dbUrl) {
    const p = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 5000 })
    try { await p.query('SELECT 1'); return p } catch { await p.end().catch(() => {}) }
  }

  // Try pooler across regions (Transaction Pooler port 6543)
  for (const region of POOLER_REGIONS) {
    const url = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(DB_PASSWORD)}@${region}.pooler.supabase.com:6543/postgres`
    const p = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1, connectionTimeoutMillis: 5000 })
    try {
      await p.query('SELECT 1')
      console.log(`Migration: connected via ${region} pooler`)
      return p
    } catch { await p.end().catch(() => {}) }
  }

  throw new Error('Could not connect to database via any method. Check SUPABASE_DB_URL or SUPABASE_DB_PASSWORD env vars.')
}

// Named migrations — add new ones here as needed
const MIGRATIONS: Record<string, string> = {
  'recurring-income': `
    -- Add source column to finance_transactions
    ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

    CREATE INDEX IF NOT EXISTS idx_transactions_source
      ON finance_transactions(source) WHERE source IS NOT NULL;

    -- Create finance_recurring_income table
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

    -- Seed data (idempotent)
    INSERT INTO finance_recurring_income (name, amount, owner, category, recurrence, day_of_month, active)
    VALUES
      ('Nexaminds Salary', 120000.00, 'bernardo', 'salary', 'monthly', 1, true),
      ('Laura Salary',      74000.00, 'laura',    'salary', 'monthly', 1, true),
      ('Aguinaldo (avg)',    3000.00, 'joint',    'bonus',  'monthly', 1, false)
    ON CONFLICT DO NOTHING;

    SELECT 'recurring-income migration complete' AS result;
  `,

  'debt-sync': `
    -- Add debt_id FK to finance_recurring
    ALTER TABLE finance_recurring
      ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES finance_debts(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS finance_debt_payments (
      id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      debt_id          UUID        REFERENCES finance_debts(id) ON DELETE CASCADE,
      payment_date     DATE        NOT NULL,
      amount           NUMERIC(12,2) NOT NULL,
      principal_portion NUMERIC(12,2) NOT NULL,
      interest_portion NUMERIC(12,2) NOT NULL,
      remaining_balance NUMERIC(12,2) NOT NULL,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_debt_payments_debt
      ON finance_debt_payments(debt_id, payment_date DESC);

    SELECT 'debt-sync migration complete' AS result;
  `,

  'gbm-net-rate': `
    -- Set net_annual_rate = annual_rate - commission_rate for all FI rows with a commission
    UPDATE finance_fixed_income
      SET net_annual_rate = annual_rate - commission_rate
    WHERE commission_rate IS NOT NULL;

    SELECT id, name, annual_rate, commission_rate, net_annual_rate
    FROM finance_fixed_income WHERE commission_rate IS NOT NULL;
  `,

  'leak-triage': `
    -- Add leak_status and leak_reviewed_at to finance_recurring
    ALTER TABLE finance_recurring
      ADD COLUMN IF NOT EXISTS leak_status TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS leak_reviewed_at TIMESTAMPTZ DEFAULT NULL;

    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'finance_recurring'
      AND column_name IN ('leak_status', 'leak_reviewed_at');
  `,

  'insights-cache': `
    -- Finance insights cache table
    CREATE TABLE IF NOT EXISTS finance_insights_cache (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      insights_json JSONB     NOT NULL DEFAULT '[]'::jsonb,
      data_snapshot JSONB     DEFAULT '{}'::jsonb,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE finance_insights_cache ENABLE ROW LEVEL SECURITY;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='finance_insights_cache' AND policyname='anon read insights'
      ) THEN
        CREATE POLICY "anon read insights" ON finance_insights_cache FOR SELECT USING (true);
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename='finance_insights_cache' AND policyname='service insert insights'
      ) THEN
        CREATE POLICY "service insert insights" ON finance_insights_cache FOR INSERT WITH CHECK (true);
      END IF;
    END $$;

    SELECT 'insights-cache migration complete' AS result;
  `,

  'goal-savings-sync': `
    -- 1. Monthly savings snapshot table
    CREATE TABLE IF NOT EXISTS finance_monthly_savings (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      month          DATE        NOT NULL UNIQUE,
      gross_income   NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
      net_savings    NUMERIC(12,2) GENERATED ALWAYS AS (gross_income - total_expenses) STORED,
      savings_rate   NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE WHEN gross_income > 0
          THEN ROUND((gross_income - total_expenses) / gross_income * 100, 2)
          ELSE 0 END
      ) STORED,
      notes          TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 2. Add last_contribution_date to finance_goals for display
    ALTER TABLE finance_goals
      ADD COLUMN IF NOT EXISTS last_contribution_date DATE DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS last_contribution_amount NUMERIC(12,2) DEFAULT NULL;

    -- 3. Backfill February snapshot
    INSERT INTO finance_monthly_savings (month, gross_income, total_expenses, notes)
    VALUES ('2026-02-01', 197083.00, 115094.92, 'Manual backfill — Feb 2026 actuals')
    ON CONFLICT (month) DO NOTHING;

    -- 4. Backfill goal contributions (Bernardo $170K, Laura $75K)
    UPDATE finance_goals SET
      current_amount = 170000,
      last_contribution_date = '2026-03-01',
      last_contribution_amount = 70000,
      updated_at = NOW()
    WHERE id = '37d8092f-fd6a-4d58-b6f9-8c18d7e903b7'
      AND goal_type = 'savings';

    UPDATE finance_goals SET
      current_amount = 75000,
      last_contribution_date = '2026-03-01',
      last_contribution_amount = 50000,
      updated_at = NOW()
    WHERE id = 'ff332012-a5c9-4f1a-aa49-67abf9a0c9b4'
      AND goal_type = 'savings';

    SELECT 'goal-savings-sync migration complete' AS result;
  `,

  'backfill-feb28': `
    -- Backfill missing Feb 28 transactions for WEST and BBVA
    INSERT INTO finance_transactions (
      type, amount, currency, amount_mxn,
      category_id, merchant, description,
      transaction_date, is_recurring, recurring_id, tags, owner
    )
    SELECT
      'expense', r.amount, COALESCE(r.currency, 'MXN'), r.amount,
      r.category_id, COALESCE(r.merchant, r.name),
      'Auto: ' || r.name || ' (recurring — Feb 28 backfill)',
      '2026-02-28', true, r.id, ARRAY['auto-recurring', 'backfill'], r.owner
    FROM finance_recurring r
    WHERE r.name ILIKE '%WEST%'
      AND r.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM finance_transactions t
        WHERE t.recurring_id = r.id AND t.transaction_date = '2026-02-28'
      );

    INSERT INTO finance_transactions (
      type, amount, currency, amount_mxn,
      category_id, merchant, description,
      transaction_date, is_recurring, recurring_id, tags, owner
    )
    SELECT
      'expense', r.amount, COALESCE(r.currency, 'MXN'), r.amount,
      r.category_id, COALESCE(r.merchant, r.name),
      'Auto: ' || r.name || ' (recurring — Feb 28 backfill)',
      '2026-02-28', true, r.id, ARRAY['auto-recurring', 'backfill'], r.owner
    FROM finance_recurring r
    WHERE r.name ILIKE '%BBVA%'
      AND r.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM finance_transactions t
        WHERE t.recurring_id = r.id AND t.transaction_date = '2026-02-28'
      );

    -- Fix stuck next_due_date if still at Feb 28
    UPDATE finance_recurring SET next_due_date = '2026-03-28'
    WHERE name ILIKE '%WEST%' AND next_due_date = '2026-02-28';

    UPDATE finance_recurring SET next_due_date = '2026-03-28'
    WHERE name ILIKE '%BBVA%' AND next_due_date = '2026-02-28';

    SELECT 'backfill-feb28 complete' AS result;
  `,
}

export async function POST(req: NextRequest) {
  // Auth check
  const secret = req.headers.get('x-migration-secret')
  const expected = process.env.MIGRATION_SECRET
  if (!expected || !secret || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { sql?: string; migration?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { sql, migration } = body

  // Resolve SQL
  let query: string
  if (migration) {
    if (!MIGRATIONS[migration]) {
      return NextResponse.json({
        error: `Unknown migration: ${migration}`,
        available: Object.keys(MIGRATIONS),
      }, { status: 400 })
    }
    query = MIGRATIONS[migration]
  } else if (sql) {
    query = sql
  } else {
    return NextResponse.json({
      error: 'Provide either "sql" (raw SQL string) or "migration" (named migration key)',
      available: Object.keys(MIGRATIONS),
    }, { status: 400 })
  }

  let pool: Pool | null = null
  const start = Date.now()
  try {
    pool = await getWorkingPool()
    const result = await pool.query(query)
    const elapsed = Date.now() - start
    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsed,
      migration: migration || null,
      rows: result.rows,
      rowCount: result.rowCount,
      command: result.command,
    })
  } catch (err) {
    const elapsed = Date.now() - start
    return NextResponse.json({
      ok: false,
      elapsed_ms: elapsed,
      error: (err as Error).message,
    }, { status: 500 })
  } finally {
    if (pool) await pool.end().catch(() => {})
  }
}

// GET — list available named migrations (auth required)
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-migration-secret')
  const expected = process.env.MIGRATION_SECRET
  if (!expected || !secret || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ available: Object.keys(MIGRATIONS) })
}
