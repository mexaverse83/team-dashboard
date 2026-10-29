/**
 * POST /api/finance/migrate
 *
 * Runs one NAMED migration (below) via the Supabase Management API. Raw SQL
 * is not accepted (CH-04). Disabled unless ENABLE_MIGRATE_ROUTE=1, and then
 * requires BOTH a finance credential (authorizeFinanceRequest) and the
 * `x-migration-secret` header (compared in constant time). Prefer the SQL
 * editor or `supabase db push`; revoke SUPABASE_MANAGEMENT_TOKEN when unused.
 *
 *   curl -X POST https://finance.autonomis.co/api/finance/migrate \
 *     -H "x-api-key: $FINANCE_API_KEY" -H "x-migration-secret: $MIGRATION_SECRET" \
 *     -H "Content-Type: application/json" -d '{"migration": "recurring-income"}'
 */

import { NextRequest, NextResponse } from 'next/server'
import { authorizeFinanceRequest, safeEqual } from '@/lib/finance-api-auth'

const PROJECT_REF = 'ebzvuszpqqtcvwewxcli'

/**
 * Runs a named migration's SQL via the Supabase Management API.
 * Requires SUPABASE_MANAGEMENT_TOKEN env var (Personal Access Token from
 * app.supabase.com/account/tokens). No TCP connection needed — pure HTTPS.
 */
async function runSqlViaManagementApi(sql: string): Promise<{ rows: unknown[]; rowCount: number; command: string }> {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN
  if (!token) throw new Error('SUPABASE_MANAGEMENT_TOKEN env var not set. Generate a PAT at app.supabase.com/account/tokens.')

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  const data = await res.json()

  if (!res.ok) {
    const msg = data?.message || data?.error || JSON.stringify(data)
    throw new Error(`Management API error ${res.status}: ${msg}`)
  }

  // API returns array of row objects
  const rows = Array.isArray(data) ? data : (data?.result ?? data?.rows ?? [])
  return { rows, rowCount: rows.length, command: 'SQL' }
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

  'push-subscriptions': `
    CREATE TABLE IF NOT EXISTS finance_push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      endpoint TEXT NOT NULL UNIQUE,
      subscription JSONB NOT NULL,
      owner TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE finance_push_subscriptions ENABLE ROW LEVEL SECURITY;

    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_push_subscriptions' AND policyname='all read push subs') THEN
        CREATE POLICY "all read push subs" ON finance_push_subscriptions FOR SELECT USING (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_push_subscriptions' AND policyname='all insert push subs') THEN
        CREATE POLICY "all insert push subs" ON finance_push_subscriptions FOR INSERT WITH CHECK (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_push_subscriptions' AND policyname='all update push subs') THEN
        CREATE POLICY "all update push subs" ON finance_push_subscriptions FOR UPDATE USING (true);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='finance_push_subscriptions' AND policyname='all delete push subs') THEN
        CREATE POLICY "all delete push subs" ON finance_push_subscriptions FOR DELETE USING (true);
      END IF;
    END $$;

    SELECT 'push-subscriptions migration complete' AS result;
  `,

  'finance-installments-sync': `
    -- Add installment_id to transactions for proper dupe-guarding
    ALTER TABLE finance_transactions
      ADD COLUMN IF NOT EXISTS installment_id UUID REFERENCES finance_installments(id) ON DELETE SET NULL;

    -- Index for fast monthly dupe checks
    CREATE INDEX IF NOT EXISTS idx_transactions_installment_id
      ON finance_transactions(installment_id)
      WHERE installment_id IS NOT NULL;

    SELECT 'finance-installments-sync migration complete' AS result;
  `,

  'goal-savings-sync': `
    -- 1. Monthly savings snapshot table — per-owner rows
    CREATE TABLE IF NOT EXISTS finance_monthly_savings (
      id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
      month                DATE          NOT NULL,
      owner                TEXT          NOT NULL,  -- 'bernardo' | 'laura' | 'total'
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

    -- 2. Add columns to finance_goals for display
    ALTER TABLE finance_goals
      ADD COLUMN IF NOT EXISTS last_contribution_date DATE DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS last_contribution_amount NUMERIC(12,2) DEFAULT NULL;

    -- 3. Backfill February per-owner actuals
    --    Bernardo: income $125K, expenses $56,245, net $68,755, planned $70K
    --    Laura:    income $68K,  expenses $54,767, net $13,233, planned $50K
    --    Total:    income $193K, expenses $111,012, net $81,988, planned $120K
    INSERT INTO finance_monthly_savings
      (month, owner, gross_income, total_expenses, planned_contribution, notes)
    VALUES
      ('2026-02-01', 'bernardo', 125000.00,  56244.92,  70000.00, 'Feb 2026 backfill'),
      ('2026-02-01', 'laura',     68000.00,  54767.00,  50000.00, 'Feb 2026 backfill'),
      ('2026-02-01', 'total',    193000.00, 111011.92, 120000.00, 'Feb 2026 backfill')
    ON CONFLICT (month, owner) DO NOTHING;

    -- 4. Apply Feb actual balances to goals (already applied via REST — idempotent)
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

async function guard(req: NextRequest): Promise<NextResponse | null> {
  if (process.env.ENABLE_MIGRATE_ROUTE !== '1') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const auth = await authorizeFinanceRequest(req)
  if (!auth.ok) return auth.response
  if (!safeEqual(req.headers.get('x-migration-secret'), process.env.MIGRATION_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export async function POST(req: NextRequest) {
  const denied = await guard(req)
  if (denied) return denied

  let body: { sql?: string; migration?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { migration } = body
  if (body.sql) {
    return NextResponse.json({ error: 'Raw SQL is not accepted; run a named migration', available: Object.keys(MIGRATIONS) }, { status: 400 })
  }
  if (!migration || !Object.prototype.hasOwnProperty.call(MIGRATIONS, migration)) {
    return NextResponse.json({
      error: migration ? `Unknown migration: ${migration}` : 'Provide "migration" (named migration key)',
      available: Object.keys(MIGRATIONS),
    }, { status: 400 })
  }
  const query = MIGRATIONS[migration]

  const start = Date.now()
  try {
    const result = await runSqlViaManagementApi(query)
    const elapsed = Date.now() - start
    return NextResponse.json({
      ok: true,
      elapsed_ms: elapsed,
      migration,
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
  }
}

// GET — list available named migrations (same guard)
export async function GET(req: NextRequest) {
  const denied = await guard(req)
  if (denied) return denied
  return NextResponse.json({ available: Object.keys(MIGRATIONS) })
}
