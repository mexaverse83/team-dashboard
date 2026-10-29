-- ============================================================
-- OPTIONAL scheduler: Supabase pg_cron + pg_net (AUTO-03, NU-4).
-- TEMPLATE — NOT APPLIED and NOT part of supabase-run-all-pending-migrations.sql.
-- ============================================================
-- Vercel cron (vercel.json, Bearer CRON_SECRET) is the configured primary.
-- Use THIS instead only if Vercel cron keeps not firing. Then remove the
-- "crons" block from vercel.json so there is exactly one primary trigger
-- (posts are idempotent either way, but two schedulers double the noise).
--
-- Setup:
--   1. Dashboard → Database → Extensions: enable pg_cron and pg_net.
--   2. Store the SAME value as Vercel's CRON_SECRET in Vault (never inline it
--      in cron.job — that table is readable by roles with pg_cron access):
--        SELECT vault.create_secret('<CRON_SECRET value>', 'finance_cron_secret');
--   3. Run this file. Check runs in cron.job_run_details and
--      net._http_response, and in the app's automation panel (/api/finance/health).
-- Times are UTC; Mexico City is UTC−6 all year (no DST since 2022).

CREATE OR REPLACE FUNCTION public.finance_call_job(p_path text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'finance_cron_secret';
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Vault secret finance_cron_secret is missing';
  END IF;
  -- GET + Bearer CRON_SECRET is the same request Vercel cron sends, so the
  -- routes treat it as method 'cron' (writes on GET, logged as trigger 'cron').
  RETURN net.http_get(
    url := 'https://finance.autonomis.co' || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'x-automation-trigger', 'pg_cron'),
    timeout_milliseconds := 60000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.finance_call_job(text) FROM PUBLIC, anon, authenticated;

-- cron.schedule upserts by job name, so re-running this file is safe.
SELECT cron.schedule('finance-process-recurring', '5 12 * * *',  $$SELECT public.finance_call_job('/api/finance/process-recurring')$$); -- 06:05 CDMX
SELECT cron.schedule('finance-net-worth',         '15 12 * * *', $$SELECT public.finance_call_job('/api/finance/net-worth')$$);         -- 06:15 CDMX
SELECT cron.schedule('finance-push-daily',        '0 14 * * *',  $$SELECT public.finance_call_job('/api/finance/push/daily')$$);        -- 08:00 CDMX
SELECT cron.schedule('finance-reminders',         '0 1 * * *',   $$SELECT public.finance_call_job('/api/finance/reminders')$$);         -- 19:00 CDMX
SELECT cron.schedule('finance-runs-retention',    '30 3 * * 0',
  $$DELETE FROM finance_automation_runs WHERE dedupe_key IS NULL AND started_at < now() - interval '180 days'$$);

-- To remove:  SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'finance-%';
