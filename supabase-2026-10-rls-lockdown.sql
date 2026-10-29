-- ============================================================
-- RLS LOCKDOWN (CH-01, AUTO-14) — NOT APPLIED. Needs the household's
-- decision (NU-3). Read the runbook below before running anything.
-- ============================================================
--
-- Today the anon key (shipped in every JS bundle) can read — and per the repo
-- SQL, write — every finance table (`USING (true)` policies). This file:
--   1. adds is_household(): true only for a signed-in allow-listed email,
--   2. drops EVERY existing policy on the finance tables below,
--   3. re-creates one `TO authenticated USING (is_household())` policy each,
--   4. makes the automation and push tables service-role only,
--   5. revokes anon's table grants as a second layer.
-- finance_monthly_savings is deliberately NOT touched: its policies are being
-- reworked separately (supabase-fix-monthly-savings-rls.sql /
-- supabase-revert-monthly-savings-rls.sql, the household's own files).
--
-- RUNBOOK (in this order):
--   a. Confirm SUPABASE_SERVICE_ROLE_KEY is set in Vercel (Production) and
--      GET /api/finance/health shows checks.service_key_present = true.
--      Every API route uses the service role; without it they answer 503.
--   b. Move the home-PC scripts off the anon key: scripts/generate-insights-codex.mjs
--      and scripts/send-push.mjs already write through the API with
--      FINANCE_API_KEY, but send-push.mjs's LOCAL fallback (used only when
--      Vercel has no VAPID key) reads finance_push_subscriptions directly — add
--      SUPABASE_SERVICE_ROLE_KEY to .env.local or that fallback stops sending.
--      scripts/wolff-chat-daemon.mjs still reads and writes
--      finance_wolff_chat with the anon key — give it the service-role key
--      (or route it through /api/finance/wolff-chat) BEFORE step c, or Mona's
--      chat stops answering.
--   c. Apply this file in the Supabase SQL editor.
--   d. Verify: `npm run rls:check` (GET-only anon count queries) must report 0
--      readable rows on every table; open the app signed in and check home,
--      transactions and budgets load.
--   e. Rotate: the anon key is public by design, so "rotating" means rotating
--      the JWT secret (or moving to the new publishable/secret keys). That
--      invalidates the service-role key too — update Vercel, GitHub Actions
--      and .env.local together, then re-run step d.
--   f. Local dev with NEXT_PUBLIC_AUTH_BYPASS=1 now sees empty tables through
--      the browser client; sign in with a household account, or run dev with
--      the service-role key in .env.local.
-- Rollback: re-create the previous policies from supabase-finance-schema.sql etc.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_household()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(lower(auth.jwt() ->> 'email') = ANY (ARRAY[
    'bernardo.gza83@gmail.com',
    'lcampomtz89@gmail.com',
    'bernardo.garza@nexaminds.ai'
  ]), false)
$$;
REVOKE ALL ON FUNCTION public.is_household() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household() TO authenticated, service_role;

DO $$
DECLARE
  -- Household data: signed-in household members only.
  v_household text[] := ARRAY[
    'finance_transactions', 'finance_categories', 'finance_budgets', 'finance_recurring',
    'finance_goals', 'finance_income_sources', 'finance_debts', 'finance_debt_payments',
    'finance_installments', 'finance_recurring_income', 'finance_rules',
    'finance_net_worth_snapshots', 'finance_portfolio_snapshots', 'finance_crypto_holdings',
    'crypto_transactions', 'finance_stock_holdings', 'finance_fixed_income',
    'finance_real_estate', 'finance_real_estate_targets', 'finance_retirement',
    'finance_emergency_fund', 'finance_insights_cache', 'finance_wolff_chat',
    'finance_audit_reports', 'finance_checklist_status'
  ];
  -- Written and read only by API routes (service role bypasses RLS).
  v_service_only text[] := ARRAY[
    'finance_automation_runs', 'finance_automation_heartbeats', 'finance_push_subscriptions'
  ];
  v_table text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY v_household || v_service_only LOOP
    IF to_regclass('public.' || v_table) IS NULL THEN
      RAISE NOTICE 'skip %: table does not exist', v_table;
      CONTINUE;
    END IF;
    FOR v_policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_table);
    IF v_table = ANY (v_household) THEN
      EXECUTE format(
        'CREATE POLICY household_all ON public.%I FOR ALL TO authenticated USING (public.is_household()) WITH CHECK (public.is_household())',
        v_table);
    ELSE
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v_table);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Review: every finance table with its policies after the lockdown.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_on,
       coalesce(string_agg(p.policyname || ' → ' || array_to_string(p.roles, ','), '; '), '(no policies: service role only)') AS policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = c.relname
 WHERE c.relkind = 'r' AND (c.relname LIKE 'finance\_%' OR c.relname = 'crypto_transactions')
 GROUP BY c.relname, c.relrowsecurity
 ORDER BY c.relname;
